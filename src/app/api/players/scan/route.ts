import { NextResponse } from "next/server";
import { getServers } from "@/lib/config";
import { getBypassList, getPlayerProfiles, getWhitelist, ensurePlayerProfiles } from "@/lib/storage";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { getSavedPlayersByMap } from "@/lib/docker";
import { isServerCacheSchemaOutdated, refreshServerCache } from "@/lib/compose";

type PlayerEntry = {
  name: string;
  displayName?: string;
  eosId: string;
  lastLogin: string;
  isWhitelisted: boolean;
  isBypassed: boolean;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const whitelist = getWhitelist();
    const bypassList = getBypassList();
    const profiles = getPlayerProfiles();
    const playersMap = new Map<string, PlayerEntry>();
    const allFoundEosIds = new Set<string>();

    if (getServers().length === 0 || isServerCacheSchemaOutdated()) {
      await refreshServerCache();
    }

    const servers = getServers();
    // Scan each server's save data by configured format.
    for (const server of servers) {
      const savedPlayers = await getSavedPlayersByMap(server.map, {
        clusterId: server.clusterId,
        extraDashOpts: server.extraDashOpts,
      });

      for (const saved of savedPlayers) {
        const eosId = saved.eosId;
        allFoundEosIds.add(eosId);

        // Simple name extraction (mock or read file header if needed)
        // For now, use EOS ID as name if multiple maps found, keep latest login
        const lastLogin = saved.lastLogin;

        const displayName = profiles[eosId]?.displayName?.trim() || undefined;
        const current = playersMap.get(eosId);
        if (!current || new Date(lastLogin) > new Date(current.lastLogin)) {
          playersMap.set(eosId, {
            name: eosId, // Ideal: Extract from file
            displayName,
            eosId,
            lastLogin,
            isWhitelisted: whitelist.includes(eosId),
            isBypassed: bypassList.includes(eosId)
          });
        }
      }
    }

    for (const eosId of whitelist) {
      allFoundEosIds.add(eosId);
      const displayName = profiles[eosId]?.displayName?.trim() || undefined;
      if (!playersMap.has(eosId)) {
        playersMap.set(eosId, {
          name: eosId,
          displayName,
          eosId,
          lastLogin: "-",
          isWhitelisted: true,
          isBypassed: bypassList.includes(eosId)
        });
      }
    }

    for (const eosId of bypassList) {
      allFoundEosIds.add(eosId);
      const displayName = profiles[eosId]?.displayName?.trim() || undefined;
      if (!playersMap.has(eosId)) {
        playersMap.set(eosId, {
          name: eosId,
          displayName,
          eosId,
          lastLogin: "-",
          isWhitelisted: whitelist.includes(eosId),
          isBypassed: true
        });
      }
    }

    // Sync unknown IDs to players.json
    ensurePlayerProfiles(Array.from(allFoundEosIds));

    for (const [eosId, profile] of Object.entries(profiles)) {
      const displayName = profile?.displayName?.trim();
      if (!displayName) continue;
      if (!playersMap.has(eosId)) {
        playersMap.set(eosId, {
          name: eosId,
          displayName,
          eosId,
          lastLogin: "-",
          isWhitelisted: whitelist.includes(eosId),
          isBypassed: bypassList.includes(eosId)
        });
      }
    }

    return NextResponse.json(Array.from(playersMap.values()));
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
