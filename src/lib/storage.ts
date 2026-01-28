import fs from 'fs';
import path from 'path';
import { ARK_SAVE_BASE_DIR } from './config';

const ARK_GAME_DIR = path.resolve(ARK_SAVE_BASE_DIR, "..", "..");
const WHITELIST_FILE = path.join(ARK_GAME_DIR, "Binaries", "Win64", "PlayersExclusiveJoinList.txt");
const BYPASS_FILE = path.join(ARK_GAME_DIR, "Binaries", "Win64", "PlayersJoinNoCheckList.txt");
const PLAYERS_META_FILE = "/cluster/players.json";

type PlayerMeta = {
  displayName: string;
};

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return (data && typeof data === "object") ? data as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readList(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath, "utf-8");
  return data
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

function writeList(filePath: string, list: string[]) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const unique = Array.from(new Set(list.map(id => id.trim()).filter(Boolean)));
  fs.writeFileSync(filePath, unique.join("\n"));
}

export function getWhitelist(): string[] {
  return readList(WHITELIST_FILE);
}

export function addToWhitelist(eosId: string) {
  const list = getWhitelist();
  if (!list.includes(eosId)) {
    list.push(eosId);
    writeList(WHITELIST_FILE, list);
  }
}

export function removeFromWhitelist(eosId: string) {
  const list = getWhitelist().filter(id => id !== eosId);
  writeList(WHITELIST_FILE, list);
}

export function getBypassList(): string[] {
  return readList(BYPASS_FILE);
}

export function addToBypassList(eosId: string) {
  const list = getBypassList();
  if (!list.includes(eosId)) {
    list.push(eosId);
    writeList(BYPASS_FILE, list);
  }
}

export function removeFromBypassList(eosId: string) {
  const list = getBypassList().filter(id => id !== eosId);
  writeList(BYPASS_FILE, list);
}

export function getPlayerProfiles(): Record<string, PlayerMeta> {
  return readJson<Record<string, PlayerMeta>>(PLAYERS_META_FILE, {});
}

export function setPlayerDisplayName(eosId: string, displayName?: string | null) {
  if (!eosId) return;
  const profiles = getPlayerProfiles();
  const normalized = (displayName ?? "").trim();
  if (!normalized) {
    delete profiles[eosId];
  } else {
    profiles[eosId] = { displayName: normalized };
  }
  writeJson(PLAYERS_META_FILE, profiles);
}

export function ensurePlayerProfiles(eosIds: string[]) {
  if (!eosIds.length) return;
  const profiles = getPlayerProfiles();
  let changed = false;
  for (const eosId of eosIds) {
    if (!eosId) continue;
    if (!profiles[eosId]) {
      profiles[eosId] = { displayName: "" };
      changed = true;
    }
  }
  if (changed) {
    writeJson(PLAYERS_META_FILE, profiles);
  }
}
