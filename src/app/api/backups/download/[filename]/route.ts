import { NextRequest, NextResponse } from "next/server";
import { getBackupStream } from "@/lib/backups";
import path from "node:path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const stream = getBackupStream(filename);

    if (!stream) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return new NextResponse(stream as any, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/gzip",
      },
    });
  } catch (error) {
    console.error(`Failed to download backup:`, error);
    return NextResponse.json({ error: "Failed to download backup" }, { status: 500 });
  }
}
