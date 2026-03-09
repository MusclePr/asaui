import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { getContainers } from "@/lib/docker";
import { getServers } from "@/lib/config";
import { refreshServerCache } from "@/lib/compose";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";

  try {
    // If no servers are cached, or if forceRefresh is requested, trigger a refresh
    if (getServers().length === 0 || forceRefresh) {
      await refreshServerCache();
    }
    const containers = await getContainers();
    return NextResponse.json(containers);
  } catch (error: unknown) {
    console.error("Error in /api/containers:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
