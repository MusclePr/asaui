import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { addToBypassList, removeFromBypassList } from "@/lib/storage";
import { execRcon } from "@/lib/docker";
import { getServers } from "@/lib/config";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    addToBypassList(eosId);
    const servers = getServers();
    const targets = servers.map(server => server.id).filter(Boolean);
    await Promise.allSettled(targets.map(id => execRcon(id, `AllowPlayerToJoinNoCheck ${eosId}`)));

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

    removeFromBypassList(eosId);
    const servers = getServers();
    const targets = servers.map(server => server.id).filter(Boolean);
    await Promise.allSettled(targets.map(id => execRcon(id, `DisallowPlayerToJoinNoCheck ${eosId}`)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
