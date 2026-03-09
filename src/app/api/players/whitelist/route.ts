import { NextRequest, NextResponse } from "next/server";
import { addToWhitelist, removeFromWhitelist } from "@/lib/storage";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    addToWhitelist(eosId);
    // ホワイトリストに追加・削除するコマンドは存在しないため、ここではRCONコマンドを実行しない
    // const servers = getServers();
    // const targets = servers.map(server => server.id).filter(Boolean);
    // await Promise.all(targets.map(id => execRcon(id, `AllowPlayerToJoin ${eosId}`)));

    return NextResponse.json({ success: true });
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

    removeFromWhitelist(eosId);
    // ホワイトリストに追加・削除するコマンドは存在しないため、ここではRCONコマンドを実行しない
    // const targets = SERVERS.map(server => server.id).filter(Boolean);
    // await Promise.all(targets.map(id => execRcon(id, `DisallowPlayerToJoin ${eosId}`)));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
