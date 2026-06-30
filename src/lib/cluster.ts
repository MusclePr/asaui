import path from "node:path";

export const CLUSTER_DIR = process.env.ASAUI_CLUSTER_DIR || "/cluster";

export const CLUSTER_COMPOSE_FILE = path.join(CLUSTER_DIR, "compose.yml");
export const CLUSTER_ENV_FILE = path.join(CLUSTER_DIR, ".env");
export const CLUSTER_ENV_TEMPLATE_FILE = path.join(CLUSTER_DIR, "defaults", "template.env");
export const CLUSTER_COMMON_ENV_DEFAULT_FILE = path.join(CLUSTER_DIR, "defaults", "common.env");
export const CLUSTER_COMMON_ENV_OVERRIDE_FILE = path.join(CLUSTER_DIR, ".common.env");
export const SIGNAL_DIR = path.join(CLUSTER_DIR, "server", ".signals");

// Server configuration paths - always reference the actual files, not symlinks
export const WINDOWS_SERVER_CONFIG_DIR = path.join(
  CLUSTER_DIR,
  "server",
  "ShooterGame",
  "Saved",
  "Config",
  "WindowsServer"
);
export const SAVED_DIR = path.join(CLUSTER_DIR, "server", "ShooterGame", "Saved");
export const GAME_INI_FILE = path.join(WINDOWS_SERVER_CONFIG_DIR, "Game.ini");
export const GAME_USER_SETTINGS_FILE = path.join(WINDOWS_SERVER_CONFIG_DIR, "GameUserSettings.ini");

export const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || "";
export const CURSEFORGE_API_BASE_URL =
  process.env.CURSEFORGE_API_BASE_URL || "https://api.curseforge.com";
