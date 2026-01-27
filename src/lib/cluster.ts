import path from "node:path";

export const CLUSTER_DIR = process.env.ASAUI_CLUSTER_DIR || "/cluster";

export const CLUSTER_COMPOSE_FILE = path.join(CLUSTER_DIR, "compose.yml");
export const CLUSTER_ENV_DEFAULT_FILE = path.join(CLUSTER_DIR, "default.cluster");
export const CLUSTER_ENV_OVERRIDE_FILE = path.join(CLUSTER_DIR, ".cluster");

export const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || "";
export const CURSEFORGE_API_BASE_URL =
  process.env.CURSEFORGE_API_BASE_URL || "https://api.curseforge.com";
