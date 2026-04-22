import Docker from 'dockerode';
import fs from 'node:fs';
import path from 'node:path';
import { ContainerStatus } from '@/types';
import { getServers, ARK_SAVE_BASE_DIR } from './config';
import { getMapDisplayName, getBaseMapName } from './maps';
import { getPlayerProfiles } from './storage';
import { SIGNAL_DIR } from './cluster';
import { canExecuteRcon } from './serverState';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

type ClusterOperationStatus = {
  inProgress: boolean;
  type?: "backup" | "restore";
};

type SavedPlayerRecord = {
  eosId: string;
  lastLogin: string;
};

function formatLastLogin(date: Date): string {
  return date.toISOString().replace("T", " ").split(".")[0];
}

function isNewSaveFormatEnabled(extraDashOpts?: string): boolean {
  if (!extraDashOpts) return false;
  return /(^|\s)-newsaveformat(\s|$)/.test(extraDashOpts);
}

function getClusterLoginDir(clusterId: string): string {
  return path.resolve(ARK_SAVE_BASE_DIR, "..", "Cluster", ".login", clusterId);
}

function scanArkProfilePlayers(mapRaw: string): SavedPlayerRecord[] {
  const saveDir = path.join(ARK_SAVE_BASE_DIR, getBaseMapName(mapRaw));
  if (!fs.existsSync(saveDir)) return [];

  const files = fs.readdirSync(saveDir);
  const profileFiles = files.filter((f) => f.endsWith(".arkprofile"));
  const results: SavedPlayerRecord[] = [];

  for (const file of profileFiles) {
    const filePath = path.join(saveDir, file);
    const stats = fs.statSync(filePath);
    const eosId = file.replace(".arkprofile", "");
    results.push({ eosId, lastLogin: formatLastLogin(stats.mtime) });
  }

  return results;
}

function scanLoginMapPlayers(mapRaw: string, clusterId: string): SavedPlayerRecord[] {
  if (!clusterId) return [];

  const loginDir = getClusterLoginDir(clusterId);
  if (!fs.existsSync(loginDir)) return [];

  const targetMap = getBaseMapName(mapRaw);
  const results: SavedPlayerRecord[] = [];
  const eosPattern = /^last_map_([a-fA-F0-9]{32})\.txt$/;

  for (const file of fs.readdirSync(loginDir)) {
    const match = eosPattern.exec(file);
    if (!match) continue;

    const filePath = path.join(loginDir, file);
    try {
      const mapName = fs.readFileSync(filePath, "utf8").trim();
      if (!mapName) continue;
      if (getBaseMapName(mapName) !== targetMap) continue;

      const stats = fs.statSync(filePath);
      results.push({
        eosId: match[1].toLowerCase(),
        lastLogin: formatLastLogin(stats.mtime),
      });
    } catch (e) {
      console.warn(`Failed to read login map file: ${filePath}`, e);
    }
  }

  return results;
}

export async function getSavedPlayersByMap(
  mapRaw: string,
  options?: { clusterId?: string; extraDashOpts?: string }
): Promise<SavedPlayerRecord[]> {
  if (isNewSaveFormatEnabled(options?.extraDashOpts)) {
    return scanLoginMapPlayers(mapRaw, options?.clusterId ?? "");
  }
  return scanArkProfilePlayers(mapRaw);
}

function readClusterOperationStatus(): ClusterOperationStatus {
  const clusterSignalsDir = path.join(SIGNAL_DIR, 'cluster');
  if (!fs.existsSync(clusterSignalsDir)) {
    return { inProgress: false };
  }

  const resolveActionFromFile = (filePath: string): "backup" | "restore" | undefined => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as { action?: unknown };
      if (parsed.action === 'backup' || parsed.action === 'restore') {
        return parsed.action;
      }
    } catch {
      // ignore malformed files and continue fallback checks
    }
    return undefined;
  };

  const activeRequestPath = path.join(clusterSignalsDir, 'request.json');
  const activeAction = resolveActionFromFile(activeRequestPath);
  if (activeAction) {
    return { inProgress: true, type: activeAction };
  }

  try {
    const processingCandidates = fs
      .readdirSync(clusterSignalsDir, { withFileTypes: true })
      .filter((entry) => {
        if (!entry.isFile()) return false;
        if (!entry.name.startsWith('request-')) return false;
        if (!entry.name.endsWith('.json')) return false;
        return !entry.name.endsWith('.done.json') && !entry.name.endsWith('.failed.json');
      })
      .map((entry) => path.join(clusterSignalsDir, entry.name));

    if (processingCandidates.length === 0) {
      return { inProgress: false };
    }

    processingCandidates.sort((a, b) => {
      const aMtime = fs.statSync(a).mtimeMs;
      const bMtime = fs.statSync(b).mtimeMs;
      return bMtime - aMtime;
    });

    const processingAction = resolveActionFromFile(processingCandidates[0]);
    if (processingAction) {
      return { inProgress: true, type: processingAction };
    }
  } catch (e) {
    console.warn('Failed to inspect cluster request status:', e);
  }

  return { inProgress: false };
}

function getAutoPauseDisabledLockPath(port: string | number): string {
  return path.join(SIGNAL_DIR, `server_${port}`, 'autopause', 'disabled.lock');
}

async function resolveServerPortByContainerRef(containerIdOrName: string): Promise<string> {
  const servers = getServers();
  const direct = servers.find(
    (s) => s.containerName === containerIdOrName || s.id === containerIdOrName
  );
  if (direct?.port) return String(direct.port);

  const inspected = await docker.getContainer(containerIdOrName).inspect();
  const containerName = inspected.Name?.replace(/^\//, '') || '';
  const matched = servers.find(
    (s) => s.containerName === containerName || s.id === containerName
  );
  if (!matched?.port) {
    throw new Error(`Unable to resolve server port for container: ${containerIdOrName}`);
  }
  return String(matched.port);
}

export async function getContainers(): Promise<ContainerStatus[]> {
  const containers = await docker.listContainers({ all: true });
  const definedServers = getServers();

  const signalsExist = fs.existsSync(SIGNAL_DIR);
  const clusterOperation = signalsExist ? readClusterOperationStatus() : { inProgress: false };

  return Promise.all(definedServers.map(async server => {
    // Find container by container_name (usually includes service name)
    const container = containers.find(c => 
      c.Names.some(name => name === `/${server.containerName}` || name === `/${server.id}`)
    );

    let detailedState: string | undefined = undefined;
    let autoPauseEnabled: boolean | undefined = undefined;
    if (server.port && signalsExist) {
      const statusFile = path.join(SIGNAL_DIR, `server_${server.port}`, 'status');
      if (fs.existsSync(statusFile)) {
        try {
          detailedState = fs.readFileSync(statusFile, 'utf8').trim() || undefined;
        } catch (e) {
          console.warn(`Failed to read status file for ${server.id}:`, e);
        }
      }

      try {
        const lockPath = getAutoPauseDisabledLockPath(server.port);
        autoPauseEnabled = !fs.existsSync(lockPath);
      } catch (e) {
        console.warn(`Failed to read auto pause lock for ${server.id}:`, e);
      }
    }

    if (container) {
      // Extract health from status string: "Up X hours (healthy)"
      let health: string | undefined = undefined;
      const healthMatch = container.Status.match(/\((healthy|unhealthy|starting)\)/);
      if (healthMatch) {
        health = healthMatch[1];
      }

      let isStopping = false;
      let onlinePlayers: { name: string; eosId: string }[] | undefined = undefined;

      if (container.State === 'running') {
        try {
          // Check for shutdown signal in recent logs
          const c = docker.getContainer(container.Id);
          // tail 20 to be safe, no timestamps to keep it clean
          const logBuffer = await c.logs({
            stdout: true,
            stderr: true,
            tail: 20
          }) as unknown as Buffer;
          
          const logText = logBuffer.toString('utf-8');
          // Match the exact message from start.sh: LogWarn "Received shutdown signal. Exiting..."
          // We search for the text part as ANSI codes might be present
          if (logText.includes("Received shutdown signal. Exiting...")) {
            isStopping = true;
          }

          // Query players only when RCON is expected to respond.
          if (canExecuteRcon({
            state: container.State,
            health,
            isStopping,
            detailedState,
          })) {
            onlinePlayers = await getOnlinePlayers(container.Id);
          }
        } catch (e) {
          // Ignore log fetch errors but log to console
          console.warn(`Failed to check state for ${server.id}:`, e);
        }
      }

      const onlineEosIds = onlinePlayers?.map(p => p.eosId) || [];
      const offlinePlayers = await getOfflinePlayers(server.map, onlineEosIds, {
        clusterId: server.clusterId,
        extraDashOpts: server.extraDashOpts,
      });

      return {
        id: container.Id,
        name: server.containerName,
        image: container.Image,
        state: container.State,
        status: container.Status,
        health,
        isStopping,
        detailedState,
        clusterOperationInProgress: clusterOperation.inProgress,
        clusterOperationType: clusterOperation.type,
        autoPauseEnabled,
        onlinePlayers,
        offlinePlayers,
        map: getMapDisplayName(server.map),
        mapRaw: server.map,
        sessionName: server.sessionName,
        isManaged: true
      };
    } else {
      const offlinePlayers = await getOfflinePlayers(server.map, [], {
        clusterId: server.clusterId,
        extraDashOpts: server.extraDashOpts,
      });
      return {
        id: server.id, // Use service ID as fallback
        name: server.containerName,
        image: "(not created)",
        state: "not_created",
        status: "Not created",
        detailedState,
        clusterOperationInProgress: clusterOperation.inProgress,
        clusterOperationType: clusterOperation.type,
        autoPauseEnabled,
        offlinePlayers,
        map: getMapDisplayName(server.map),
        mapRaw: server.map,
        sessionName: server.sessionName,
        isManaged: true
      };
    }
  }));
}

export async function manageContainer(id: string, action: string) {
  const container = docker.getContainer(id);
  switch (action) {
    case "start": await container.start(); break;
    case "stop": await container.stop(); break;
    case "restart": await container.restart(); break;
    default:
      throw new Error(`Unsupported container action: ${action}`);
  }
}

export async function execManagerUnpause(containerIdOrName: string): Promise<string> {
  const container = docker.getContainer(containerIdOrName);
  const exec = await container.exec({
    Cmd: ['manager', 'unpause'],
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    User: 'arkuser'
  });

  const stream = await exec.start({});
  return new Promise((resolve, reject) => {
    let output = "";
    let buffer = Buffer.alloc(0);

    stream.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 8) {
        const size = buffer.readUInt32BE(4);

        if (buffer.length >= 8 + size) {
          const content = buffer.subarray(8, 8 + size).toString('utf-8');
          output += content;
          buffer = buffer.subarray(8 + size);
        } else {
          break;
        }
      }
    });

    stream.on('end', () => {
      if (output === "" && buffer.length > 0) {
        output = buffer.toString('utf-8');
      }
      resolve(output.trim());
    });
    stream.on('error', reject);
  });
}

export async function setContainerAutoPauseEnabled(
  containerIdOrName: string,
  enabled: boolean
): Promise<void> {
  const port = await resolveServerPortByContainerRef(containerIdOrName);
  const lockPath = getAutoPauseDisabledLockPath(port);

  if (enabled) {
    // ON means AUTO_PAUSE is allowed, so remove disable lock.
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
    return;
  }

  // OFF means AUTO_PAUSE is prohibited, so create disable lock.
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  if (!fs.existsSync(lockPath)) {
    fs.writeFileSync(lockPath, '', 'utf8');
  }
}

export async function getOfflinePlayers(
  mapRaw: string,
  onlineEosIds: string[],
  options?: { clusterId?: string; extraDashOpts?: string }
): Promise<{ name: string; eosId: string; lastLogin: string }[]> {
  try {
    const savedPlayers = await getSavedPlayersByMap(mapRaw, options);
    const profiles = getPlayerProfiles();
    const offlinePlayers: { name: string; eosId: string; lastLogin: string }[] = [];

    for (const saved of savedPlayers) {
      const eosId = saved.eosId;
      if (onlineEosIds.includes(eosId)) continue;

      const profile = profiles[eosId];
      const name = (profile && profile.displayName) ? profile.displayName : eosId;

      offlinePlayers.push({ name, eosId, lastLogin: saved.lastLogin });
    }

    return offlinePlayers.sort((a, b) => new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime());
  } catch (e) {
    console.warn(`Failed to get offline players for ${mapRaw}:`, e);
    return [];
  }
}

export async function getOnlinePlayers(containerIdOrName: string): Promise<{ name: string; eosId: string }[]> {
  try {
    const output = await execRcon(containerIdOrName, "listplayers");
    if (!output || output.startsWith("No Players")) {
      return [];
    }

    // Pattern: 0. Name, EOSID (maybe more on same line or separate lines)
    // Regex matches: index. followed by name, then comma, then EOSID (32 hex chars)
    const playerRegex = /\d+\.\s+([^,]+),\s+([a-f0-9]{32})/g;
    const profiles = getPlayerProfiles();
    const onlinePlayers: { name: string; eosId: string }[] = [];
    
    let match;
    while ((match = playerRegex.exec(output)) !== null) {
      const ingameName = match[1].trim();
      const eosId = match[2].trim();
      const profile = profiles[eosId];
      
      const displayName = (profile && profile.displayName) ? profile.displayName : ingameName;
      
      onlinePlayers.push({ name: displayName, eosId });
    }
    
    return onlinePlayers;
  } catch (e) {
    console.warn(`Failed to get online players for ${containerIdOrName}:`, e);
    return [];
  }
}

export async function execRcon(containerIdOrName: string, command: string): Promise<string> {
  const container = docker.getContainer(containerIdOrName);
  const exec = await container.exec({
    Cmd: ['manager', 'rcon', command],
    AttachStdout: true,
    AttachStderr: true,
    Tty: false // Multiplexed stream preserves output integrity
  });

  const stream = await exec.start({});
  return new Promise((resolve, reject) => {
    let output = "";
    
    // Using a simple state machine to demux without external dependencies
    // Docker multiplexed header is 8 bytes: [type, 0, 0, 0, size1, size2, size3, size4]
    let buffer = Buffer.alloc(0);

    stream.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      
      while (buffer.length >= 8) {
        const size = buffer.readUInt32BE(4);
        
        if (buffer.length >= 8 + size) {
          const content = buffer.subarray(8, 8 + size).toString('utf-8');
          output += content;
          buffer = buffer.subarray(8 + size);
        } else {
          break; // Wait for more data
        }
      }
    });

    stream.on('end', () => {
      // If there's anything left in output or buffer (in case Tty was actually true)
      if (output === "" && buffer.length > 0) {
        output = buffer.toString('utf-8');
      }
      resolve(output.trim());
    });
    stream.on('error', reject);
  });
}

export async function getContainerLogsStream(id: string) {
  const container = docker.getContainer(id);
  await container.inspect();

  return await container.logs({
    stdout: true,
    stderr: true,
    follow: true,
    tail: 1000,
    timestamps: true
  });
}
