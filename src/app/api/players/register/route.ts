import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { addToBypassList, addToWhitelist, setPlayerDisplayName } from "@/lib/storage";
import { execRcon } from "@/lib/docker";
import { SERVERS } from "@/lib/config";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId, whitelist, bypass, displayName, name } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    const resolvedDisplayName = (displayName ?? name ?? "").trim();
    setPlayerDisplayName(eosId, resolvedDisplayName);

    const targets = SERVERS.map(server => server.id).filter(Boolean);

    if (whitelist) {
      addToWhitelist(eosId);
      // ホワイトリストに追加・削除するコマンドは存在しないため、ここではRCONコマンドを実行しない
      // await Promise.all(targets.map(id => execRcon(id, `AllowPlayerToJoin ${eosId}`)));
    }

    if (bypass) {
      // バイパスリストに追加・削除する場合、ファイル出力を実行し、RCONコマンドでの即時反映を試みる（失敗してもファイルには残る）
      addToBypassList(eosId);
      await Promise.allSettled(targets.map(id => execRcon(id, `AllowPlayerToJoinNoCheck ${eosId}`)));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
