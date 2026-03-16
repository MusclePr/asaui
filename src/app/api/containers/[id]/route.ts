import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { manageContainer, setContainerAutoPauseEnabled } from "@/lib/docker";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { action } = await req.json();
    const { id } = await params;
    if (action === "autopause-enable") {
      await setContainerAutoPauseEnabled(id, true);
      return NextResponse.json({ success: true, autoPauseEnabled: true });
    }
    if (action === "autopause-disable") {
      await setContainerAutoPauseEnabled(id, false);
      return NextResponse.json({ success: true, autoPauseEnabled: false });
    }

    await manageContainer(id, action);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
