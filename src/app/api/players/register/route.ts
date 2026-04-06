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
      .map(server => server.containerName || server.id)
      .filter(Boolean);

    if (whitelist) {
      addToWhitelist(eosId);
      // ホワイトリストに追加・削除するコマンドは存在しないため、ここではRCONコマンドを実行しない
      // await Promise.all(targets.map(id => execRcon(id, `AllowPlayerToJoin ${eosId}`)));
    }

    if (bypass) {
      // 一時的な参加希望者の承認用のバイパスリスト：RCON優先。すべてのRCON失敗時のみファイル書き込み
      // 一覧トグルAPIと同様に unpause を先行して、PAUSED 状態でも即時反映を狙う。
      const rconResults = await Promise.allSettled(targets.map(async (id) => {
        try {
          const unpauseOutput = await execManagerUnpause(id);
          if (unpauseOutput) {
            console.info(`manager unpause output for ${id}: ${unpauseOutput}`);
          }
        } catch (error: unknown) {
          console.warn(`Failed to run manager unpause before register bypass RCON: ${id}`, error);
        }

        try {
          await execRcon(id, `AllowPlayerToJoinNoCheck ${eosId}`);
        } catch (error: unknown) {
          console.warn(`Failed to execute register bypass RCON command for ${id}`, error);
          throw error;
        }
      }));
      const anyRconSucceeded = rconResults.some(result => result.status === "fulfilled");
      
      if (!anyRconSucceeded) {
        // すべてのRCONが失敗した場合のみファイル書き込み
        addToBypassList(eosId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
