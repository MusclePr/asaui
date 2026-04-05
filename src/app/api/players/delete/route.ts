import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { removeFromBypassList, removeFromWhitelist, setPlayerDisplayName } from "@/lib/storage";
import { execRcon } from "@/lib/docker";
import { getServers } from "@/lib/config";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    removeFromWhitelist(eosId);
    setPlayerDisplayName(eosId, null);

    const servers = getServers();
    const targets = servers.map(server => server.id).filter(Boolean);
    const rconResults = await Promise.allSettled(
      targets.map(id => execRcon(id, `DisallowPlayerToJoinNoCheck ${eosId}`))
    );
    const anyRconSucceeded = rconResults.some(result => result.status === "fulfilled");
    
    if (!anyRconSucceeded) {
      // すべてのRCONが失敗した場合のみファイル削除
      removeFromBypassList(eosId);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
