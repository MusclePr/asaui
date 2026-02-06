import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import Docker from "dockerode";
import { CLUSTER_DIR } from "./cluster";
import { runDockerCompose } from "./compose";

const execAsync = promisify(exec);
const docker = new Docker();

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
    // df -B1 returns size in bytes
    // Output format: Filesystem 1B-blocks Used Available Use% Mounted on
    const { stdout: dfOut } = await execAsync(`df -B1 ${BACKUP_DIR} | tail -1`);
    const parts = dfOut.trim().split(/\s+/);
    const total = parseInt(parts[1], 10);
    const used = parseInt(parts[2], 10);
    const available = parseInt(parts[3], 10);

    // du -sb returns apparent size in bytes
    let backupSize = 0;
    try {
      const { stdout: duOut } = await execAsync(`du -sb ${BACKUP_DIR}`);
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
    if (file.endsWith(".tar.gz")) {
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
  const isRunning = await isContainerRunning("asa0");
  
  if (isRunning) {
    // Use the manager script inside the asa0 container
    return await runDockerCompose(["compose", "exec", "-T", "asa0", "manager", "backup"]);
  } else {
    // Manual backup while container is offline
    const sessionName = await getSessionName();
    const filename = `${sanitize(sessionName)}_${formatDate(new Date())}.tar.gz`;
    const destPath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    console.log(`Performing offline backup: ${filename}`);
    // tar -czf dest -C base_dir folder_to_archive
    // Note: We use executive command directly to match container behavior
    await execAsync(`tar -czf ${destPath} -C ${path.dirname(SAVED_DIR)} ${path.basename(SAVED_DIR)}`);
    return { success: true, filename };
  }
}

export async function restoreBackup(filename: string) {
  const isRunning = await isContainerRunning("asa0");
  const backupFile = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(backupFile)) {
    throw new Error("Backup file not found");
  }

  if (isRunning) {
    // manager restore <filename>
    return await runDockerCompose(["compose", "exec", "-T", "asa0", "manager", "restore", filename]);
  } else {
    // Manual restore while container is offline
    console.log(`Performing offline restore: ${filename}`);
    
    // 1. Remove existing Saved dir
    if (fs.existsSync(SAVED_DIR)) {
      await execAsync(`rm -rf ${SAVED_DIR}`);
    }

    // 2. Extract backup
    // Assuming archive contains 'Saved/' directory
    await execAsync(`tar -xzf ${backupFile} -C ${path.dirname(SAVED_DIR)}`);
    return { success: true };
  }
}

export async function deleteBackup(filename: string) {
  const filePath = path.join(BACKUP_DIR, filename);
  // Security check: ensure path is inside BACKUP_DIR
  if (!filePath.startsWith(path.resolve(BACKUP_DIR))) {
    throw new Error("Invalid backup filename");
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function getBackupStream(filename: string) {
  const filePath = path.join(BACKUP_DIR, filename);
  if (!filePath.startsWith(path.resolve(BACKUP_DIR)) || !fs.existsSync(filePath)) {
    return null;
  }
  return fs.createReadStream(filePath);
}
