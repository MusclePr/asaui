import { NextRequest, NextResponse } from "next/server";
import { addToWhitelist, removeFromWhitelist } from "@/lib/storage";
import { execRcon } from "@/lib/docker";
import { SERVERS } from "@/lib/config";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    addToWhitelist(eosId);
    // ホワイトリストに追加・削除するコマンドは存在しないため、ここではRCONコマンドを実行しない
    // const targets = SERVERS.map(server => server.id).filter(Boolean);
    // await Promise.all(targets.map(id => execRcon(id, `AllowPlayerToJoin ${eosId}`)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    removeFromWhitelist(eosId);
    // ホワイトリストに追加・削除するコマンドは存在しないため、ここではRCONコマンドを実行しない
    // const targets = SERVERS.map(server => server.id).filter(Boolean);
    // await Promise.all(targets.map(id => execRcon(id, `DisallowPlayerToJoin ${eosId}`)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
