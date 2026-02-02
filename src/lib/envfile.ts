import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

export type EnvMap = Record<string, string>;

export function parseEnvText(text: string): EnvMap {
  const map: EnvMap = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    map[key] = value;
  }
  return map;
}

export function serializeEnv(map: EnvMap): string {
  const keys = Object.keys(map).sort();
  return (
    keys
      .map((k) => {
        const v = map[k] ?? "";
        const needsQuotes = v.includes(" ") || v.includes("#");
        return `${k}=${needsQuotes ? `"${v}"` : v}`;
      })
      .join("\n") + "\n"
  );
}

export function readEnvFile(filePath: string): EnvMap {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  return parseEnvText(text);
}

export function writeEnvFile(filePath: string, map: EnvMap) {
  fs.writeFileSync(filePath, serializeEnv(map), "utf8");
}

export function writeEnvLines(filePath: string, lines: string[]) {
  const normalized = lines
    .map((l) => l.replace(/\r?\n/g, ""))
    .filter((l) => l.length > 0);
  fs.writeFileSync(filePath, normalized.join("\n") + "\n", "utf8");
}

export const EDITABLE_KEYS = [
  "MAX_PLAYERS",
  "SERVER_PASSWORD",
  "ARK_ADMIN_PASSWORD",
  "CLUSTER_ID",
  "MODS",
  "ALL_MODS",
  "ARK_EXTRA_OPTS",
  "ARK_EXTRA_DASH_OPTS",
] as const;

export type EditableKey = (typeof EDITABLE_KEYS)[number];

export type ClusterEditableSettings = {
  MAX_PLAYERS?: number;
  SERVER_PASSWORD?: string;
  ARK_ADMIN_PASSWORD?: string;
  CLUSTER_ID?: string;
  MODS?: string;
  ALL_MODS?: string;
  ARK_EXTRA_OPTS?: string;
  ARK_EXTRA_DASH_OPTS?: string;
};

export function validateMaxPlayers(value: unknown): { ok: boolean; value?: number; error?: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: undefined };
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: "MAX_PLAYERS は整数で指定してください" };
  if (n < 1 || n > 100) return { ok: false, error: "MAX_PLAYERS は 1〜100 の範囲で指定してください" };
  return { ok: true, value: n };
}

// Passwords: allow symbols, but forbid whitespace/newlines and env-breaking/comment chars.
export function validatePassword(value: unknown, label: string): { ok: boolean; value?: string; error?: string } {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "string") return { ok: false, error: `${label} は文字列で指定してください` };
  if (value.length > 32) return { ok: false, error: `${label} は 32 文字以内で指定してください` };
  // Avoid breaking .env parsing and accidental commenting/quoting issues.
  if (/[\s\r\n#'"]/u.test(value)) {
    return {
      ok: false,
      error: `${label} に空白/改行/#/'/\" は使用できません（.env破壊防止）`,
    };
  }
  return { ok: true, value };
}

export function validateModsCsv(value: unknown): { ok: boolean; value?: string; error?: string } {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "string") return { ok: false, error: "MODS は文字列で指定してください" };
  if (!value) return { ok: true, value: "" };
  if (!/^\d+(,\d+)*$/.test(value)) {
    return { ok: false, error: "MODS は数字IDをカンマ区切りで指定してください" };
  }
  return { ok: true, value };
}

export function validateAllModsCsv(value: unknown): { ok: boolean; value?: string; error?: string } {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "string") return { ok: false, error: "ALL_MODS は文字列で指定してください" };
  if (!value) return { ok: true, value: "" };
  if (!/^\d+(,\d+)*$/.test(value)) {
    return { ok: false, error: "ALL_MODS は数字IDをカンマ区切りで指定してください" };
  }
  return { ok: true, value };
}

export function validateCronWithSupercronic(value: string): { ok: boolean; error?: string } {
  if (!value) return { ok: false, error: "Cron 式を入力してください" };

  const tmpFile = path.join("/tmp", `crontab-${Date.now()}`);
  try {
    fs.writeFileSync(tmpFile, `${value} true\n`, "utf8");
    execFileSync("supercronic", ["--no-reap", "-test", tmpFile]);
    return { ok: true };
  } catch (e: any) {
    if (e.code === "ENOENT") {
      console.warn("supercronic not found, skipping cron validation");
      return { ok: true };
    }
    const msg = e?.stderr?.toString() || e?.stdout?.toString() || String(e);
    return { ok: false, error: `無効な Cron 式です: ${msg}` };
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

export function calculateSlavePorts(env: EnvMap): string {
  const ports: string[] = [];
  for (let i = 1; i < 10; i++) {
    const map = env[`ASA${i}_SERVER_MAP`];
    const port = env[`ASA${i}_SERVER_PORT`];
    if (map && port) {
      ports.push(port);
    }
  }
  return ports.join(",");
}

export const CLUSTER_CONFIG_KEYS = [
  "ASA_SESSION_PREFIX",
  "ASA_AUTO_BACKUP_ENABLED",
  "ASA_AUTO_BACKUP_CRON_EXPRESSION",
  "ASA_AUTO_UPDATE_ENABLED",
  "ASA_AUTO_UPDATE_CRON_EXPRESSION",
] as const;

export function getAsaServerKeys(index: number) {
  return {
    MAP: `ASA${index}_SERVER_MAP`,
    NAME: `ASA${index}_SESSION_NAME`,
    PORT: `ASA${index}_SERVER_PORT`,
    QUERY: `ASA${index}_QUERY_PORT`,
    CONTAINER: `ASA${index}_CONTAINER_NAME`,
  } as const;
}

export function validateExtra(value: unknown, label: string): { ok: boolean; value?: string; error?: string } {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "string") return { ok: false, error: `${label} は文字列で指定してください` };
  // Allow spaces, but forbid newlines and comment/quote chars.
  if (/[\r\n#'"]/u.test(value)) {
    return { ok: false, error: `${label} に改行/#/'/\" は使用できません（.env破壊防止）` };
  }
  return { ok: true, value };
}

export function mergeEffectiveEnv(base: EnvMap, overrides: ClusterEditableSettings): EnvMap {
  const merged: EnvMap = { ...base };

  if (overrides.MAX_PLAYERS !== undefined) merged.MAX_PLAYERS = String(overrides.MAX_PLAYERS);
  if (overrides.SERVER_PASSWORD !== undefined) merged.SERVER_PASSWORD = overrides.SERVER_PASSWORD;
  if (overrides.ARK_ADMIN_PASSWORD !== undefined) merged.ARK_ADMIN_PASSWORD = overrides.ARK_ADMIN_PASSWORD;
  if (overrides.CLUSTER_ID !== undefined) merged.CLUSTER_ID = overrides.CLUSTER_ID;
  if (overrides.MODS !== undefined) merged.MODS = overrides.MODS;
  if (overrides.ARK_EXTRA_OPTS !== undefined) merged.ARK_EXTRA_OPTS = overrides.ARK_EXTRA_OPTS;
  if (overrides.ARK_EXTRA_DASH_OPTS !== undefined) merged.ARK_EXTRA_DASH_OPTS = overrides.ARK_EXTRA_DASH_OPTS;

  return merged;
}
