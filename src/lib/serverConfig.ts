import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import diff3Merge, { Diff3Chunk } from 'diff3';
import { CLUSTER_DIR } from './cluster';

const SERVER_DIR = path.join(CLUSTER_DIR, 'server');

const CONFIG_FILENAMES = ['GameUserSettings.ini', 'Game.ini'] as const;

export type ConfigFilename = (typeof CONFIG_FILENAMES)[number];
export type ConfigSaveTarget = 'ini' | 'tmp';

export type PendingConfigTempFile = {
  filename: ConfigFilename;
  iniPath: string;
  tmpPath: string;
};

type SavePathInfo = {
  target: ConfigSaveTarget;
  filePath: string;
};

export function getServerConfigPath(filename: string): string {
  // Only allow specific files for security
  if (!CONFIG_FILENAMES.includes(filename as ConfigFilename)) {
    throw new Error('Invalid config filename');
  }
  return path.join(SERVER_DIR, filename);
}

function getServerConfigTmpPath(filename: string): string {
  return `${getServerConfigPath(filename)}.tmp`;
}

function resolvePathForTarget(filename: string, target: ConfigSaveTarget): SavePathInfo {
  const iniPath = getServerConfigPath(filename);
  if (target === 'tmp') {
    return {
      target,
      filePath: `${iniPath}.tmp`,
    };
  }

  return {
    target,
    filePath: iniPath,
  };
}

const ADMIN_PASSWORD_REGEX = /^ServerAdminPassword=.*\r?\n/m;
const ADMIN_PASSWORD_EOF_REGEX = /^ServerAdminPassword=.*$/m;

type SaveStatus = 'saved' | 'merged' | 'conflict';

export type ConfigMergeConflict = {
  mergedPreview: string;
  chunks: Array<{
    index: number;
    base: string;
    current: string;
    yours: string;
  }>;
};

export type ReadServerConfigResult = {
  content: string;
  revision: string;
  sourceTarget: ConfigSaveTarget;
  pendingTemp: boolean;
};

export type SaveServerConfigInput = {
  baseContent: string;
  baseRevision: string;
  newContent: string;
  saveTarget?: ConfigSaveTarget;
};

export type SaveServerConfigResult = {
  status: SaveStatus;
  message: string;
  content: string;
  revision: string;
  saveTarget: ConfigSaveTarget;
  pendingTemp: boolean;
  conflict?: ConfigMergeConflict;
};

function toLineArray(content: string): string[] {
  const lines = content.match(/[^\n]*\n|[^\n]+$/g);
  return lines ?? [];
}

function fromLineArray(lines: string[]): string {
  return lines.join('');
}

function removeAdminPassword(content: string): string {
  // Remove ServerAdminPassword line for security, including the newline
  let sanitized = content.replace(ADMIN_PASSWORD_REGEX, '');
  // Also check for the case where it might be at the end of the file without a trailing newline
  sanitized = sanitized.replace(ADMIN_PASSWORD_EOF_REGEX, '');
  return sanitized;
}

function sanitizeConfigContent(filename: string, content: string): string {
  if (filename === 'GameUserSettings.ini') {
    return removeAdminPassword(content);
  }
  return content;
}

function buildRevision(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

function readRawConfigByPath(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function readRawServerConfig(filename: string, target: ConfigSaveTarget = 'ini'): string {
  const { filePath } = resolvePathForTarget(filename, target);
  return readRawConfigByPath(filePath);
}

function readRawCurrentContentForSaveTarget(filename: string, saveTarget: ConfigSaveTarget): string {
  if (saveTarget === 'tmp') {
    const tmpPath = getServerConfigTmpPath(filename);
    if (fs.existsSync(tmpPath)) {
      return readRawConfigByPath(tmpPath);
    }
  }

  return readRawServerConfig(filename, 'ini');
}

function extractOriginalPasswordLine(content: string): string {
  const match = content.match(ADMIN_PASSWORD_REGEX) || content.match(ADMIN_PASSWORD_EOF_REGEX);
  let originalPasswordLine = match ? match[0] : '';

  if (originalPasswordLine && !originalPasswordLine.endsWith('\n')) {
    originalPasswordLine += '\n';
  }

  return originalPasswordLine;
}

function restorePasswordLine(content: string, originalPasswordLine: string): string {
  if (!originalPasswordLine) {
    return content;
  }

  if (content.includes('[ServerSettings]')) {
    return content.replace('[ServerSettings]', `[ServerSettings]\n${originalPasswordLine.trimEnd()}`);
  }

  return `${content.trimEnd()}\n\n[ServerSettings]\n${originalPasswordLine.trimEnd()}\n`;
}

function writeServerConfigContent(
  filename: string,
  newContent: string,
  target: ConfigSaveTarget = 'ini'
): void {
  const { filePath } = resolvePathForTarget(filename, target);

  if (filename === 'GameUserSettings.ini') {
    // Always preserve the password from canonical .ini source.
    const originalContent = readRawServerConfig(filename, 'ini');
    const originalPasswordLine = extractOriginalPasswordLine(originalContent);

    // Remove any password line from user-provided content and restore protected value.
    let cleanedContent = removeAdminPassword(newContent);
    cleanedContent = restorePasswordLine(cleanedContent, originalPasswordLine);
    fs.writeFileSync(filePath, cleanedContent, 'utf-8');

    // Save base snapshot of .ini for 3-way merge when applying .tmp after server stop.
    // Only write once (on first save to .tmp) so the base reflects the pre-edit state.
    if (target === 'tmp') {
      const basePath = `${filePath}.base`;
      if (!fs.existsSync(basePath)) {
        fs.writeFileSync(basePath, originalContent, 'utf-8');
      }
    }
    return;
  }

  if (target === 'tmp') {
    // Save base snapshot of .ini for 3-way merge when applying .tmp after server stop.
    // Only write once (on first save to .tmp) so the base reflects the pre-edit state.
    const basePath = `${filePath}.base`;
    if (!fs.existsSync(basePath)) {
      const originalContent = readRawServerConfig(filename, 'ini');
      fs.writeFileSync(basePath, originalContent, 'utf-8');
    }
  }

  fs.writeFileSync(filePath, newContent, 'utf-8');
}

function mergeServerConfigContent(baseContent: string, currentContent: string, newContent: string): {
  mergedContent: string;
  conflicts: ConfigMergeConflict['chunks'];
} {
  const merged = diff3Merge(toLineArray(currentContent), toLineArray(baseContent), toLineArray(newContent));
  const mergedLines: string[] = [];
  const conflicts: ConfigMergeConflict['chunks'] = [];

  for (const chunk of merged) {
    const chunkWithConflict = chunk as Extract<Diff3Chunk, { conflict: unknown }>;
    if (chunkWithConflict.conflict) {
      const conflict = chunkWithConflict.conflict;
      conflicts.push({
        index: conflicts.length,
        base: fromLineArray(conflict.o),
        current: fromLineArray(conflict.a),
        yours: fromLineArray(conflict.b),
      });

      // Keep both sides in preview to help users resolve conflicts in UI.
      mergedLines.push(fromLineArray(conflict.a));
      if (conflict.a.length > 0 && conflict.b.length > 0) {
        const lastCurrent = conflict.a[conflict.a.length - 1] ?? '';
        if (!lastCurrent.endsWith('\n')) {
          mergedLines.push('\n');
        }
      }
      mergedLines.push(fromLineArray(conflict.b));
      continue;
    }

    const okChunk = chunk as Extract<Diff3Chunk, { ok: string[] }>;
    mergedLines.push(fromLineArray(okChunk.ok));
  }

  return {
    mergedContent: mergedLines.join(''),
    conflicts,
  };
}

export function readServerConfig(filename: string): string {
  const tmpPath = getServerConfigTmpPath(filename);
  const rawContent = fs.existsSync(tmpPath)
    ? readRawConfigByPath(tmpPath)
    : readRawServerConfig(filename, 'ini');
  return sanitizeConfigContent(filename, rawContent);
}

export function writeServerConfig(filename: string, newContent: string): void {
  writeServerConfigContent(filename, newContent);
}

export function readServerConfigWithRevision(filename: string): ReadServerConfigResult {
  const tmpPath = getServerConfigTmpPath(filename);
  const sourceTarget: ConfigSaveTarget = fs.existsSync(tmpPath) ? 'tmp' : 'ini';
  const content = readServerConfig(filename);
  return {
    content,
    revision: buildRevision(content),
    sourceTarget,
    pendingTemp: sourceTarget === 'tmp',
  };
}

export function saveServerConfigWithMerge(filename: string, input: SaveServerConfigInput): SaveServerConfigResult {
  const saveTarget = input.saveTarget === 'tmp' ? 'tmp' : 'ini';
  const currentContent = sanitizeConfigContent(
    filename,
    readRawCurrentContentForSaveTarget(filename, saveTarget)
  );
  const currentRevision = buildRevision(currentContent);

  const baseContent = input.baseContent ?? '';
  const baseRevision = input.baseRevision || buildRevision(baseContent);
  const newContent = input.newContent ?? '';
  const pendingTemp = saveTarget === 'tmp';

  if (baseRevision === currentRevision) {
    writeServerConfigContent(filename, newContent, saveTarget);
    return {
      status: 'saved',
      message:
        saveTarget === 'tmp'
          ? `${filename} saved to .tmp while server is running. Changes will be applied after stop.`
          : `${filename} saved successfully. Changes will be applied on next startup.`,
      content: newContent,
      revision: buildRevision(newContent),
      saveTarget,
      pendingTemp,
    };
  }

  const merged = mergeServerConfigContent(baseContent, currentContent, newContent);
  if (merged.conflicts.length > 0) {
    return {
      status: 'conflict',
      message: `${filename} has conflicts with external updates. Resolve conflicts before saving.`,
      content: currentContent,
      revision: currentRevision,
      saveTarget,
      pendingTemp,
      conflict: {
        mergedPreview: merged.mergedContent,
        chunks: merged.conflicts,
      },
    };
  }

  writeServerConfigContent(filename, merged.mergedContent, saveTarget);
  return {
    status: 'merged',
    message:
      saveTarget === 'tmp'
        ? `${filename} was merged and saved to .tmp while server is running. Changes will be applied after stop.`
        : `${filename} was merged with external updates and saved. Changes will be applied on next startup.`,
    content: merged.mergedContent,
    revision: buildRevision(merged.mergedContent),
    saveTarget,
    pendingTemp,
  };
}

export function listPendingServerConfigTempFiles(): PendingConfigTempFile[] {
  const pending: PendingConfigTempFile[] = [];

  for (const filename of CONFIG_FILENAMES) {
    const iniPath = getServerConfigPath(filename);
    const tmpPath = `${iniPath}.tmp`;
    if (fs.existsSync(tmpPath)) {
      pending.push({ filename, iniPath, tmpPath });
    }
  }

  return pending;
}

export function applyPendingServerConfigTempFiles(): {
  applied: ConfigFilename[];
  failed: Array<{ filename: ConfigFilename; error: string }>;
} {
  const pending = listPendingServerConfigTempFiles();
  const applied: ConfigFilename[] = [];
  const failed: Array<{ filename: ConfigFilename; error: string }> = [];

  for (const item of pending) {
    try {
      const basePath = `${item.tmpPath}.base`;

      if (fs.existsSync(basePath) && fs.existsSync(item.iniPath)) {
        // 3-way merge:
        //   base    = .ini snapshot taken when user first saved to .tmp
        //   current = .ini as-is after server wrote back MOD params on shutdown
        //   new     = .ini.tmp containing user's pending edits
        //
        // On conflict, user's .ini.tmp takes priority.
        const baseRaw = readRawConfigByPath(basePath);
        const currentRaw = readRawConfigByPath(item.iniPath);
        const tmpRaw = readRawConfigByPath(item.tmpPath);

        const baseSanitized = sanitizeConfigContent(item.filename, baseRaw);
        const currentSanitized = sanitizeConfigContent(item.filename, currentRaw);
        const tmpSanitized = sanitizeConfigContent(item.filename, tmpRaw);

        const merged = mergeServerConfigContent(baseSanitized, currentSanitized, tmpSanitized);
        if (merged.conflicts.length === 0) {
          // Clean merge: apply merged result (preserves both user edits and server-written params)
          writeServerConfigContent(item.filename, merged.mergedContent, 'ini');
        } else {
          // Conflict: prefer user's .ini.tmp changes
          writeServerConfigContent(item.filename, tmpSanitized, 'ini');
        }

        fs.unlinkSync(item.tmpPath);
        fs.unlinkSync(basePath);
      } else {
        // No base snapshot available: fall back to direct overwrite with .tmp
        fs.renameSync(item.tmpPath, item.iniPath);
        // Remove orphaned base file if present
        if (fs.existsSync(basePath)) {
          fs.unlinkSync(basePath);
        }
      }

      applied.push(item.filename);
    } catch (error: unknown) {
      failed.push({
        filename: item.filename,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { applied, failed };
}
