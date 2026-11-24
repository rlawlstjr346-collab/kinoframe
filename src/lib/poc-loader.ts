import fs from "node:fs";
import path from "node:path";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveItem } from "@/types/archive";

export const KINOFRAME_GH_REPO = "rlawlstjr346-collab/kinoframe";
export const KINOFRAME_META_TAG = "kinoframe-meta";

export const WALL_ACTIVE_RELEASE_URL = `https://github.com/${KINOFRAME_GH_REPO}/releases/download/${KINOFRAME_META_TAG}/wall-active.json`;
export const CATALOG_FULL_RELEASE_URL = `https://github.com/${KINOFRAME_GH_REPO}/releases/download/${KINOFRAME_META_TAG}/catalog-full.json`;

const FALLBACK_SNAPSHOT = archiveSnapshot as ArchiveItem[];

function normalizeCatalogPayload(raw: unknown): ArchiveItem[] {
  const list = Array.isArray(raw)
    ? raw
    : raw &&
      typeof raw === "object" &&
      Array.isArray((raw as { items?: unknown }).items)
    ? (raw as { items: unknown[] }).items
    : [];

  return list.filter(
    (entry): entry is ArchiveItem =>
      Boolean(
        entry &&
          typeof entry === "object" &&
          typeof (entry as ArchiveItem).id === "string" &&
          typeof (entry as ArchiveItem).thumbnailUrl === "string" &&
          typeof (entry as ArchiveItem).sourceUrl === "string"
      )
  );
}

function readLocalPocManifest(): ArchiveItem[] | null {
  try {
    const manifestPath = path.join(
      process.cwd(),
      "public",
      "poc-loops",
      "manifest.json"
    );
    if (!fs.existsSync(manifestPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const items = normalizeCatalogPayload(parsed);
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

function withMinuteCacheBuster(url: string, exactBust?: number): string {
  const sep = url.includes("?") ? "&" : "?";
  const token =
    typeof exactBust === "number"
      ? exactBust
      : Math.floor(Date.now() / 60_000);
  return `${url}${sep}v=${token}`;
}

async function fetchReleaseCatalogJson(
  url: string,
  timeoutMs = 5000,
  exactBust?: number
): Promise<ArchiveItem[] | null> {
  try {
    const res = await fetch(withMinuteCacheBuster(url, exactBust), {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "KinoframeCatalogLoader/2.0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const items = normalizeCatalogPayload(json);
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

export interface LoadedArchiveCatalog {
  items: ArchiveItem[];
  source: "github_releases" | "local_poc" | "snapshot";
  disableConduit: boolean;
}

/**
 * Loads the active main-wall catalog (up to 600 clips) directly from GitHub Releases
 * (`kinoframe-meta/wall-active.json`) with `cache: "no-store"` and a minute-level
 * cache buster so Vercel never serves stale catalog builds.
 */
export async function loadWallActiveCatalog(options?: {
  exactBust?: number;
}): Promise<LoadedArchiveCatalog> {
  const remote = await fetchReleaseCatalogJson(
    WALL_ACTIVE_RELEASE_URL,
    5500,
    options?.exactBust
  );
  if (remote && remote.length > 0) {
    return {
      items: remote,
      source: "github_releases",
      disableConduit: true,
    };
  }

  const localPoc = readLocalPocManifest();
  if (localPoc && localPoc.length > 0) {
    return {
      items: localPoc,
      source: "local_poc",
      disableConduit: true,
    };
  }

  return {
    items: FALLBACK_SNAPSHOT,
    source: "snapshot",
    disableConduit: false,
  };
}

/**
 * Loads the full cumulative catalog (up to 10,000 clips including `archived` items)
 * from GitHub Releases (`kinoframe-meta/catalog-full.json`) with `cache: "no-store"`
 * for full-archive keyword search and `/shot/[id]` resolution.
 */
export async function loadFullCatalogForLookup(): Promise<ArchiveItem[]> {
  const remoteFull = await fetchReleaseCatalogJson(
    CATALOG_FULL_RELEASE_URL,
    5500
  );
  if (remoteFull && remoteFull.length > 0) {
    return remoteFull;
  }

  const remoteWall = await fetchReleaseCatalogJson(
    WALL_ACTIVE_RELEASE_URL,
    4500
  );
  if (remoteWall && remoteWall.length > 0) {
    return remoteWall;
  }

  const localPoc = readLocalPocManifest();
  if (localPoc && localPoc.length > 0) {
    return localPoc;
  }

  return FALLBACK_SNAPSHOT;
}
