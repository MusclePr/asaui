import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { CLUSTER_DIR } from "./cluster";

const execFileAsync = promisify(execFile);

export type ComposeAction = "up" | "down";

export interface CachedService {
  id: string;
  containerName: string;
  image: string;
  sessionName: string;
  mapRaw: string;
  port: string;
}

const CACHE_FILE = path.join(CLUSTER_DIR, ".services.cache.json");

export async function runDockerCompose(args: string[], options?: { cwd?: string }) {
  const { stdout, stderr } = await execFileAsync("docker", args, {
    cwd: options?.cwd || CLUSTER_DIR,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout, stderr };
}

export async function refreshServerCache(): Promise<CachedService[]> {
  const { stdout } = await runDockerCompose(["compose", "config", "--format", "json"]);
  const config = JSON.parse(stdout);
  
  const services: CachedService[] = [];
  if (config.services) {
    for (const [id, service] of Object.entries<any>(config.services)) {
      // イメージ名が "*/ark_ascended_docker:*" であることを条件にする
      if (service.image && /.*\/ark_ascended_docker:.*/.test(service.image)) {
        services.push({
          id,
          containerName: service.container_name || id,
          image: service.image,
          sessionName: service.environment?.SESSION_NAME || "",
          mapRaw: service.environment?.SERVER_MAP || "",
          port: service.environment?.SERVER_PORT || "",
        });
      }
    }
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(services, null, 2), "utf8");
  return services;
}

export function getCachedServers(): CachedService[] {
  if (!fs.existsSync(CACHE_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch (e) {
    console.error("Failed to read server cache", e);
    return [];
  }
}
