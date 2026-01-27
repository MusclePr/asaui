import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import {
  CLUSTER_DIR,
  CLUSTER_ENV_DEFAULT_FILE,
  CLUSTER_ENV_EFFECTIVE_FILE,
  CLUSTER_ENV_OVERRIDE_FILE,
} from "@/lib/cluster";
import {
  mergeEffectiveEnv,
  parseEnvText,
  serializeEnv,
  validateExtra,
  validateMaxPlayers,
  validateModsCsv,
  validatePassword,
} from "@/lib/envfile";
import { refreshServerCache } from "@/lib/compose";

const OVERRIDE_KEYS = [
  "MAX_PLAYERS",
  "SERVER_PASSWORD",
  "ARK_ADMIN_PASSWORD",
  "MODS",
  "ARK_EXTRA_OPTS",
  "ARK_EXTRA_DASH_OPTS",
] as const;

type Body = {
  MAX_PLAYERS?: number;
  SERVER_PASSWORD?: string;
  ARK_ADMIN_PASSWORD?: string;
  MODS?: string;
  ARK_EXTRA_OPTS?: string;
  ARK_EXTRA_DASH_OPTS?: string;
};

function ensureBaseEnvExists() {
  if (fs.existsSync(CLUSTER_ENV_DEFAULT_FILE)) return;
  const samplePath = path.join(CLUSTER_DIR, ".env.sample");
  if (!fs.existsSync(samplePath)) {
    throw new Error(`Missing base env: ${CLUSTER_ENV_DEFAULT_FILE} (and sample not found)`);
  }
  fs.copyFileSync(samplePath, CLUSTER_ENV_DEFAULT_FILE);
}

function readOverrides(): Record<string, string> {
  if (!fs.existsSync(CLUSTER_ENV_OVERRIDE_FILE)) return {};
  const text = fs.readFileSync(CLUSTER_ENV_OVERRIDE_FILE, "utf8");
  return parseEnvText(text);
}

function writeOverrides(overrides: Record<string, string>) {
  const lines: string[] = [];
  for (const key of OVERRIDE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      lines.push(`${key}=${overrides[key] ?? ""}`);
    }
  }
  fs.writeFileSync(CLUSTER_ENV_OVERRIDE_FILE, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
}

function generateEffectiveEnv(overrides: Body) {
  ensureBaseEnvExists();
  const baseText = fs.readFileSync(CLUSTER_ENV_DEFAULT_FILE, "utf8");
  const baseMap = parseEnvText(baseText);

  const merged = mergeEffectiveEnv(baseMap, overrides);
  fs.writeFileSync(CLUSTER_ENV_EFFECTIVE_FILE, serializeEnv(merged), "utf8");
  return merged;
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    ensureBaseEnvExists();
    const base = parseEnvText(fs.readFileSync(CLUSTER_ENV_DEFAULT_FILE, "utf8"));
    const currentOverrides = readOverrides();

    const defaults: Body = {};
    const defaultMaxPlayers = Number(base.MAX_PLAYERS ?? "");
    if (Number.isFinite(defaultMaxPlayers)) defaults.MAX_PLAYERS = defaultMaxPlayers;
    defaults.SERVER_PASSWORD = base.SERVER_PASSWORD ?? "";
    defaults.ARK_ADMIN_PASSWORD = base.ARK_ADMIN_PASSWORD ?? "";
    defaults.MODS = base.MODS ?? "";
    defaults.ARK_EXTRA_OPTS = base.ARK_EXTRA_OPTS ?? "";
    defaults.ARK_EXTRA_DASH_OPTS = base.ARK_EXTRA_DASH_OPTS ?? "";

    const body: Body = {};
    // Prefer override values if present, otherwise base values.
    const maxPlayersRaw =
      currentOverrides.MAX_PLAYERS ?? base.MAX_PLAYERS ?? "";
    const maxPlayers = Number(maxPlayersRaw);
    if (Number.isFinite(maxPlayers)) body.MAX_PLAYERS = maxPlayers;

    body.SERVER_PASSWORD =
      currentOverrides.SERVER_PASSWORD ?? base.SERVER_PASSWORD ?? "";
    body.ARK_ADMIN_PASSWORD =
      currentOverrides.ARK_ADMIN_PASSWORD ?? base.ARK_ADMIN_PASSWORD ?? "";
    body.MODS = currentOverrides.MODS ?? base.MODS ?? "";
    body.ARK_EXTRA_OPTS =
      currentOverrides.ARK_EXTRA_OPTS ?? base.ARK_EXTRA_OPTS ?? "";
    body.ARK_EXTRA_DASH_OPTS =
      currentOverrides.ARK_EXTRA_DASH_OPTS ?? base.ARK_EXTRA_DASH_OPTS ?? "";

    // Also return effective preview (generated on demand in PUT, but helpful for UI).
    const effective = {
      ...base,
      ...currentOverrides,
    };

    return NextResponse.json({ settings: body, defaults, effective });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const raw = (await req.json()) as Body;

    const maxPlayersV = validateMaxPlayers(raw.MAX_PLAYERS);
    if (!maxPlayersV.ok) return NextResponse.json({ error: maxPlayersV.error }, { status: 400 });

    const serverPassV = validatePassword(raw.SERVER_PASSWORD ?? "", "SERVER_PASSWORD");
    if (!serverPassV.ok) return NextResponse.json({ error: serverPassV.error }, { status: 400 });

    const adminPassV = validatePassword(raw.ARK_ADMIN_PASSWORD ?? "", "ARK_ADMIN_PASSWORD");
    if (!adminPassV.ok) return NextResponse.json({ error: adminPassV.error }, { status: 400 });

    const modsV = validateModsCsv(raw.MODS ?? "");
    if (!modsV.ok) return NextResponse.json({ error: modsV.error }, { status: 400 });

    const extraOptsV = validateExtra(raw.ARK_EXTRA_OPTS ?? "", "ARK_EXTRA_OPTS");
    if (!extraOptsV.ok) return NextResponse.json({ error: extraOptsV.error }, { status: 400 });

    const extraDashV = validateExtra(raw.ARK_EXTRA_DASH_OPTS ?? "", "ARK_EXTRA_DASH_OPTS");
    if (!extraDashV.ok) return NextResponse.json({ error: extraDashV.error }, { status: 400 });

    const overridesToWrite: Record<string, string> = {
      MAX_PLAYERS: maxPlayersV.value !== undefined ? String(maxPlayersV.value) : "",
      SERVER_PASSWORD: serverPassV.value ?? "",
      ARK_ADMIN_PASSWORD: adminPassV.value ?? "",
      MODS: modsV.value ?? "",
      ARK_EXTRA_OPTS: extraOptsV.value ?? "",
      ARK_EXTRA_DASH_OPTS: extraDashV.value ?? "",
    };

    // Persist override file (comment-less).
    writeOverrides(overridesToWrite);

    const merged = generateEffectiveEnv({
      MAX_PLAYERS: maxPlayersV.value ?? undefined,
      SERVER_PASSWORD: serverPassV.value ?? "",
      ARK_ADMIN_PASSWORD: adminPassV.value ?? "",
      MODS: modsV.value ?? "",
      ARK_EXTRA_OPTS: extraOptsV.value ?? "",
      ARK_EXTRA_DASH_OPTS: extraDashV.value ?? "",
    });

    await refreshServerCache();

    return NextResponse.json({ success: true, effective: merged });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
