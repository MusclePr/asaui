import { NextRequest, NextResponse } from "next/server";
import { removeFromBypassList, removeFromWhitelist, setPlayerDisplayName } from "@/lib/storage";
import { execRcon } from "@/lib/docker";
import { SERVERS } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    removeFromWhitelist(eosId);
    // バイパスリストの操作は、RCON コマンドで反映されるため、ここではファイル出力を実行しない
    // removeFromBypassList(eosId);
    setPlayerDisplayName(eosId, null);

    const targets = SERVERS.map(server => server.id).filter(Boolean);
    // ホワイトリストに追加・削除するコマンドは存在しないため、ここではDisallowPlayerToJoinNoCheckコマンドのみ実行する
    await Promise.all([
      // ...targets.map(id => execRcon(id, `DisallowPlayerToJoin ${eosId}`)),
      ...targets.map(id => execRcon(id, `DisallowPlayerToJoinNoCheck ${eosId}`))
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
