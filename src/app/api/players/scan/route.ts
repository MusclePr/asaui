import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ARK_SAVE_BASE_DIR, SERVERS } from "@/lib/config";
import { getBypassList, getPlayerProfiles, getWhitelist } from "@/lib/storage";

export async function GET() {
  try {
    const whitelist = getWhitelist();
    const bypassList = getBypassList();
    const profiles = getPlayerProfiles();
    const playersMap = new Map<string, any>();

    // Scan each server's save directory
    for (const server of SERVERS) {
      const saveDir = path.join(ARK_SAVE_BASE_DIR, server.map);
      if (!fs.existsSync(saveDir)) continue;

      const files = fs.readdirSync(saveDir);
      const profileFiles = files.filter(f => f.endsWith(".arkprofile"));

      for (const file of profileFiles) {
        const filePath = path.join(saveDir, file);
        const stats = fs.statSync(filePath);
        const eosId = file.replace(".arkprofile", "");
        
        // Simple name extraction (mock or read file header if needed)
        // For now, use EOS ID as name if multiple maps found, keep latest login
        const lastLogin = stats.mtime.toISOString().replace("T", " ").split(".")[0];

        const displayName = profiles[eosId]?.displayName?.trim() || undefined;
        if (!playersMap.has(eosId) || new Date(lastLogin) > new Date(playersMap.get(eosId).lastLogin)) {
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

    return NextResponse.json(Array.from(playersMap.values()));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
