export type ClusterOperationType = "backup" | "restore";

export interface ContainerStatus {
  id: string; // Service ID or Container ID
  name: string; // Container name
  image: string;
  state: string; // e.g. "running", "exited", "not_created"
  status: string; // e.g. "Up 2 hours", "Exited (0) 5 minutes ago", "Not created"
  health?: string; // e.g. "healthy", "unhealthy", "starting"
  isStopping?: boolean; // detected from "Received shutdown signal" logs
  detailedState?: string; // e.g. "UPDATING", "WAITING", "MAINTENANCE", "PAUSING", "PAUSED"
  clusterOperationInProgress?: boolean; // cluster-level backup/restore operation detected from .signals/cluster
  clusterOperationType?: ClusterOperationType;
  map?: string; // Display name
  mapRaw?: string; // Raw name (e.g. TheIsland_WP)
  sessionName?: string;
  isManaged?: boolean; // Whether it's an ARK server we manage
  autoPauseEnabled?: boolean; // Whether AUTO_PAUSE is enabled for this server node
  onlinePlayers?: { name: string; eosId: string }[]; // List of currently connected players
  offlinePlayers?: { name: string; eosId: string; lastLogin: string }[]; // List of players with save data but not online
}

export interface PlayerInfo {
  name: string;
  displayName?: string;
  eosId: string;
  lastLogin: string;
  isWhitelisted: boolean;
  isBypassed: boolean;
}

export interface UnregisteredPlayerCandidate {
  serverId: string; // Container ID from docker
  serverName: string; // Container display name (e.g. asa_island_server)
  eosId: string; // 32-char hex EOS ID
  ip: string; // IP address from logs
  detectedAtUtc: string; // ISO string of incoming account timestamp
  detectedAtLocal?: string; // Local time representation
  name?: string; // Player name (from left this ARK! log if found)
  platform?: string; // Platform (from UniqueNetId if found, e.g. "None")
  hasLeftEvent: boolean; // Whether we found the matching "left this ARK!" event within 30s
  sourceLine?: string; // Original log line for debugging
}
