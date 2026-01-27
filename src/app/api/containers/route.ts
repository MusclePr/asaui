import { NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { getContainers } from "@/lib/docker";
import { getServers } from "@/lib/config";
import { refreshServerCache } from "@/lib/compose";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    // If no servers are cached, trigger a refresh
    if (getServers().length === 0) {
      await refreshServerCache();
    }
    const containers = await getContainers();
    return NextResponse.json(containers);
  } catch (error: any) {
    console.error("Error in /api/containers:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
