import fs from 'fs';
import path from 'path';

const DATABASE_FILE = "/data/whitelist.json";

export function getWhitelist(): string[] {
  if (!fs.existsSync(DATABASE_FILE)) return [];
  try {
    const data = fs.readFileSync(DATABASE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function addToWhitelist(steamId: string) {
  const list = getWhitelist();
  if (!list.includes(steamId)) {
    list.push(steamId);
    saveWhitelist(list);
  }
}

export function removeFromWhitelist(steamId: string) {
  const list = getWhitelist().filter(id => id !== steamId);
  saveWhitelist(list);
}

function saveWhitelist(list: string[]) {
  const dir = path.dirname(DATABASE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATABASE_FILE, JSON.stringify(list, null, 2));
}
