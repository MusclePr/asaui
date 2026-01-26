import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { execRcon } from "@/lib/docker";
import { ARK_MAP_MAIN } from "@/lib/config";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { command } = await req.json();
    if (!command) return NextResponse.json({ error: "Command required" }, { status: 400 });

    const output = await execRcon(ARK_MAP_MAIN, command);
    return NextResponse.json({ output });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
