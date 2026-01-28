import { getCachedServers } from "./compose";

export function getServers() {
  const cached = getCachedServers();
  return cached.map(s => ({
    id: s.id,
    containerName: s.containerName,
    sessionName: s.sessionName,
    map: s.mapRaw,
    port: s.port
  }));
}

export const ARK_MAP_MAIN = process.env.ARK_MAP_MAIN || ""; // Will be determined dynamically if empty

export function getMainServerId(): string {
  if (ARK_MAP_MAIN) return ARK_MAP_MAIN;
  const servers = getServers();
  return servers.length > 0 ? servers[0].id : "";
}

export const ARK_SAVE_BASE_DIR = process.env.ARK_SAVE_BASE_DIR || "/cluster/server/ShooterGame/Saved/SavedArks";

export const EXPOSE_URL = process.env.EXPOSE_URL || "";
