import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import {
  CLUSTER_DIR,
  CLUSTER_ENV_FILE,
  CLUSTER_ENV_TEMPLATE_FILE,
} from "@/lib/cluster";
import {
  parseEnvText,
  serializeEnv,
  validateCronWithSupercronic,
  calculateSlavePorts,
  CLUSTER_CONFIG_KEYS,
  getAsaServerKeys,
} from "@/lib/envfile";
import { refreshServerCache } from "@/lib/compose";

function ensureEnvExists() {
  if (fs.existsSync(CLUSTER_ENV_FILE)) return;
  if (!fs.existsSync(CLUSTER_ENV_TEMPLATE_FILE)) {
    throw new Error(`Missing template env: ${CLUSTER_ENV_TEMPLATE_FILE}`);
  }
  fs.copyFileSync(CLUSTER_ENV_TEMPLATE_FILE, CLUSTER_ENV_FILE);
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    ensureEnvExists();
    const env = parseEnvText(fs.readFileSync(CLUSTER_ENV_FILE, "utf8"));
    return NextResponse.json({ env });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { updates } = (await req.json()) as { updates: Record<string, string | boolean> };
    ensureEnvExists();
    const currentEnv = parseEnvText(fs.readFileSync(CLUSTER_ENV_FILE, "utf8"));

    const newEnv = { ...currentEnv };

    // Update infra settings
    for (const key of CLUSTER_CONFIG_KEYS) {
      if (updates[key] !== undefined) {
        newEnv[key] = String(updates[key]);
      }
    }

    // Validate Cron expressions if updated
    if (updates.ASA_AUTO_BACKUP_ENABLED === "true" || (updates.ASA_AUTO_BACKUP_ENABLED === undefined && newEnv.ASA_AUTO_BACKUP_ENABLED === "true")) {
      if (updates.ASA_AUTO_BACKUP_CRON_EXPRESSION) {
        const cronV = validateCronWithSupercronic(String(updates.ASA_AUTO_BACKUP_CRON_EXPRESSION));
        if (!cronV.ok) return NextResponse.json({ error: cronV.error }, { status: 400 });
      }
    }
    if (updates.ASA_AUTO_UPDATE_ENABLED === "true" || (updates.ASA_AUTO_UPDATE_ENABLED === undefined && newEnv.ASA_AUTO_UPDATE_ENABLED === "true")) {
      if (updates.ASA_AUTO_UPDATE_CRON_EXPRESSION) {
        const cronV = validateCronWithSupercronic(String(updates.ASA_AUTO_UPDATE_CRON_EXPRESSION));
        if (!cronV.ok) return NextResponse.json({ error: cronV.error }, { status: 400 });
      }
    }

    // Update server settings (Map only as per request)
    for (let i = 0; i < 10; i++) {
      const keys = getAsaServerKeys(i);
      if (updates[keys.MAP] !== undefined) {
        const mapValue = String(updates[keys.MAP]);
        if (mapValue) {
          newEnv[keys.MAP] = mapValue;
        } else {
          delete newEnv[keys.MAP];
        }
      }
    }

    // Validate map duplication
    const mapCounts: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      const keys = getAsaServerKeys(i);
      const map = newEnv[keys.MAP];
      if (map) {
        mapCounts[map] = (mapCounts[map] || 0) + 1;
        if (mapCounts[map] > 1) {
          return NextResponse.json({ error: `マップ「${map}」が重複しています。各サーバーには異なるマップを指定してください。` }, { status: 400 });
        }
      }
    }

    // Auto-calculate SLAVE_PORTS
    newEnv["ASA_SLAVE_PORTS"] = calculateSlavePorts(newEnv);

    // Save
    fs.writeFileSync(CLUSTER_ENV_FILE, serializeEnv(newEnv), "utf8");

    // Refresh cache
    await refreshServerCache();

    return NextResponse.json({ success: true, env: newEnv });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
