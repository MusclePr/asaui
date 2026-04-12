import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { restoreBackup } from "@/lib/backups";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { filename } = await params;
    await restoreBackup(filename);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Failed to restore backup:`, error);
    return NextResponse.json({ error: "Failed to restore backup" }, { status: 500 });
  }
}
