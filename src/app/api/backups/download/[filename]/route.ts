import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { getBackupStream } from "@/lib/backups";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { filename } = await params;
    const stream = getBackupStream(filename);

    if (!stream) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return new NextResponse(stream as unknown as BodyInit, {
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
