import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { clearBypassList, getBypassList } from "@/lib/storage";
import { execManagerUnpause, execRcon, getContainers } from "@/lib/docker";
import { getServers } from "@/lib/config";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

async function hasAnyRunningManagedContainer(): Promise<boolean> {
  try {
    const containers = await getContainers();
    return containers.some((container) => container.isManaged && container.state === "running");
  } catch (error: unknown) {
    console.warn("Failed to inspect containers before bulk bypass clear RCON. Fallback to file-only operation.", error);
    return false;
  }
}

export async function POST(_req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const bypassedEosIds = getBypassList();

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
      .filter((target): target is { id: string; name: string } => target !== null);

    const failedServers = new Set<string>();

    // docker compose down や全停止状態では、RCONを試行せずファイル操作のみで完了する。
    const hasRunningContainer = await hasAnyRunningManagedContainer();

    if (!hasRunningContainer) {
      clearBypassList();
      return NextResponse.json({
        success: true,
        clearedCount: bypassedEosIds.length,
        failedServers: [],
        needsRestartConfirmation: false,
        message: "全サーバーでRCONが利用できないため、ファイル操作のみを実行しました。",
      });
    }

    await Promise.allSettled(targets.map(async (target) => {
      try {
        const unpauseOutput = await execManagerUnpause(target.id);
        if (unpauseOutput) {
          console.info(`manager unpause output for clear bulk bypass ${target.id}: ${unpauseOutput}`);
        }
      } catch (error: unknown) {
        console.warn(`Failed to run manager unpause for clear bulk bypass ${target.id}:`, error);
      }
    }));

    if (bypassedEosIds.length > 0) {
      await Promise.allSettled(
        targets.flatMap((target) =>
          bypassedEosIds.map((eosId) =>
          (async () => {
            try {
              await execRcon(target.id, `DisallowPlayerToJoinNoCheck ${eosId}`);
            } catch (error: unknown) {
              console.warn(`Failed to execute DisallowPlayerToJoinNoCheck for ${eosId} on ${target.id}:`, error);
              failedServers.add(target.id);
            }
          })()
          )
        )
      );
    }

    // Keep local file state deterministic for next restart.
    clearBypassList();

    const failedServerList = targets.filter((target) => failedServers.has(target.id));

    return NextResponse.json({
      success: failedServerList.length === 0,
      clearedCount: bypassedEosIds.length,
      failedServers: failedServerList,
      needsRestartConfirmation: failedServerList.length > 0,
      message: failedServerList.length === 0
        ? "適用が完了しました。"
        : "以下のサーバーに適用できませんでした。全てのサーバーに反映するには、再起動が必要です。",
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
