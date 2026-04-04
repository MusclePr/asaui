import { NextRequest, NextResponse } from "next/server";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { clearBypassList } from "@/lib/storage";
import { execManagerUnpause, execRcon } from "@/lib/docker";
import { getServers } from "@/lib/config";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    // Get list of all bypassed players before clearing
    const bypassedEosIds = clearBypassList();

    if (bypassedEosIds.length === 0) {
      return NextResponse.json({ success: true, clearedCount: 0 });
    }

    // Get servers and containers
    const servers = getServers();
    const targets = servers
      .map(server => server.containerName || server.id)
      .filter(Boolean);

    // Step 1: unpause each server once
    await Promise.allSettled(targets.map(async (id) => {
      try {
        const unpauseOutput = await execManagerUnpause(id);
        if (unpauseOutput) {
          console.info(`manager unpause output for clear bulk bypass ${id}: ${unpauseOutput}`);
        }
      } catch (error: unknown) {
        console.warn(`Failed to run manager unpause for clear bulk bypass ${id}:`, error);
      }
    }));

    // Step 2: execute DisallowPlayerToJoinNoCheck for each bypassed player on all servers
    await Promise.allSettled(
      targets.flatMap(id =>
        bypassedEosIds.map(eosId =>
          (async () => {
            try {
              await execRcon(id, `DisallowPlayerToJoinNoCheck ${eosId}`);
            } catch (error: unknown) {
              console.warn(`Failed to execute DisallowPlayerToJoinNoCheck for ${eosId} on ${id}:`, error);
            }
          })()
        )
      )
    );

    return NextResponse.json({ success: true, clearedCount: bypassedEosIds.length });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
