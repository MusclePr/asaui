import { NextRequest, NextResponse } from "next/server";
import { addToBypassList, removeFromBypassList } from "@/lib/storage";
import { execRcon } from "@/lib/docker";
import { SERVERS } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    addToBypassList(eosId);
    const targets = SERVERS.map(server => server.id).filter(Boolean);
    await Promise.all(targets.map(id => execRcon(id, `AllowPlayerToJoinNoCheck ${eosId}`)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    removeFromBypassList(eosId);
    const targets = SERVERS.map(server => server.id).filter(Boolean);
    await Promise.all(targets.map(id => execRcon(id, `DisallowPlayerToJoinNoCheck ${eosId}`)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
