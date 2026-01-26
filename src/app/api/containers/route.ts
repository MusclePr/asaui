import { NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { getContainers } from "@/lib/docker";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const containers = await getContainers();
    return NextResponse.json(containers);
  } catch (error: any) {
    console.error("Error in /api/containers:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
