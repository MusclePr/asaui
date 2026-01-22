import { NextRequest, NextResponse } from "next/server";
import { addToWhitelist, removeFromWhitelist } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const { steamId } = await req.json();
  addToWhitelist(steamId);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { steamId } = await req.json();
  removeFromWhitelist(steamId);
  return NextResponse.json({ success: true });
}
