import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ARK_SAVE_BASE_DIR, SERVERS } from "@/lib/config";
import { getWhitelist } from "@/lib/storage";

export async function GET() {
  try {
    const whitelist = getWhitelist();
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
        const steamId = file.replace(".arkprofile", "");
        
        // Simple name extraction (mock or read file header if needed)
        // For now, use SteamID as name if multiple maps found, keep latest login
        const lastLogin = stats.mtime.toISOString().replace("T", " ").split(".")[0];

        if (!playersMap.has(steamId) || new Date(lastLogin) > new Date(playersMap.get(steamId).lastLogin)) {
          playersMap.set(steamId, {
            name: steamId, // Ideal: Extract from file
            steamId,
            lastLogin,
            isWhitelisted: whitelist.includes(steamId)
          });
        }
      }
    }

    return NextResponse.json(Array.from(playersMap.values()));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
