import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { addToBypassList, getBypassList, removeFromBypassList } from "@/lib/storage";
import { execManagerUnpause, execRcon, getContainers } from "@/lib/docker";
import { getServers } from "@/lib/config";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

type RconTarget = {
  id: string;
  name: string;
};

type RconRunResult = {
  success: boolean;
  failedServers: RconTarget[];
  skipped: boolean;
};

async function hasAnyRunningManagedContainer(): Promise<boolean> {
  try {
    const containers = await getContainers();
    return containers.some((container) => container.isManaged && container.state === "running");
  } catch (error: unknown) {
    console.warn("Failed to inspect containers before bypass RCON. Fallback to file-only operation.", error);
    return false;
  }
}

async function runBypassRcon(commandBuilder: (eosId: string) => string, eosId: string): Promise<RconRunResult> {
  const servers = getServers();
  const targets = servers
    .map((server) => {
      const id = server.containerName || server.id;
      if (!id) return null;
      return {
        id,
        name: server.sessionName || server.containerName || server.id,
      };
    })
    .filter((target): target is RconTarget => target !== null);

  if (targets.length === 0) {
    return { success: true, failedServers: [], skipped: true };
  }

  // docker compose down や全停止状態では、RCONを試行せずファイル操作のみで完了する。
  const hasRunningContainer = await hasAnyRunningManagedContainer();
  if (!hasRunningContainer) {
    return { success: true, failedServers: [], skipped: true };
  }

  const failedServers = new Set<string>();

  await Promise.allSettled(targets.map(async (target) => {
    // Best effort: always issue manager unpause first to avoid stale/missed pause-state detection.
    try {
      const unpauseOutput = await execManagerUnpause(target.id);
      if (unpauseOutput) {
        console.info(`manager unpause output for ${target.id}: ${unpauseOutput}`);
      }
    } catch (error: unknown) {
      console.warn(`Failed to run manager unpause before bypass RCON: ${target.id}`, error);
    }

    try {
      await execRcon(target.id, commandBuilder(eosId));
    } catch (error: unknown) {
      console.warn(`Failed to execute bypass RCON command for ${target.id}`, error);
      failedServers.add(target.id);
    }
  }));

  return {
    success: failedServers.size === 0,
    failedServers: targets.filter((target) => failedServers.has(target.id)),
    skipped: false,
  };
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    const result = await runBypassRcon((value) => `AllowPlayerToJoinNoCheck ${value}`, eosId);

    // Keep local file state in sync regardless of RCON execution outcome.
    addToBypassList(eosId);

    const list = getBypassList();
    if (!list.includes(eosId)) {
      return NextResponse.json({ error: "Failed to register EOS ID to bypass list" }, { status: 500 });
    }

    return NextResponse.json({
      success: result.success,
      failedServers: result.failedServers,
      needsRestartConfirmation: result.failedServers.length > 0,
      message: result.skipped
        ? "全サーバーでRCONが利用できないため、ファイル操作のみを実行しました。"
        : result.success
        ? "適用が完了しました。"
        : "以下のサーバーに適用できませんでした。全てのサーバーに反映するには、再起動が必要です。",
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    const result = await runBypassRcon((value) => `DisallowPlayerToJoinNoCheck ${value}`, eosId);

    // Keep local file state in sync regardless of RCON execution outcome.
    removeFromBypassList(eosId);

    const list = getBypassList();
    if (list.includes(eosId)) {
      return NextResponse.json({ error: "Failed to remove EOS ID from bypass list" }, { status: 500 });
    }

    return NextResponse.json({
      success: result.success,
      failedServers: result.failedServers,
      needsRestartConfirmation: result.failedServers.length > 0,
      message: result.skipped
        ? "全サーバーでRCONが利用できないため、ファイル操作のみを実行しました。"
        : result.success
        ? "適用が完了しました。"
        : "以下のサーバーに適用できませんでした。全てのサーバーに反映するには、再起動が必要です。",
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
