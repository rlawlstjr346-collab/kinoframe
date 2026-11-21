import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SNAPSHOT_PATH = path.join(ROOT_DIR, "src", "data", "archive-snapshot.json");
const CACHE_PATH = path.join(ROOT_DIR, "src", "data", "link-health-cache.json");
const TRANSLATION_CACHE_PATH = path.join(
  ROOT_DIR,
  "src",
  "data",
  "translation-cache.json"
);

const USER_AGENT =
  "KinoframeArchiveCurator/1.0 (+https://github.com/rlawlstjr346-collab/kinoframe; respectful-weekly-curator)";
const JITTER_MIN_MS = 1500;
const JITTER_MAX_MS = 2500;
const REQUEST_TIMEOUT_MS = 15000;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Math.max(1, Number.parseInt(limitArg.split("=")[1], 10) || 4) : 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomJitterMs = () =>
  JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1));

const lastHostRequestAt = new Map();
const cooledDownHosts = new Set();

function loadJsonFile(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch {
    // ignore corrupt cache
  }
  return fallback;
}

function saveJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function politeFetch(url, options = {}, cache = {}) {
  const host = new URL(url).hostname;
  if (cooledDownHosts.has(host)) {
    return { status: 429, skippedByBreaker: true };
  }

  const last = lastHostRequestAt.get(host) || 0;
  const elapsed = Date.now() - last;
  if (last > 0 && elapsed < JITTER_MIN_MS) {
    await sleep(randomJitterMs());
  }
  lastHostRequestAt.set(host, Date.now());

  const headers = {
    "User-Agent": USER_AGENT,
    Accept: options.accept || "application/json,*/*;q=0.8",
    ...(options.headers || {}),
  };

  const entry = cache[url];
  if (options.useConditional && entry?.etag) {
    headers["If-None-Match"] = entry.etag;
  }
  if (options.useConditional && entry?.lastModified) {
    headers["If-Modified-Since"] = entry.lastModified;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });

    if (res.status === 429 || res.status === 403) {
      cooledDownHosts.add(host);
      console.warn(
        `[CIRCUIT-BREAKER] HTTP ${res.status} from ${host} — immediate domain cooldown (0 retries).`
      );
      if (res.body) {
        try {
          await res.body.cancel();
        } catch {}
      }
      return { status: res.status, skippedByBreaker: true };
    }

    if (res.status >= 200 && res.status < 300) {
      cache[url] = {
        etag: res.headers.get("etag") || entry?.etag || null,
        lastModified: res.headers.get("last-modified") || entry?.lastModified || null,
        contentType: res.headers.get("content-type") || null,
        lastCheckedAt: new Date().toISOString(),
        status: res.status,
      };
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}

const ZERO_COST_GLOSSARY = [
  [/National Park/gi, "국립공원"],
  [/Poster/gi, "포스터"],
  [/Advertisement|Advert/gi, "지면 광고"],
  [/Locomotive|Railroad|Railway/gi, "철도"],
  [/Apollo/gi, "아폴로"],
  [/Space Shuttle/gi, "우주왕복선"],
  [/Launch/gi, "발사"],
  [/Aircraft|Airplane/gi, "항공기"],
  [/Kodachrome/gi, "코다크롬"],
  [/Vintage/gi, "빈티지"],
  [/Color/gi, "컬러"],
  [/Travel/gi, "트래블"],
  [/Commercial/gi, "TVCF"],
];

function translateTitleToKoreanZeroCost(englishTitle, year, mediaType, tCache) {
  const key = englishTitle.trim();
  if (tCache[key]) return tCache[key];

  let cleaned = key
    .replace(/^File:/i, "")
    .replace(/\.(jpg|jpeg|png|webp)$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, ko] of ZERO_COST_GLOSSARY) {
    cleaned = cleaned.replace(pattern, ko);
  }

  const suffix =
    mediaType === "PRINT"
      ? "아카이브 포스터"
      : mediaType === "PHOTO"
      ? "컬러 보도사진"
      : mediaType === "NEWS"
      ? "기록 필름"
      : "빈티지 TVCF";

  const trimmedCore = cleaned.length > 42 ? `${cleaned.slice(0, 42)}…` : cleaned;
  const translated = `${year} ${trimmedCore} ${suffix}`.replace(/\s+/g, " ").trim();
  tCache[key] = translated;
  return translated;
}

function mapEra(year) {
  if (year < 1970) return "1950-60s";
  if (year < 1980) return "1970s";
  if (year < 1990) return "1980s";
  return "1990-00s";
}

function mapAspectRatio(w, h) {
  const r = w / Math.max(1, h);
  if (r < 0.9) return "4:5";
  if (r > 2.0) return "2.39:1";
  if (r > 1.6) return "16:9";
  if (r > 1.4) return "3:2";
  return "4:3";
}

function nextKfId(existingItems) {
  let maxNum = 0;
  for (const item of existingItems) {
    const m = String(item.id).match(/^KF-(\d{3})$/);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }
  return maxNum + 1;
}

async function discoverWikimediaCandidates(existingUrls, cache) {
  const queries = [
    { mediaType: "PRINT", category: "EXHIBITION_SPORTS", country: "US", q: '"National Park" poster WPA color' },
    { mediaType: "PRINT", category: "PACKAGING_EPHEMERA", country: "JP", q: '"Matchbox label" Japan vintage' },
    { mediaType: "PRINT", category: "ANIME_COMIC", country: "US", q: '"Planet Comics" OR "Weird Science" cover' },
    { mediaType: "PHOTO", category: "BILLBOARD_SIGN", country: "JP", q: 'Tokyo Shinjuku neon signs night' },
    { mediaType: "PHOTO", category: "INDUSTRIAL_DESIGN", country: "EU", q: '"Braun" OR "Leica" vintage design' },
    { mediaType: "PHOTO", category: "PHOTO", country: "US", q: 'Jack Delano OR Alfred T. Palmer Kodachrome color 1942' },
  ];
  const candidates = [];

  for (const { mediaType, category, country, q } of queries) {
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      q
    )}&gsrlimit=6&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=960&format=json`;
    const res = await politeFetch(apiUrl, { method: "GET" }, cache);
    if (!res || res.skippedByBreaker || res.status !== 200) continue;

    const data = await res.json();
    for (const page of Object.values(data.query?.pages || {})) {
      const info = page.imageinfo?.[0];
      if (!info || !info.mime?.startsWith("image/")) continue;
      if (info.mime === "image/tiff" || info.mime === "image/svg+xml") continue;
      if (info.width < 600 || info.height < 600) continue;

      const rawThumb = info.thumburl || info.url;
      const thumbUrl = rawThumb.includes("?utm_source=")
        ? rawThumb.split("?utm_source=")[0]
        : rawThumb;
      const sourceUrl = info.descriptionurl;

      if (existingUrls.has(sourceUrl) || existingUrls.has(thumbUrl)) continue;
      candidates.push({
        mediaType,
        category,
        country,
        mediaSource: "still_image",
        originalTitle: page.title.replace(/^File:/i, "").replace(/\.[a-z0-9]+$/i, ""),
        brandOrSource: "Wikimedia Commons / Public Domain",
        year: mediaType === "PRINT" ? 1958 : 1972,
        aspectRatio: mapAspectRatio(info.width, info.height),
        durationSec: null,
        thumbnailUrl: thumbUrl,
        previewVideoUrl: null,
        youtubeId: null,
        sourceUrl,
        licenseNote: "Public Domain (Wikimedia Commons)",
      });
    }
  }
  return candidates;
}

async function discoverNasaCandidates(existingUrls, cache) {
  const apiUrl = `https://images-api.nasa.gov/search?q=${encodeURIComponent(
    "Apollo Saturn launch color"
  )}&media_type=image&page_size=8`;
  const res = await politeFetch(apiUrl, { method: "GET" }, cache);
  if (!res || res.skippedByBreaker || res.status !== 200) return [];

  const data = await res.json();
  const candidates = [];
  for (const item of data.collection?.items || []) {
    const d = item.data?.[0];
    if (!d || !d.nasa_id || d.nasa_id.includes(" ")) continue;
    const thumb = item.links?.find((l) => l.rel === "preview")?.href;
    if (!thumb) continue;
    const thumbUrl = thumb.replace(/^http:\/\//, "https://");
    const sourceUrl = `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`;
    if (existingUrls.has(sourceUrl) || existingUrls.has(thumbUrl)) continue;

    const year = Number(String(d.date_created || "1969").slice(0, 4)) || 1969;
    candidates.push({
      mediaType: "NEWS",
      category: "EXHIBITION_SPORTS",
      country: "US",
      mediaSource: "still_image",
      originalTitle: d.title || d.nasa_id,
      brandOrSource: "NASA Image Archive",
      year,
      aspectRatio: "4:3",
      durationSec: null,
      thumbnailUrl: thumbUrl,
      previewVideoUrl: null,
      youtubeId: null,
      sourceUrl,
      licenseNote: "Public Domain (NASA Media Usage Guidelines)",
    });
  }
  return candidates;
}

async function verifyCandidateUrls(cand, cache) {
  const urls = [cand.thumbnailUrl, cand.sourceUrl];
  if (cand.previewVideoUrl) urls.push(cand.previewVideoUrl);

  for (const u of urls) {
    const res = await politeFetch(
      u,
      { method: "HEAD", useConditional: true },
      cache
    );
    if (!res || res.skippedByBreaker) return false;
    if (res.status === 304) continue;
    if (res.status >= 200 && res.status < 300) {
      if (res.body) {
        try {
          await res.body.cancel();
        } catch {}
      }
      continue;
    }
    return false;
  }
  return true;
}

function buildArchiveItem(idNum, cand, tCache) {
  const id = `KF-${String(idNum).padStart(3, "0")}`;
  const titleKo = translateTitleToKoreanZeroCost(
    cand.originalTitle,
    cand.year,
    cand.mediaType,
    tCache
  );
  const palette =
    cand.mediaType === "PRINT"
      ? ["#162238", "#D94B38", "#E6B43C", "#3A7D8C", "#F4EFE2"]
      : cand.mediaType === "NEWS"
      ? ["#0E1B2E", "#2C5E9E", "#D96B27", "#E8B949", "#F2EFE8"]
      : ["#1A2B3C", "#C84B31", "#4A7C8C", "#D9A441", "#EFE8DA"];

  return {
    id,
    titleKo,
    originalTitle: cand.originalTitle,
    brandOrSource: cand.brandOrSource,
    year: cand.year,
    era: mapEra(cand.year),
    mediaType: cand.mediaType,
    category:
      cand.category ||
      (cand.mediaType === "PRINT"
        ? "AD_POSTER"
        : cand.mediaType === "TVCF"
        ? "TVCF"
        : cand.mediaType === "NEWS"
        ? "EXHIBITION_SPORTS"
        : "PHOTO"),
    country: cand.country || "US",
    aspectRatio: cand.aspectRatio,
    durationSec: cand.durationSec,
    mediaSource: cand.mediaSource,
    thumbnailUrl: cand.thumbnailUrl,
    previewVideoUrl: cand.previewVideoUrl,
    youtubeId: cand.youtubeId,
    sourceUrl: cand.sourceUrl,
    licenseNote: cand.licenseNote,
    compositionTags: ["기하학 조형", "1점 투시"],
    persuasionTags: ["초반 3초 시선 강탈", "다큐 리얼리즘"],
    palette,
    viewfinder: {
      vanishingPoint: [50, 48],
      eyePath: [
        [28, 60],
        [50, 48],
        [74, 38],
      ],
      primaryGrid: cand.mediaType === "PRINT" ? "symmetry" : "thirds",
    },
    beats: [
      {
        label: "핵심 시선 앵커",
        timeOrZone: "중앙 포커스",
        noteKo: "강렬한 명도 대비와 색채 포인트로 1초 내 시선 고정",
        focusCrop: "50% 48%",
      },
      {
        label: "구도 리딩라인",
        timeOrZone: "좌→우 축",
        noteKo: "기하학 선분과 소실점이 화면 깊이와 몰입을 강화",
        focusCrop: "35% 55%",
      },
      {
        label: "색채 보색 대비",
        timeOrZone: "배경×전경",
        noteKo: "한색 배경과 난색 포인트의 균형으로 주목도 극대화",
        focusCrop: "65% 42%",
      },
      {
        label: "아카이브 마감",
        timeOrZone: "전체 프레임",
        noteKo: "퍼블릭 도메인 원판의 아날로그 질감과 비례미 보존",
        focusCrop: "50% 50%",
      },
    ],
    breakdown: {
      hook3s:
        "선명한 색채 대비와 명료한 조형 실루엣이 첫 1초 만에 시선을 화면 중심으로 끌어당긴다.",
      framing:
        "소실점과 3분할 교차점을 활용한 안정적 비례 설계로 복잡한 정보를 단숨에 정돈한다.",
      marketingApply:
        "캠페인 키 비주얼과 숏폼 썸네일에서 높은 색채 대비와 명쾌한 시선 동선을 적용하는 레퍼런스.",
    },
    addedAt: new Date().toISOString().slice(0, 10),
  };
}

async function main() {
  const existing = loadJsonFile(SNAPSHOT_PATH, []);
  const cache = loadJsonFile(CACHE_PATH, {});
  const tCache = loadJsonFile(TRANSLATION_CACHE_PATH, {});

  const existingUrls = new Set();
  for (const item of existing) {
    existingUrls.add(item.sourceUrl);
    existingUrls.add(item.thumbnailUrl);
    if (item.previewVideoUrl) existingUrls.add(item.previewVideoUrl);
  }

  console.log(
    `[KINOFRAME AUTO-CURATOR] Mode: ${DRY_RUN ? "DRY-RUN" : "WRITE"} | Limit: ${LIMIT} | Existing: ${existing.length}`
  );
  console.log(`[USER-AGENT] ${USER_AGENT}`);

  const pool = [
    ...(await discoverWikimediaCandidates(existingUrls, cache)),
    ...(await discoverNasaCandidates(existingUrls, cache)),
  ];

  console.log(`[CANDIDATES] Discovered ${pool.length} non-duplicate public domain items.`);

  const accepted = [];
  let nextNum = nextKfId(existing);

  for (const cand of pool) {
    if (accepted.length >= LIMIT) break;
    const ok = await verifyCandidateUrls(cand, cache);
    if (!ok) continue;

    const item = buildArchiveItem(nextNum, cand, tCache);
    nextNum += 1;
    accepted.push(item);
    console.log(
      `[VERIFIED 200] ${item.id} (${item.mediaType}) -> ${item.titleKo}`
    );
  }

  if (DRY_RUN) {
    console.log(
      `[DRY-RUN COMPLETE] ${accepted.length} verified candidate(s) ready. No snapshot files modified.`
    );
    return;
  }

  if (accepted.length > 0) {
    const merged = [...existing, ...accepted];
    saveJsonFile(SNAPSHOT_PATH, merged);
    saveJsonFile(CACHE_PATH, cache);
    saveJsonFile(TRANSLATION_CACHE_PATH, tCache);
    console.log(
      `[CURATION COMPLETE] Added ${accepted.length} items -> total ${merged.length}`
    );
  } else {
    console.log("[CURATION COMPLETE] No new items added.");
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
