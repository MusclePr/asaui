import { NextRequest, NextResponse } from "next/server";
import { deleteBackup } from "@/lib/backups";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    await deleteBackup(filename);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Failed to delete backup:`, error);
    return NextResponse.json({ error: "Failed to delete backup" }, { status: 500 });
  }
}
