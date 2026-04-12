import { NextResponse } from "next/server";
import { forbiddenResponse, requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import {
  getDiskUsage,
  listBackups,
  createBackup,
  isContainerRunning,
  getMainServerContainerName,
} from "@/lib/backups";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const mainContainerName = getMainServerContainerName();
    const [diskUsage, backups, isRunning] = await Promise.all([
      getDiskUsage(),
      listBackups(),
      isContainerRunning(mainContainerName),
    ]);
    return NextResponse.json({ diskUsage, backups, isRunning });
  } catch (error) {
    console.error("Failed to fetch backups:", error);
    return NextResponse.json({ error: "Failed to fetch backups" }, { status: 500 });
  }
}

export async function POST() {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();
  if (session.user?.role !== "admin") return forbiddenResponse();

  try {
    await createBackup();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to create backup:", error);
    return NextResponse.json({ error: "Failed to create backup" }, { status: 500 });
  }
}
