import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { addToBypassList, addToWhitelist, setPlayerDisplayName } from "@/lib/storage";
import { execRcon } from "@/lib/docker";
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
    const targets = servers.map(server => server.id).filter(Boolean);

    if (whitelist) {
      addToWhitelist(eosId);
      // ホワイトリストに追加・削除するコマンドは存在しないため、ここではRCONコマンドを実行しない
      // await Promise.all(targets.map(id => execRcon(id, `AllowPlayerToJoin ${eosId}`)));
    }

    if (bypass) {
      // バイパスリスト：RCON優先。すべてのRCON失敗時のみファイル書き込み
      const rconResults = await Promise.allSettled(targets.map(id => execRcon(id, `AllowPlayerToJoinNoCheck ${eosId}`)));
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
