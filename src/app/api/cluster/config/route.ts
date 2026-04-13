import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import {
  CLUSTER_ENV_FILE,
  CLUSTER_ENV_TEMPLATE_FILE,
} from "@/lib/cluster";
import {
  parseEnvText,
  serializeEnv,
  serializeEnvWithTemplate,
  validateCronWithSupercronic,
  calculateSlavePorts,
  CLUSTER_CONFIG_KEYS,
  getAsaServerKeys,
  getClusterNodeCount,
} from "@/lib/envfile";
import { refreshServerCache } from "@/lib/compose";
import { ARK_SAVE_BASE_DIR } from "@/lib/config";
import { ASA_MAP_NAMES, getBaseMapName } from "@/lib/maps";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

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
    const mapsWithSaveData = Object.keys(ASA_MAP_NAMES).filter((mapRaw) => {
      const mapId = getBaseMapName(mapRaw);
      const savePath = `${ARK_SAVE_BASE_DIR}/${mapId}/${mapId}.ark`;
      return fs.existsSync(savePath);
    });
    return NextResponse.json({ env, mapsWithSaveData });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
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
    if (updates.ASA0_AUTO_BACKUP_ENABLED === "true" || (updates.ASA0_AUTO_BACKUP_ENABLED === undefined && newEnv.ASA0_AUTO_BACKUP_ENABLED === "true")) {
      if (updates.ASA0_AUTO_BACKUP_CRON_EXPRESSION) {
        const cronV = validateCronWithSupercronic(String(updates.ASA0_AUTO_BACKUP_CRON_EXPRESSION));
        if (!cronV.ok) return NextResponse.json({ error: cronV.error }, { status: 400 });
      }
    }
    if (updates.ASA0_AUTO_UPDATE_ENABLED === "true" || (updates.ASA0_AUTO_UPDATE_ENABLED === undefined && newEnv.ASA0_AUTO_UPDATE_ENABLED === "true")) {
      if (updates.ASA0_AUTO_UPDATE_CRON_EXPRESSION) {
        const cronV = validateCronWithSupercronic(String(updates.ASA0_AUTO_UPDATE_CRON_EXPRESSION));
        if (!cronV.ok) return NextResponse.json({ error: cronV.error }, { status: 400 });
      }
    }

    const clusterNodeCount = getClusterNodeCount(newEnv);

    // Update server settings (Map and Webhook)
    for (let i = 0; i < clusterNodeCount; i++) {
      const keys = getAsaServerKeys(i);
      // Map
      if (updates[keys.MAP] !== undefined) {
        newEnv[keys.MAP] = String(updates[keys.MAP]);
      }
      // Discord Webhook
      if (updates[keys.WEBHOOK] !== undefined) {
        const webhookValue = String(updates[keys.WEBHOOK]);
        if (webhookValue) {
          newEnv[keys.WEBHOOK] = webhookValue;
        } else {
          delete newEnv[keys.WEBHOOK];
        }
      }
    }

    // Validate map duplication
    const mapOwnersByBase: Record<string, { rawMaps: Set<string>; owners: string[] }> = {};
    for (let i = 0; i < clusterNodeCount; i++) {
      const keys = getAsaServerKeys(i);
      const map = newEnv[keys.MAP];
      if (map) {
        const baseMapId = getBaseMapName(map);
        const owner = `ASA${i}`;
        mapOwnersByBase[baseMapId] = mapOwnersByBase[baseMapId] || {
          rawMaps: new Set<string>(),
          owners: [],
        };
        mapOwnersByBase[baseMapId].rawMaps.add(map);
        mapOwnersByBase[baseMapId].owners.push(owner);
        if (mapOwnersByBase[baseMapId].owners.length > 1) {
          const selectedMaps = Array.from(mapOwnersByBase[baseMapId].rawMaps).join(" / ");
          return NextResponse.json(
            {
              error: `同じマップID「${baseMapId}」が重複しています（選択: ${selectedMaps} / サーバー: ${mapOwnersByBase[baseMapId].owners.join(" / ")}）。各サーバーには異なるマップIDを指定してください。`,
            },
            { status: 400 }
          );
        }
      }
    }

    // Auto-calculate SLAVE_PORTS
    newEnv["ASA_SLAVE_PORTS"] = calculateSlavePorts(newEnv);

    // Save with template layout
    fs.writeFileSync(CLUSTER_ENV_FILE, serializeEnvWithTemplate(newEnv, CLUSTER_ENV_TEMPLATE_FILE), "utf8");

    // Refresh cache
    await refreshServerCache();

    return NextResponse.json({ success: true, env: newEnv });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
