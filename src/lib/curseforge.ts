import { CURSEFORGE_API_BASE_URL, CURSEFORGE_API_KEY } from "@/lib/cluster";

export type CurseForgeModInfo = {
  id: string;
  name?: string;
  slug?: string;
  url?: string;
  logoUrl?: string;
};

type CacheEntry = { value: CurseForgeModInfo; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function getFromCache(id: string): CurseForgeModInfo | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(id);
    return null;
  }
  return entry.value;
}

function setCache(id: string, value: CurseForgeModInfo) {
  cache.set(id, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function extractData(json: any): { name?: string; slug?: string; logoUrl?: string } {
  // Try a few shapes defensively.
  const data = json?.data ?? json?.Data ?? json?.result ?? json;
  const name = data?.name ?? data?.Name;
  const slug = data?.slug ?? data?.Slug;
  const logoUrl = data?.logo?.thumbnailUrl ?? data?.logo?.url;
  return { name, slug, logoUrl };
}

export async function fetchCurseForgeMod(modId: string): Promise<CurseForgeModInfo> {
  const cached = getFromCache(modId);
  if (cached) return cached;

  if (!CURSEFORGE_API_KEY) {
    return { id: modId };
  }

  const base = CURSEFORGE_API_BASE_URL.replace(/\/$/, "");
  // Common CF API pattern: /v1/mods/{id}
  const url = `${base}/v1/mods/${encodeURIComponent(modId)}`;

  const res = await fetch(url, {
    headers: {
      "x-api-key": CURSEFORGE_API_KEY,
      Accept: "application/json",
    },
    // avoid caching secrets across users; we cache in-memory instead
    cache: "no-store",
  });

  if (!res.ok) {
    const value = { id: modId };
    setCache(modId, value);
    return value;
  }

  const json = await res.json();
  const { name, slug, logoUrl } = extractData(json);
  const modUrl = slug
    ? `https://www.curseforge.com/ark-survival-ascended/mods/${slug}`
    : undefined;

  const value: CurseForgeModInfo = { id: modId, name, slug, url: modUrl, logoUrl };
  setCache(modId, value);
  return value;
}
