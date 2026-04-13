import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { addToBypassList, addToWhitelist, setPlayerDisplayName } from "@/lib/storage";
import { execManagerUnpause, execRcon } from "@/lib/docker";
import { getServers } from "@/lib/config";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId, whitelist, bypass, displayName, name } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    const resolvedDisplayName = (displayName ?? name ?? "").trim();
    setPlayerDisplayName(eosId, resolvedDisplayName);

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

    if (whitelist) {
      addToWhitelist(eosId);
      // ホワイトリストに追加・削除するコマンドは存在しないため、ここではRCONコマンドを実行しない
      // await Promise.all(targets.map(id => execRcon(id, `AllowPlayerToJoin ${eosId}`)));
    }

    if (bypass) {
      await Promise.allSettled(targets.map(async (target) => {
        try {
          const unpauseOutput = await execManagerUnpause(target.id);
          if (unpauseOutput) {
            console.info(`manager unpause output for ${target.id}: ${unpauseOutput}`);
          }
        } catch (error: unknown) {
          console.warn(`Failed to run manager unpause before register bypass RCON: ${target.id}`, error);
        }

        try {
          await execRcon(target.id, `AllowPlayerToJoinNoCheck ${eosId}`);
        } catch (error: unknown) {
          console.warn(`Failed to execute register bypass RCON command for ${target.id}`, error);
          failedServers.add(target.id);
        }
      }));

      // Keep local file state in sync regardless of RCON execution outcome.
      addToBypassList(eosId);
    }

    const failedServerList = targets.filter((target) => failedServers.has(target.id));

    return NextResponse.json({
      success: failedServerList.length === 0,
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
