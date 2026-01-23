export const ARK_SERVERS = (process.env.ARK_SERVERS || "")
  .replace(/[()]/g, "")
  .split(/[\s,]+/)
  .filter(s => s.length > 0);

export const SERVERS = ARK_SERVERS.map(id => ({
  id,
  map: process.env[`SRV_${id}_MAP`] || "TheIsland_WP"
}));

export const ARK_MAP_MAIN = process.env.ARK_MAP_MAIN || ARK_SERVERS[0] || "";
export const ARK_SAVE_BASE_DIR = process.env.ARK_SAVE_BASE_DIR || "/opt/arkserver/ShooterGame/Saved/SavedArks";

export const EXPOSE_URL = process.env.EXPOSE_URL || "";
