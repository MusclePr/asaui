import { NextRequest, NextResponse } from "next/server";
import { manageContainer } from "@/lib/docker";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { action } = await req.json();
    await manageContainer(params.id, action);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
