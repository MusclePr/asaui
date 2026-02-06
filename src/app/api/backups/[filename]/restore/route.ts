import { NextRequest, NextResponse } from "next/server";
import { restoreBackup } from "@/lib/backups";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    await restoreBackup(filename);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Failed to restore backup:`, error);
    return NextResponse.json({ error: "Failed to restore backup" }, { status: 500 });
  }
}
