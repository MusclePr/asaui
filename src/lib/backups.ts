import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import Docker from "dockerode";
import { CLUSTER_DIR } from "./cluster";
import { runDockerCompose } from "./compose";
import { getServers } from "./config";

const execFileAsync = promisify(execFile);
const docker = new Docker();

const BACKUP_FILENAME_RE = /^[a-z0-9_]+_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.tar\.gz$/;

export const BACKUP_DIR = path.join(CLUSTER_DIR, "backups");
export const SAVED_DIR = path.join(CLUSTER_DIR, "server", "ShooterGame", "Saved");
export const GUS_INI = path.join(CLUSTER_DIR, "server", "GameUserSettings.ini");

export interface DiskUsage {
  total: number;
  used: number;
  available: number;
  backupSize: number;
  systemSize: number;
}

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

export async function isContainerRunning(containerName: string) {
  try {
    const containers = await docker.listContainers({ all: true });
    // Match by name (Docker names start with /)
    return containers.some(c => 
      c.Names.some(name => name === `/${containerName}` || name.endsWith(`-${containerName}-1`)) && 
      c.State === "running"
    );
  } catch (error) {
    console.error("Error checking container status:", error);
    return false;
  }
}

function getMainServerRef(): { serviceId: string; containerName: string } {
  const servers = getServers();
  const main = servers.find(server => server.id === "asa0") ?? servers[0];
  return {
    serviceId: main?.id || "asa0",
    containerName: main?.containerName || "asa0",
  };
}

export function getMainServerContainerName(): string {
  return getMainServerRef().containerName;
}

async function getSessionName(): Promise<string> {
  try {
    if (fs.existsSync(GUS_INI)) {
      const content = fs.readFileSync(GUS_INI, "utf-8");
      const match = content.match(/^SessionName=(.+)/m);
      if (match) return match[1].trim();
    }
  } catch (error) {
    console.error("Error reading session name:", error);
  }
  return "Session";
}

function sanitize(name: string): string {
  let clean = name.replace(/_/g, "");
  clean = clean.replace(/ /g, "_");
  clean = clean.replace(/[^a-zA-Z0-9_]/g, "");
  return clean.toLowerCase();
}

function formatDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

export function isValidBackupFilename(filename: string): boolean {
  return BACKUP_FILENAME_RE.test(filename);
}

function resolveBackupPath(filename: string): string {
  if (!isValidBackupFilename(filename)) {
    throw new Error("Invalid backup filename");
  }

  const baseDir = path.resolve(BACKUP_DIR);
  const resolved = path.resolve(BACKUP_DIR, filename);
  if (!(resolved === baseDir || resolved.startsWith(`${baseDir}${path.sep}`))) {
    throw new Error("Invalid backup filename");
  }

  return resolved;
}

export async function getDiskUsage(): Promise<DiskUsage> {
  if (!fs.existsSync(BACKUP_DIR)) {
    return {
      total: 0,
      used: 0,
      available: 0,
      backupSize: 0,
      systemSize: 0,
    };
  }
  try {
    // Output format: Filesystem 1B-blocks Used Available Use% Mounted on
    const { stdout: dfOut } = await execFileAsync("df", ["-B1", BACKUP_DIR]);
    const dfLines = dfOut.trim().split("\n");
    const dfLastLine = dfLines[dfLines.length - 1] ?? "";
    if (!dfLastLine) throw new Error("Failed to parse df output");

    const parts = dfLastLine.trim().split(/\s+/);
    const total = parseInt(parts[1], 10);
    const used = parseInt(parts[2], 10);
    const available = parseInt(parts[3], 10);

    // du -sb returns apparent size in bytes
    let backupSize = 0;
    try {
      const { stdout: duOut } = await execFileAsync("du", ["-sb", BACKUP_DIR]);
      backupSize = parseInt(duOut.trim().split(/\s+/)[0], 10);
    } catch (e) {
      console.error("Failed to get backup size with du:", e);
    }

    const systemSize = used - backupSize;

    return {
      total,
      used,
      available,
      backupSize,
      systemSize: systemSize > 0 ? systemSize : 0,
    };
  } catch (error) {
    console.error("Error getting disk usage:", error);
    return {
      total: 0,
      used: 0,
      available: 0,
      backupSize: 0,
      systemSize: 0,
    };
  }
}

export async function listBackups(): Promise<BackupFile[]> {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BACKUP_DIR);
  const backups: BackupFile[] = [];

  for (const file of files) {
    if (isValidBackupFilename(file)) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      backups.push({
        filename: file,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
      });
    }
  }

  // Sort by date descending
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createBackup() {
  const main = getMainServerRef();
  const isRunning = await isContainerRunning(main.containerName);
  
  if (isRunning) {
    // Use the manager script inside the asa0 container
    return await runDockerCompose(["compose", "exec", "-u", "arkuser", "-T", main.serviceId, "manager", "backup"]);
  } else {
    // Manual backup while container is offline
    const sessionName = await getSessionName();
    const filename = `${sanitize(sessionName)}_${formatDate(new Date())}.tar.gz`;
    const destPath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    console.log(`Performing offline backup: ${filename}`);
    await execFileAsync("tar", [
      "-czf",
      destPath,
      "-C",
      path.dirname(SAVED_DIR),
      path.basename(SAVED_DIR),
    ]);
    return { success: true, filename };
  }
}

export async function restoreBackup(filename: string) {
  const main = getMainServerRef();
  const isRunning = await isContainerRunning(main.containerName);
  const backupFile = resolveBackupPath(filename);

  if (!fs.existsSync(backupFile)) {
    throw new Error("Backup file not found");
  }

  if (isRunning) {
    // manager restore <filename>
    return await runDockerCompose(["compose", "exec", "-u", "arkuser", "-T", main.serviceId, "manager", "restore", filename]);
  } else {
    // Manual restore while container is offline
    console.log(`Performing offline restore: ${filename}`);
    
    // 1. Remove existing Saved dir
    if (fs.existsSync(SAVED_DIR)) {
      await fs.promises.rm(SAVED_DIR, { recursive: true, force: true });
    }

    // 2. Extract backup
    // Assuming archive contains 'Saved/' directory
    await execFileAsync("tar", ["-xzf", backupFile, "-C", path.dirname(SAVED_DIR)]);
    return { success: true };
  }
}

export async function deleteBackup(filename: string) {
  const filePath = resolveBackupPath(filename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function getBackupStream(filename: string) {
  let filePath = "";
  try {
    filePath = resolveBackupPath(filename);
  } catch {
    return null;
  }

  if (!fs.existsSync(filePath)) return null;

  return fs.createReadStream(filePath);
}
