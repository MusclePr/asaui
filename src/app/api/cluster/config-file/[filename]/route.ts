import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readServerConfigWithRevision, saveServerConfigWithMerge } from "@/lib/serverConfig";
import { hasAnyManagedServerRunning } from "@/lib/docker";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { filename } = await params;
    const { content, revision, sourceTarget, pendingTemp } = readServerConfigWithRevision(filename);
    return NextResponse.json({ content, revision, sourceTarget, pendingTemp });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can edit raw config files
  if (session.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { filename } = await params;
    const body = await req.json();
    const content = typeof body.content === "string" ? body.content : "";
    const baseContent = typeof body.baseContent === "string" ? body.baseContent : "";
    const baseRevision = typeof body.baseRevision === "string" ? body.baseRevision : "";
    const anyRunning = await hasAnyManagedServerRunning();

    const result = saveServerConfigWithMerge(filename, {
      newContent: content,
      baseContent,
      baseRevision,
      saveTarget: anyRunning ? "tmp" : "ini",
    });

    if (result.status === "conflict") {
      return NextResponse.json(
        {
          status: result.status,
          message: result.message,
          content: result.content,
          revision: result.revision,
          saveTarget: result.saveTarget,
          pendingTemp: result.pendingTemp,
          conflict: result.conflict,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      status: result.status,
      message: result.message,
      content: result.content,
      revision: result.revision,
      saveTarget: result.saveTarget,
      pendingTemp: result.pendingTemp,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
