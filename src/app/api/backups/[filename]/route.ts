import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { deleteBackup } from "@/lib/backups";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { filename } = await params;
    await deleteBackup(filename);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Failed to delete backup:`, error);
    return NextResponse.json({ error: "Failed to delete backup" }, { status: 500 });
  }
}
