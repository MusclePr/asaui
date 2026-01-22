import { NextRequest, NextResponse } from "next/server";
import { getContainers } from "@/lib/docker";

export async function GET() {
  try {
    const containers = await getContainers();
    return NextResponse.json(containers);
  } catch (error: any) {
    console.error("Error in /api/containers:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
