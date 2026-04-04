import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { addToBypassList, removeFromBypassList } from "@/lib/storage";
import { execManagerUnpause, execRcon } from "@/lib/docker";
import { getServers } from "@/lib/config";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

async function runBypassRcon(commandBuilder: (eosId: string) => string, eosId: string) {
  const servers = getServers();
  const targets = servers
    .map(server => server.containerName || server.id)
    .filter(Boolean);

  await Promise.allSettled(targets.map(async (id) => {
    // Best effort: always issue manager unpause first to avoid stale/missed pause-state detection.
    try {
      const unpauseOutput = await execManagerUnpause(id);
      if (unpauseOutput) {
        console.info(`manager unpause output for ${id}: ${unpauseOutput}`);
      }
    } catch (error: unknown) {
      console.warn(`Failed to run manager unpause before bypass RCON: ${id}`, error);
    }

    try {
      await execRcon(id, commandBuilder(eosId));
    } catch (error: unknown) {
      console.warn(`Failed to execute bypass RCON command for ${id}`, error);
    }
  }));
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    addToBypassList(eosId);
    await runBypassRcon((value) => `AllowPlayerToJoinNoCheck ${value}`, eosId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    removeFromBypassList(eosId);
    await runBypassRcon((value) => `DisallowPlayerToJoinNoCheck ${value}`, eosId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
