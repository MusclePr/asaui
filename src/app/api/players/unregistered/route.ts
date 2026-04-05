import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Docker from "dockerode";
import { getServers } from "@/lib/config";
import { getPlayerProfiles } from "@/lib/storage";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import { UnregisteredPlayerCandidate } from "@/types";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

// Parse ARK timestamp format: YYYY.MM.DD-HH.MM.SS:mmm
// Example: 2026.04.05-12.05.10:830
function parseArkTimestamp(arkTimestamp: string): Date | null {
  const match = arkTimestamp.match(/(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})/);
  if (!match) return null;
  
  const [, year, month, day, hour, minute, second, ms] = match;
  // ARK timestamps are typically in UTC
  const date = new Date(
    Date.UTC(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second),
      parseInt(ms)
    )
  );
  return isNaN(date.getTime()) ? null : date;
}

// Extract player connection info from logs
interface IncomingAccountEvent {
  eosId: string;
  ip: string;
  timestamp: Date;
  arkTimestamp: string;
  line: string;
}

interface LeftArkEvent {
  playerName: string;
  platform: string;
  timestamp: Date;
  arkTimestamp: string;
  line: string;
}

function parseIncomingAccountLog(logText: string): IncomingAccountEvent[] {
  const events: IncomingAccountEvent[] = [];
  // Pattern: [2026.04.05-12.05.10:830][467]IP for incoming account 00023e876b964cd3b6f01a9d7040d038 - IP 121.80.186.64
  const regex = /\[(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3})\]\[\d+\]IP for incoming account ([a-f0-9]{32}) - IP ([\d.]+)/gi;
  let match;
  
  while ((match = regex.exec(logText)) !== null) {
    const arkTimestamp = match[1];
    const eosId = match[2];
    const ip = match[3];
    const timestamp = parseArkTimestamp(arkTimestamp);
    
    if (timestamp) {
      events.push({
        eosId,
        ip,
        timestamp,
        arkTimestamp,
        line: match[0]
      });
    }
  }
  
  return events;
}

function parseLeftArkLog(logText: string): LeftArkEvent[] {
  const events: LeftArkEvent[] = [];
  // Pattern: [2026.04.05-12.05.14:414][527]2026.04.05_12.05.14: まっする [UniqueNetId: Platform:None] left this ARK!
  const regex = /\[(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3})\]\[\d+\][\d.]+_[\d.:]+:\s+([^\[]+)\s+\[UniqueNetId:\s+Platform:([^\]]*)\]\s+left this ARK!/gim;
  let match;
  
  while ((match = regex.exec(logText)) !== null) {
    const arkTimestamp = match[1];
    const playerName = match[2].trim();
    const platform = match[3].trim();
    const timestamp = parseArkTimestamp(arkTimestamp);
    
    if (timestamp && playerName) {
      events.push({
        playerName,
        platform,
        timestamp,
        arkTimestamp,
        line: match[0]
      });
    }
  }
  
  return events;
}

async function getContainerLogs(
  containerId: string,
  tailLines: number = 5000,
  maxBytes: number = 10 * 1024 * 1024 // 10MB limit
): Promise<string> {
  try {
    const container = docker.getContainer(containerId);
    const logBuffer = (await container.logs({
      stdout: true,
      stderr: true,
      tail: tailLines,
      timestamps: false
    })) as unknown as Buffer;

    // Enforce memory limit
    if (logBuffer.length > maxBytes) {
      console.warn(
        `Log buffer for ${containerId} exceeded ${maxBytes} bytes (${logBuffer.length}), truncating`
      );
      return logBuffer.subarray(logBuffer.length - maxBytes).toString("utf-8");
    }

    let logText = logBuffer.toString("utf-8");
    
    // Simple demux check for multiplexed stream if present
    if (
      logBuffer.length >= 8 &&
      (logBuffer[0] === 1 || logBuffer[0] === 2) &&
      logBuffer[1] === 0 &&
      logBuffer[2] === 0 &&
      logBuffer[3] === 0
    ) {
      // Remove multiplex headers (8 bytes each)
      logText = "";
      let offset = 0;
      while (offset < logBuffer.length) {
        if (offset + 8 > logBuffer.length) break;
        const size = logBuffer.readUInt32BE(offset + 4);
        if (offset + 8 + size > logBuffer.length) break;
        logText += logBuffer.subarray(offset + 8, offset + 8 + size).toString("utf-8");
        offset += 8 + size;
      }
    }

    return logText;
  } catch (err) {
    console.warn(`Failed to get logs for container ${containerId}:`, getErrorMessage(err));
    return "";
  }
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const servers = getServers();
    const profilesMap = getPlayerProfiles();
    const registeredEosIds = new Set(Object.keys(profilesMap));
    
    const allCandidates: UnregisteredPlayerCandidate[] = [];
    const eosIdToCandidate = new Map<string, UnregisteredPlayerCandidate>();

    // Fetch and parse logs for each server
    for (const server of servers) {
      if (!server.containerName) continue;

      let logText = "";
      try {
        // Try to fetch logs (fails gracefully if container is not running)
        logText = await getContainerLogs(server.containerName, 5000);
      } catch (err) {
        // Server might be stopped/not created - skip it and continue
        console.debug(
          `[unregistered] Failed to fetch logs for ${server.id} (${server.containerName}):`,
          getErrorMessage(err)
        );
        continue;
      }

      if (!logText) {
        // No logs available (server might not be running)
        console.debug(`[unregistered] No logs available for ${server.id}`);
        continue;
      }

      // Parse incoming account events
      const incomingEvents = parseIncomingAccountLog(logText);
      const leftEvents = parseLeftArkLog(logText);

      // Process each unique EOS ID
      const seen = new Set<string>();
      for (const incomingEvent of incomingEvents) {
        const { eosId, ip, timestamp: incomingTime, arkTimestamp } = incomingEvent;

        // Skip if already seen (dedup by EOS ID)
        if (seen.has(eosId)) continue;
        seen.add(eosId);

        // Skip if already registered
        if (registeredEosIds.has(eosId)) continue;

        let playerName: string | undefined = undefined;
        let platform: string | undefined = undefined;
        let hasLeftEvent = false;

        // Look for matching leave event within 30 seconds
        for (const leftEvent of leftEvents) {
          const timeDiff = Math.abs(leftEvent.timestamp.getTime() - incomingTime.getTime());
          if (timeDiff <= 30000 && leftEvent.playerName) {
            // Found matching leave event
            playerName = leftEvent.playerName;
            platform = leftEvent.platform;
            hasLeftEvent = true;
            break;
          }
        }

        const candidate: UnregisteredPlayerCandidate = {
          serverId: server.id,
          serverName: server.containerName,
          eosId,
          ip,
          detectedAtUtc: incomingTime.toISOString(),
          name: playerName,
          platform,
          hasLeftEvent,
          sourceLine: incomingEvent.line
        };

        // Keep only the first (earliest) instance of each EOS ID across all servers
        if (!eosIdToCandidate.has(eosId)) {
          eosIdToCandidate.set(eosId, candidate);
        }
      }
    }

    // Convert map to array and sort by server, then by timestamp
    const candidates = Array.from(eosIdToCandidate.values()).sort((a, b) => {
      if (a.serverName !== b.serverName) {
        return a.serverName.localeCompare(b.serverName);
      }
      return new Date(b.detectedAtUtc).getTime() - new Date(a.detectedAtUtc).getTime();
    });

    return NextResponse.json(candidates);
  } catch (error: unknown) {
    console.error("Error in /api/players/unregistered:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
