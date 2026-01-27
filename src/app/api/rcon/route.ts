import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { execRcon } from "@/lib/docker";
import { getMainServerId } from "@/lib/config";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { command, containerId } = await req.json();
    if (!command) return NextResponse.json({ error: "Command required" }, { status: 400 });

    const targetId = containerId || getMainServerId();
    if (!targetId) return NextResponse.json({ error: "No managed servers found" }, { status: 404 });

    const output = await execRcon(targetId, command);
    return NextResponse.json({ output });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
