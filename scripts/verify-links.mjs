import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SNAPSHOT_PATH = path.join(ROOT_DIR, "src", "data", "archive-snapshot.json");
const CACHE_PATH = path.join(ROOT_DIR, "src", "data", "link-health-cache.json");

const USER_AGENT =
  "KinoframeArchiveVerifier/1.0 (+https://github.com/rlawlstjr346-collab/kinoframe; respectful-link-health-check)";
const JITTER_MIN_MS = 1500;
const JITTER_MAX_MS = 2500;
const REQUEST_TIMEOUT_MS = 15000;
const FRESH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FORCE_RECHECK = process.argv.includes("--force");

function isFreshCacheEntry(entry) {
  if (FORCE_RECHECK || !entry || !entry.lastCheckedAt) return false;
  if (entry.status !== 200 && entry.status !== 206 && entry.status !== 304) {
    return false;
  }
  const checkedMs = Date.parse(entry.lastCheckedAt);
  if (Number.isNaN(checkedMs)) return false;
  return Date.now() - checkedMs < FRESH_CACHE_TTL_MS;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomJitterMs() {
  return (
    JITTER_MIN_MS +
    Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1))
  );
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    }
  } catch {
    // start fresh if corrupted
  }
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

function collectChecks(items) {
  const checks = [];
  const seen = new Set();

  const pushCheck = (url, kind, itemId) => {
    if (!url || typeof url !== "string") return;
    if (seen.has(url)) return;
    seen.add(url);
    checks.push({ url, kind, itemId });
  };

  for (const item of items) {
    pushCheck(item.thumbnailUrl, "thumbnail", item.id);
    if (item.previewVideoUrl) {
      pushCheck(item.previewVideoUrl, "video", item.id);
    }
    if (item.youtubeId) {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${item.youtubeId}`
      )}&format=json`;
      pushCheck(oembedUrl, "youtube_oembed", item.id);
    }
    pushCheck(item.sourceUrl, "source", item.id);
  }

  return checks;
}

async function performRequest(url, method, cacheEntry) {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "*/*",
  };

  if (cacheEntry?.etag) {
    headers["If-None-Match"] = cacheEntry.etag;
  }
  if (cacheEntry?.lastModified) {
    headers["If-Modified-Since"] = cacheEntry.lastModified;
  }
  if (method === "GET") {
    headers["Range"] = "bytes=0-1023";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    // Consume/cancel body promptly to avoid socket leaks
    if (res.body) {
      try {
        await res.body.cancel();
      } catch {
        // ignore cancel error
      }
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function checkSingleUrl(check, cache) {
  const cacheEntry = cache[check.url];
  // Use GET directly for YouTube oEmbed since it expects GET
  const preferGet = check.kind === "youtube_oembed";

  let res = await performRequest(
    check.url,
    preferGet ? "GET" : "HEAD",
    cacheEntry
  );

  // Polite single fallback to ranged GET only on 405 Method Not Allowed or 501
  if (!preferGet && (res.status === 405 || res.status === 501)) {
    res = await performRequest(check.url, "GET", cacheEntry);
  }

  return res;
}

async function main() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error(`[ERROR] Snapshot not found at ${SNAPSHOT_PATH}`);
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  const checks = collectChecks(items);
  const cache = loadCache();

  // Group checks by hostname so different domains can run politely in parallel
  // while same-domain consecutive requests strictly observe 1500ms~2500ms jitter.
  const domainBuckets = new Map();
  for (const check of checks) {
    const host = new URL(check.url).hostname;
    if (!domainBuckets.has(host)) {
      domainBuckets.set(host, []);
    }
    domainBuckets.get(host).push(check);
  }

  console.log(
    `[KINOFRAME LINK SHIELD] Checking ${checks.length} unique URLs across ${domainBuckets.size} domains...`
  );
  console.log(`[USER-AGENT] ${USER_AGENT}`);

  const stats = {
    total: checks.length,
    ok200: 0,
    cached304: 0,
    circuitBroken: 0,
    dead: [],
  };

  const domainCooldowns = new Set();

  const runDomainWorker = async (host, queue) => {
    let sentOnHost = 0;
    for (let i = 0; i < queue.length; i += 1) {
      const check = queue[i];

      if (isFreshCacheEntry(cache[check.url])) {
        stats.cached304 += 1;
        continue;
      }

      if (domainCooldowns.has(host)) {
        stats.circuitBroken += 1;
        console.warn(
          `[CIRCUIT-OPEN] Skipping ${check.itemId} (${check.kind}) on cooled-down domain ${host}`
        );
        continue;
      }

      if (sentOnHost > 0) {
        const waitMs = randomJitterMs();
        await sleep(waitMs);
      }
      sentOnHost += 1;

      try {
        const res = await checkSingleUrl(check, cache);
        const status = res.status;

        if (status === 429 || status === 403) {
          domainCooldowns.add(host);
          stats.circuitBroken += 1;
          console.warn(
            `[CIRCUIT-BREAKER] HTTP ${status} from ${host} on ${check.itemId} (${check.kind}) — entering immediate domain cooldown (0 retries).`
          );
          continue;
        }

        if (status === 304) {
          stats.cached304 += 1;
          cache[check.url] = {
            ...cache[check.url],
            lastCheckedAt: new Date().toISOString(),
            status: 304,
          };
          console.log(
            `[304 SKIP] ${check.itemId} (${check.kind}) -> ${host}`
          );
          continue;
        }

        if (status >= 200 && status < 300) {
          stats.ok200 += 1;
          const etag = res.headers.get("etag");
          const lastModified = res.headers.get("last-modified");
          const contentType = res.headers.get("content-type");
          cache[check.url] = {
            etag: etag || cache[check.url]?.etag || null,
            lastModified:
              lastModified || cache[check.url]?.lastModified || null,
            contentType: contentType || null,
            lastCheckedAt: new Date().toISOString(),
            status,
          };
          console.log(
            `[${status} OK] ${check.itemId} (${check.kind}) -> ${host}`
          );
          continue;
        }

        stats.dead.push({
          ...check,
          status,
          reason: `HTTP ${status}`,
        });
        console.error(
          `[DEAD ${status}] ${check.itemId} (${check.kind}) -> ${check.url}`
        );
      } catch (err) {
        stats.dead.push({
          ...check,
          status: 0,
          reason: err instanceof Error ? err.message : String(err),
        });
        console.error(
          `[DEAD ERR] ${check.itemId} (${check.kind}) -> ${check.url} (${
            err instanceof Error ? err.message : String(err)
          })`
        );
      }
    }
  };

  await Promise.all(
    Array.from(domainBuckets.entries()).map(([host, queue]) =>
      runDomainWorker(host, queue)
    )
  );

  saveCache(cache);

  console.log("\n=== KINOFRAME LINK SHIELD SUMMARY ===");
  console.log(`Total Unique URLs : ${stats.total}`);
  console.log(`HTTP 2xx OK       : ${stats.ok200}`);
  console.log(`HTTP 304 Skipped  : ${stats.cached304}`);
  console.log(`Circuit-Breaker   : ${stats.circuitBroken}`);
  console.log(`Dead Links        : ${stats.dead.length}`);

  if (stats.dead.length > 0) {
    console.error("\nDead URLs detected:");
    for (const d of stats.dead) {
      console.error(` - [${d.itemId}] (${d.kind}) ${d.reason}: ${d.url}`);
    }
    process.exit(1);
  }

  if (stats.circuitBroken > 0) {
    console.warn(
      `\n[WARN] ${stats.circuitBroken} URLs paused by Circuit Breaker to protect IP reputation.`
    );
  }

  console.log("\n[PASS] Dead links: 0");
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
