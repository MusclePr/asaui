import { NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { fetchCurseForgeMod } from "@/lib/curseforge";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: "Invalid mod id" }, { status: 400 });
    }

    const mod = await fetchCurseForgeMod(id);
    return NextResponse.json(mod);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
