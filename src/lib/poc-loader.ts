import fs from "node:fs";
import path from "node:path";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveItem } from "@/types/archive";
import { normalizeCatalogPayload } from "@/lib/catalog-payload";

export const KINOFRAME_GH_REPO = "rlawlstjr346-collab/kinoframe";
export const KINOFRAME_META_TAG = "kinoframe-meta";

export const WALL_ACTIVE_RELEASE_URL = `https://github.com/${KINOFRAME_GH_REPO}/releases/download/${KINOFRAME_META_TAG}/wall-active.json`;
export const CATALOG_FULL_RELEASE_URL = `https://github.com/${KINOFRAME_GH_REPO}/releases/download/${KINOFRAME_META_TAG}/catalog-full.json`;

const FALLBACK_SNAPSHOT = archiveSnapshot as ArchiveItem[];


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

/**
 * Per-isolate in-memory catalog cache (no KV, no incremental cache writes).
 * A warm Worker isolate re-uses the release JSON for CATALOG_TTL_MS; a stale copy is kept as a
 * fallback (up to CATALOG_STALE_MS) when GitHub Releases is slow or unreachable.
 */
const CATALOG_TTL_MS = 300_000;
const CATALOG_STALE_MS = 3_600_000;

interface CatalogMemoEntry {
  at: number;
  text: string;
  items?: ArchiveItem[];
}

const catalogMemo = new Map<string, CatalogMemoEntry>();
const catalogInflight = new Map<string, Promise<CatalogMemoEntry | null>>();

async function downloadCatalogText(url: string, timeoutMs: number): Promise<CatalogMemoEntry | null> {
  try {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}v=${Math.floor(Date.now() / 60_000)}`, {
      headers: { Accept: "application/json", "User-Agent": "KinoframeCatalogLoader/3.0" },
      // Same 5-minute window as the ISR routes: a no-store fetch would turn /shot and /discover
      // into "static to dynamic at runtime" errors. No incremental cache is configured, so
      // nothing is persisted; freshness comes from the isolate memo below.
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) return null;
    return { at: Date.now(), text };
  } catch {
    return null;
  }
}

/** Raw release catalog text from the isolate cache (refreshed every 5 minutes). */
export async function getReleaseCatalogText(url: string, timeoutMs = 5500): Promise<string | null> {
  const hit = catalogMemo.get(url);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.text;

  let pending = catalogInflight.get(url);
  if (!pending) {
    pending = downloadCatalogText(url, timeoutMs).finally(() => catalogInflight.delete(url));
    catalogInflight.set(url, pending);
  }
  const fresh = await pending;
  if (fresh) {
    catalogMemo.set(url, fresh);
    return fresh.text;
  }
  if (hit && Date.now() - hit.at < CATALOG_STALE_MS) return hit.text;
  return null;
}

async function fetchReleaseCatalogJson(url: string, timeoutMs = 5500): Promise<ArchiveItem[] | null> {
  const text = await getReleaseCatalogText(url, timeoutMs);
  if (!text) return null;
  const entry = catalogMemo.get(url);
  if (entry && entry.text === text && entry.items) return entry.items;
  try {
    const items = normalizeCatalogPayload(JSON.parse(text));
    if (entry && entry.text === text) entry.items = items;
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

/** Active main-wall catalog (up to 600 clips) from GitHub Releases `kinoframe-meta/wall-active.json`. */
export async function loadWallActiveCatalog(): Promise<LoadedArchiveCatalog> {
  const remote = await fetchReleaseCatalogJson(WALL_ACTIVE_RELEASE_URL, 5500);
  if (remote && remote.length > 0) {
    return {
      items: remote,
      source: "github_releases",
      disableConduit: true,
    };
  }

  return loadOfflineCatalog();
}

/** Local PoC manifest (dev only) or the bundled snapshot — used when GitHub Releases is unreachable. */
export function loadOfflineCatalog(): LoadedArchiveCatalog {
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

/** Full cumulative catalog (`kinoframe-meta/catalog-full.json`) for deep search and `/shot/[id]`. */
export async function loadFullCatalogForLookup(): Promise<ArchiveItem[]> {
  const remoteFull = await fetchReleaseCatalogJson(CATALOG_FULL_RELEASE_URL, 5500);
  if (remoteFull && remoteFull.length > 0) {
    return remoteFull;
  }

  const remoteWall = await fetchReleaseCatalogJson(WALL_ACTIVE_RELEASE_URL, 4500);
  if (remoteWall && remoteWall.length > 0) {
    return remoteWall;
  }

  const localPoc = readLocalPocManifest();
  if (localPoc && localPoc.length > 0) {
    return localPoc;
  }

  return FALLBACK_SNAPSHOT;
}
