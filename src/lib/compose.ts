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
  clusterId: string;
  extraDashOpts: string;
}

type ComposeService = {
  image?: unknown;
  container_name?: unknown;
  environment?: Record<string, unknown>;
};

type ComposeConfig = {
  services?: Record<string, ComposeService>;
};

type CachedServiceLike = Partial<CachedService> & Record<string, unknown>;

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
  const config = JSON.parse(stdout) as ComposeConfig;
  
  const services: CachedService[] = [];
  if (config.services) {
    for (const [id, service] of Object.entries(config.services)) {
      // イメージ名が "*/ark_ascended_docker:*" であることを条件にする
      const image = typeof service.image === "string" ? service.image : "";
      if (image && /.*\/ark_ascended_docker:.*/.test(image)) {
        const env = service.environment ?? {};
        services.push({
          id,
          containerName: typeof service.container_name === "string" ? service.container_name : id,
          image,
          sessionName: typeof env.SESSION_NAME === "string" ? env.SESSION_NAME : "",
          mapRaw: typeof env.SERVER_MAP === "string" ? env.SERVER_MAP : "",
          port: typeof env.SERVER_PORT === "string" ? env.SERVER_PORT : "",
          clusterId: typeof env.CLUSTER_ID === "string" ? env.CLUSTER_ID : "",
          extraDashOpts: typeof env.ARK_EXTRA_DASH_OPTS === "string" ? env.ARK_EXTRA_DASH_OPTS : "",
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
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as Array<Partial<CachedService>>;
    return parsed.map((service) => ({
      id: typeof service.id === "string" ? service.id : "",
      containerName: typeof service.containerName === "string" ? service.containerName : "",
      image: typeof service.image === "string" ? service.image : "",
      sessionName: typeof service.sessionName === "string" ? service.sessionName : "",
      mapRaw: typeof service.mapRaw === "string" ? service.mapRaw : "",
      port: typeof service.port === "string" ? service.port : "",
      clusterId: typeof service.clusterId === "string" ? service.clusterId : "",
      extraDashOpts: typeof service.extraDashOpts === "string" ? service.extraDashOpts : "",
    }));
  } catch (e) {
    console.error("Failed to read server cache", e);
    return [];
  }
}

export function isServerCacheSchemaOutdated(): boolean {
  if (!fs.existsSync(CACHE_FILE)) return true;

  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return true;

    for (const item of parsed) {
      if (!item || typeof item !== "object") return true;
      const service = item as CachedServiceLike;
      if (!Object.prototype.hasOwnProperty.call(service, "clusterId")) return true;
      if (!Object.prototype.hasOwnProperty.call(service, "extraDashOpts")) return true;
    }

    return false;
  } catch {
    return true;
  }
}
