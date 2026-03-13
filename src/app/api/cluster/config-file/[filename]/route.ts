import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readServerConfigWithRevision, saveServerConfigWithMerge } from "@/lib/serverConfig";

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
    const { content, revision } = readServerConfigWithRevision(filename);
    return NextResponse.json({ content, revision });
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

    const result = saveServerConfigWithMerge(filename, {
      newContent: content,
      baseContent,
      baseRevision,
    });

    if (result.status === "conflict") {
      return NextResponse.json(
        {
          status: result.status,
          message: result.message,
          content: result.content,
          revision: result.revision,
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
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
