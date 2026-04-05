import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { addToBypassList, getBypassList, removeFromBypassList } from "@/lib/storage";
import { execManagerUnpause, execRcon } from "@/lib/docker";
import { getServers } from "@/lib/config";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

async function runBypassRcon(commandBuilder: (eosId: string) => string, eosId: string): Promise<boolean> {
  const servers = getServers();
  const targets = servers
    .map(server => server.containerName || server.id)
    .filter(Boolean);

  if (targets.length === 0) {
    // No servers to run RCON on, allow file write
    return false;
  }

  let anyRconSucceeded = false;

  const results = await Promise.allSettled(targets.map(async (id) => {
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
      return true; // RCON succeeded
    } catch (error: unknown) {
      console.warn(`Failed to execute bypass RCON command for ${id}`, error);
      return false; // RCON failed
    }
  }));

  // Check if at least one RCON succeeded
  anyRconSucceeded = results.some(result => result.status === "fulfilled" && result.value === true);

  // Return true if all RCONs failed (allowing file write), false if any succeeded
  return !anyRconSucceeded;
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { eosId } = await req.json();
    if (!eosId) return NextResponse.json({ error: "EOS ID required" }, { status: 400 });

    // Try RCON first
    const shouldWriteFile = await runBypassRcon((value) => `AllowPlayerToJoinNoCheck ${value}`, eosId);

    // Only write to file if all RCONs failed
    if (shouldWriteFile) {
      addToBypassList(eosId);
    }

    const list = getBypassList();
    if (!list.includes(eosId)) {
      return NextResponse.json({ error: "Failed to register EOS ID to bypass list" }, { status: 500 });
    }

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

    // Try RCON first
    const shouldWriteFile = await runBypassRcon((value) => `DisallowPlayerToJoinNoCheck ${value}`, eosId);

    // Only write to file if all RCONs failed
    if (shouldWriteFile) {
      removeFromBypassList(eosId);
    }

    const list = getBypassList();
    if (list.includes(eosId)) {
      return NextResponse.json({ error: "Failed to remove EOS ID from bypass list" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
