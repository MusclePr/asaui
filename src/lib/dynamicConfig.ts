import fs from 'node:fs';
import path from 'node:path';
import { CLUSTER_DIR } from './cluster';
import { getContainers, execRcon } from './docker';
import { canExecuteRcon } from './serverState';
import { DYNAMIC_MULTIPLIER_KEYS } from './shared/dynamicConfigMetadata';

export const DYNAMIC_CONFIG_FILE = path.join(CLUSTER_DIR, 'web', 'dynamicconfig.ini');
export const DYNAMIC_CONFIG_APPLY_COMMAND = 'ForceUpdateDynamicConfig';
const WINDOWS_SERVER_CONFIG_DIR = path.join(
  CLUSTER_DIR,
  'server',
  'ShooterGame',
  'Saved',
  'Config',
  'WindowsServer'
);
const GAME_INI_FILE = path.join(WINDOWS_SERVER_CONFIG_DIR, 'Game.ini');
const GAME_USER_SETTINGS_FILE = path.join(WINDOWS_SERVER_CONFIG_DIR, 'GameUserSettings.ini');
const LEGACY_GAME_INI_FILE = path.join(CLUSTER_DIR, 'server', 'Game.ini');
const LEGACY_GAME_USER_SETTINGS_FILE = path.join(CLUSTER_DIR, 'server', 'GameUserSettings.ini');

const GAME_USER_SETTINGS_MULTIPLIER_KEYS = new Set([
  'XPMultiplier',
  'TamingSpeedMultiplier',
]);

export interface DynamicConfig {
  [key: string]: string;
}

function parseIniKeyValueMap(filePath: string): DynamicConfig {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const config: DynamicConfig = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split('=');
    const valueWithoutInlineComment = valueParts.join('=').split(';', 1)[0].trim();
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      continue;
    }

    config[normalizedKey] = valueWithoutInlineComment;
  }

  return config;
}

function resolveReadablePath(primaryPath: string, fallbackPath: string): string {
  if (fs.existsSync(primaryPath)) {
    return primaryPath;
  }
  return fallbackPath;
}

export function readDynamicConfig(): DynamicConfig {
  return parseIniKeyValueMap(DYNAMIC_CONFIG_FILE);
}

export function readDynamicMultiplierDefaults(): DynamicConfig {
  const gameIniConfig = parseIniKeyValueMap(
    resolveReadablePath(GAME_INI_FILE, LEGACY_GAME_INI_FILE)
  );
  const gameUserSettingsConfig = parseIniKeyValueMap(
    resolveReadablePath(GAME_USER_SETTINGS_FILE, LEGACY_GAME_USER_SETTINGS_FILE)
  );
  const defaults: DynamicConfig = {};

  for (const key of DYNAMIC_MULTIPLIER_KEYS) {
    const source = GAME_USER_SETTINGS_MULTIPLIER_KEYS.has(key)
      ? gameUserSettingsConfig
      : gameIniConfig;
    const value = source[key];
    defaults[key] = value && value.length > 0 ? value : '1.0';
  }

  return defaults;
}

export function writeDynamicConfig(config: DynamicConfig): void {
  let content = '; https://ark.wiki.gg/wiki/Server_configuration#DynamicConfig\n';
  for (const [key, value] of Object.entries(config)) {
    content += `${key}=${value}\n`;
  }
  fs.writeFileSync(DYNAMIC_CONFIG_FILE, content, 'utf-8');
}

export async function broadcastDynamicConfigReload() {
  const containers = await getContainers();
  const runningContainers = containers.filter(c => c.isManaged && canExecuteRcon(c));
  
  const results = await Promise.allSettled(
    runningContainers.map(c => execRcon(c.id, DYNAMIC_CONFIG_APPLY_COMMAND))
  );

  return results.map((res, index) => ({
    containerName: runningContainers[index].name,
    status: res.status,
    output: res.status === 'fulfilled' ? res.value : (res as PromiseRejectedResult).reason?.message || String((res as PromiseRejectedResult).reason)
  }));
}
