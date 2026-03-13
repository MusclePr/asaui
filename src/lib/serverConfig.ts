import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import diff3Merge, { Diff3Chunk } from 'diff3';
import { CLUSTER_DIR } from './cluster';

const SERVER_DIR = path.join(CLUSTER_DIR, 'server');

export function getServerConfigPath(filename: string): string {
  // Only allow specific files for security
  if (filename !== 'GameUserSettings.ini' && filename !== 'Game.ini') {
    throw new Error('Invalid config filename');
  }
  return path.join(SERVER_DIR, filename);
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
};

export type SaveServerConfigInput = {
  baseContent: string;
  baseRevision: string;
  newContent: string;
};

export type SaveServerConfigResult = {
  status: SaveStatus;
  message: string;
  content: string;
  revision: string;
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

function readRawServerConfig(filename: string): string {
  const filePath = getServerConfigPath(filename);
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf-8');
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

function writeServerConfigContent(filename: string, newContent: string): void {
  const filePath = getServerConfigPath(filename);

  if (filename === 'GameUserSettings.ini') {
    const originalContent = readRawServerConfig(filename);
    const originalPasswordLine = extractOriginalPasswordLine(originalContent);

    // Remove any password line from user-provided content and restore protected value.
    let cleanedContent = removeAdminPassword(newContent);
    cleanedContent = restorePasswordLine(cleanedContent, originalPasswordLine);
    fs.writeFileSync(filePath, cleanedContent, 'utf-8');
    return;
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
  const rawContent = readRawServerConfig(filename);
  return sanitizeConfigContent(filename, rawContent);
}

export function writeServerConfig(filename: string, newContent: string): void {
  writeServerConfigContent(filename, newContent);
}

export function readServerConfigWithRevision(filename: string): ReadServerConfigResult {
  const content = readServerConfig(filename);
  return {
    content,
    revision: buildRevision(content),
  };
}

export function saveServerConfigWithMerge(filename: string, input: SaveServerConfigInput): SaveServerConfigResult {
  const currentContent = readServerConfig(filename);
  const currentRevision = buildRevision(currentContent);

  const baseContent = input.baseContent ?? '';
  const baseRevision = input.baseRevision || buildRevision(baseContent);
  const newContent = input.newContent ?? '';

  if (baseRevision === currentRevision) {
    writeServerConfigContent(filename, newContent);
    return {
      status: 'saved',
      message: `${filename} saved successfully. Changes will be applied on next startup.`,
      content: newContent,
      revision: buildRevision(newContent),
    };
  }

  const merged = mergeServerConfigContent(baseContent, currentContent, newContent);
  if (merged.conflicts.length > 0) {
    return {
      status: 'conflict',
      message: `${filename} has conflicts with external updates. Resolve conflicts before saving.`,
      content: currentContent,
      revision: currentRevision,
      conflict: {
        mergedPreview: merged.mergedContent,
        chunks: merged.conflicts,
      },
    };
  }

  writeServerConfigContent(filename, merged.mergedContent);
  return {
    status: 'merged',
    message: `${filename} was merged with external updates and saved. Changes will be applied on next startup.`,
    content: merged.mergedContent,
    revision: buildRevision(merged.mergedContent),
  };
}
