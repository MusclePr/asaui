export interface ContainerStatus {
  id: string; // Service ID or Container ID
  name: string; // Container name
  image: string;
  state: string; // e.g. "running", "exited", "not_created"
  status: string; // e.g. "Up 2 hours", "Exited (0) 5 minutes ago", "Not created"
  health?: string; // e.g. "healthy", "unhealthy", "starting"
  isStopping?: boolean; // detected from "Received shutdown signal" logs
  map?: string; // Display name
  mapRaw?: string; // Raw name (e.g. TheIsland_WP)
  sessionName?: string;
  isManaged?: boolean; // Whether it's an ARK server we manage
  onlinePlayers?: { name: string; eosId: string }[]; // List of currently connected players
}

export interface PlayerInfo {
  name: string;
  displayName?: string;
  eosId: string;
  lastLogin: string;
  isWhitelisted: boolean;
  isBypassed: boolean;
}
