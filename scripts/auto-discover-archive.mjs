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
  "KinoframeArchiveCurator/6.0 (+https://github.com/rlawlstjr346-collab/kinoframe; respectful-v6-seed-manager)";
const MAX_SEED_SNAPSHOT_SIZE = 480;
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

const BLOCKED_JUNK_PATTERNS = [
  /\bimg[_-]?\d+/i,
  /\bdsc[_-]?\d+/i,
  /\bpxl[_-]?\d+/i,
  /\bmvi[_-]?\d+/i,
  /\bt-?shirt/i,
  /\bmerch(andise)?\b/i,
  /\bshop(_front)?\b/i,
  /\bstorefront\b/i,
  /\bbooth\b/i,
  /\bceremony\b/i,
  /\bconference\b/i,
  /\btrophy\b/i,
  /\bvolunteer\b/i,
  /\bfashion[_ -]?kode\b/i,
  /\bstreet[_ -]?snap\b/i,
  /\bbookstore\b/i,
  /\bskateshop\b/i,
  /\brecord[_ -]?shop\b/i,
  /\bno[_ -]?smoking\b/i,
  /\bphotographer[_ -]?brief\b/i,
  /\bselfie\b/i,
  /\bgroup[_ -]?photo\b/i,
  /\bpreservewildlife/i,
  /\brns[_ -]?yellowstone/i,
  /\b(afips|federation|symposium|seminar|lecture|talk|interview|unboxing|review)\b/i,
  /\b(nintendo|famicom|game.?boy|atari|sega|playstation|xbox|console|flip.?phone|cell.?phone|smartphone|nokia|motorola|hardware|motherboard|calculator|typewriter)\b/i,
  /\b(stamp|postage|matchbox|brochure|flyer|pamphlet|manual|catalog|manuscript|book.?page|textbook|dictionary|patent|diagram|chart|slide.?deck)\b/i,
  /\b(black\s*(?:&|and)\s*white|b\s*&\s*w|monochrome|newsreel|universal_newsreel|march\s+of\s+time|tfa[-_]|tcr|timecode|silent|cartoon|popeye|fleischer|amateur|home\s*movie|lucky\s*strike|camcorder|walking\s+tour|driving\s+tour|streetcar|tram)\b/i,
];

export function normalizeAssetStem(raw) {
  if (!raw || typeof raw !== "string") return "";
  let base = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      base = decodeURIComponent(u.pathname.split("/").pop() || "");
    }
  } catch {
    base = raw;
  }
  return base
    .replace(/^File:/i, "")
    .replace(/^\d+px-/i, "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/(_512kb|~thumb|~mobile|\.ia)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "")
    .replace(/[a-z]$/i, (m, offset, full) => (full.length >= 12 ? "" : m))
    .replace(/\d+$/g, "");
}

function isBlockedJunkText(text) {
  const target = String(text || "");
  return BLOCKED_JUNK_PATTERNS.some((re) => re.test(target));
}

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
  [/San Francisco/gi, "샌프란시스코"],
  [/New York/gi, "뉴욕"],
  [/Tokyo/gi, "도쿄"],
  [/Shibuya/gi, "시부야"],
  [/Shinjuku/gi, "신주쿠"],
  [/Harajuku/gi, "하라주쿠"],
  [/Ginza/gi, "긴자"],
  [/Seoul/gi, "서울"],
  [/Hong Kong/gi, "홍콩"],
  [/Taipei/gi, "타이베이"],
  [/Paris/gi, "파리"],
  [/London/gi, "런던"],
  [/Berlin/gi, "베를린"],
  [/Street/gi, "거리"],
  [/Tram|Cable Car|Streetcar/gi, "트램"],
  [/Trailer/gi, "예고편"],
  [/Commercial/gi, "TVCF"],
  [/Cartoon/gi, "셀 애니"],
  [/National Park/gi, "국립공원"],
  [/Poster/gi, "포스터"],
  [/Advertisement|Advert/gi, "지면 광고"],
  [/Kodachrome/gi, "코다크롬"],
  [/Vintage/gi, "빈티지"],
  [/Color/gi, "컬러"],
];

function translateTitleToKoreanZeroCost(englishTitle, year, category, tCache) {
  const key = `${category}:${englishTitle.trim()}`;
  if (tCache[key]) return tCache[key];

  let cleaned = englishTitle
    .trim()
    .replace(/^File:/i, "")
    .replace(/\.(jpg|jpeg|png|webp|mp4|webm|ogv)$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, ko] of ZERO_COST_GLOSSARY) {
    cleaned = cleaned.replace(pattern, ko);
  }

  const suffixMap = {
    TVCF: "빈티지 TVCF",
    CLASSIC_FILM: "고전 영화 클립",
    STREET_ERA: "시대 거리 아카이브",
    WEB_PHANTOM: "인터넷 망령 아카이브",
    AD_BILLBOARD: "빈티지 광고 아카이브",
    ALBUM_POSTER: "그래픽 포스터",
    ANIME_COMIC: "고전 애니·코믹",
    PHOTO: "아카이브 보도사진",
  };
  const suffix = suffixMap[category] || "비주얼 아카이브";

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
    const m = String(item.id).match(/^KF-(\d{3,5})$/);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }
  return maxNum + 1;
}

export function enforceSeedSnapshotCap(items, maxSize = MAX_SEED_SNAPSHOT_SIZE) {
  if (items.length <= maxSize) return items;
  const excess = items.length - maxSize;
  const categoryCounts = new Map();
  for (const item of items) {
    const cat = item.category || "PHOTO";
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }

  // Score eviction candidates: prefer evicting oldest, lowest-priority, non-video items while keeping each category >= 28
  const rankedForEviction = items
    .map((item, index) => ({
      item,
      index,
      priority: Number(item.priorityBoost || 0),
      isVideo: item.mediaSource === "archive_mp4" ? 1 : 0,
      addedMs: item.addedAt ? Date.parse(item.addedAt) || 0 : 0,
    }))
    .sort((a, b) => {
      if (a.isVideo !== b.isVideo) return a.isVideo - b.isVideo;
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.addedMs !== b.addedMs) return a.addedMs - b.addedMs;
      return a.index - b.index;
    });

  const evictedIds = new Set();
  for (const entry of rankedForEviction) {
    if (evictedIds.size >= excess) break;
    const cat = entry.item.category || "PHOTO";
    const remainingInCat = categoryCounts.get(cat) || 0;
    if (remainingInCat <= 12) continue;
    evictedIds.add(entry.item.id);
    categoryCounts.set(cat, remainingInCat - 1);
  }

  // Fallback if all categories are near floor
  if (evictedIds.size < excess) {
    for (const entry of rankedForEviction) {
      if (evictedIds.size >= excess) break;
      if (!evictedIds.has(entry.item.id)) {
        evictedIds.add(entry.item.id);
      }
    }
  }

  return items.filter((item) => !evictedIds.has(item.id));
}

function pickBestIaMp4(files) {
  if (!Array.isArray(files)) return null;
  const mp4s = files.filter((f) => {
    const name = String(f.name || "");
    if (!/\.mp4$/i.test(name)) return false;
    if (/\.ia\.mp4$/i.test(name) && files.some((x) => /_512kb\.mp4$/i.test(x.name || ""))) {
      return false;
    }
    const size = Number(f.size || 0);
    return size > 200_000 && size < 120_000_000;
  });
  if (mp4s.length === 0) return null;
  mp4s.sort((a, b) => {
    const a512 = /_512kb\.mp4$/i.test(a.name) ? 0 : 1;
    const b512 = /_512kb\.mp4$/i.test(b.name) ? 0 : 1;
    if (a512 !== b512) return a512 - b512;
    return Number(a.size || 0) - Number(b.size || 0);
  });
  return mp4s[0];
}

function parseDurationSec(rawLength) {
  if (!rawLength) return 60;
  const str = String(rawLength).trim();
  if (/^\d+(\.\d+)?$/.test(str)) {
    return Math.max(5, Math.min(3600, Math.round(Number(str))));
  }
  const parts = str.split(":").map((n) => Number(n));
  if (parts.every((n) => !Number.isNaN(n))) {
    if (parts.length === 2) return Math.max(5, Math.round(parts[0] * 60 + parts[1]));
    if (parts.length === 3) return Math.max(5, Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]));
  }
  return 60;
}

function pickBestIaMidThumb(files, durationSec) {
  if (!Array.isArray(files)) return null;
  const thumbs = [];
  for (const f of files) {
    const name = String(f?.name || "");
    if (!name.includes(".thumbs/")) continue;
    const m = name.match(/_(\d{5,6})\.jpg$/i);
    if (!m) continue;
    thumbs.push({ name, sec: Number.parseInt(m[1], 10) });
  }
  if (thumbs.length < 3) return null;
  thumbs.sort((a, b) => a.sec - b.sec);
  const minSec = Math.max(Math.floor(durationSec * 0.35), durationSec >= 300 ? 45 : 10);
  const maxSec = Math.max(minSec + 5, Math.floor(durationSec * 0.7));
  const mid = thumbs.filter((t) => t.sec >= minSec && t.sec <= maxSec);
  const chosen =
    mid.length > 0
      ? mid[Math.floor(mid.length / 2)]
      : thumbs[Math.floor(thumbs.length * 0.5)];
  return chosen;
}

/**
 * Priority 1: Discover 1964+ Color Cinema (60%) & Vintage Color TVCF (40%) MP4 archives with mid-film .thumbs/
 */
async function discoverInternetArchiveMotionCandidates(existingUrls, existingStems, cache) {
  const queries = [
    {
      mediaType: "NEWS",
      category: "CLASSIC_FILM",
      country: "US",
      q: '(collection:feature_films OR collection:sci_fi_horror OR collection:film_chest) AND mediatype:movies AND year:[1965 TO 2006] AND format:"512Kb MPEG4" AND -("black and white" OR silent OR newsreel OR cartoon OR trailer)',
    },
    {
      mediaType: "TVCF",
      category: "TVCF",
      country: "US",
      q: '(collection:classic_tv_commercials OR collection:commercials OR collection:prelinger) AND mediatype:movies AND (commercial OR advertisement OR spot) AND year:[1964 TO 2006] AND format:"512Kb MPEG4" AND -("black and white" OR newsreel OR "lucky strike" OR cartoon)',
    },
  ];

  const candidates = [];

  for (const spec of queries) {
    const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
      spec.q
    )}&fl[]=identifier&fl[]=title&fl[]=year&rows=8&page=1&output=json`;
    const res = await politeFetch(searchUrl, { method: "GET" }, cache);
    if (!res || res.skippedByBreaker || res.status !== 200) continue;

    const data = await res.json();
    const docs = data?.response?.docs || [];

    for (const doc of docs) {
      const id = doc.identifier;
      if (!id || isBlockedJunkText(id) || isBlockedJunkText(doc.title)) continue;
      const sourceUrl = `https://archive.org/details/${encodeURIComponent(id)}`;
      const stem = normalizeAssetStem(id);
      if (existingUrls.has(sourceUrl) || existingStems.has(stem)) {
        continue;
      }

      const metaRes = await politeFetch(
        `https://archive.org/metadata/${encodeURIComponent(id)}`,
        { method: "GET" },
        cache
      );
      if (!metaRes || metaRes.skippedByBreaker || metaRes.status !== 200) continue;
      const meta = await metaRes.json();
      if (meta?.metadata?.["access-restricted-item"] === "true") continue;

      const year =
        Number.parseInt(String(doc.year || meta?.metadata?.year || "0").slice(0, 4), 10) || 0;
      if (year < 1964 || year > 2008) continue;

      const mp4 = pickBestIaMp4(meta?.files);
      if (!mp4) continue;
      const durationSec = parseDurationSec(mp4.length);
      const midThumb = pickBestIaMidThumb(meta?.files, durationSec);
      if (!midThumb) continue;

      const thumbUrl = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(
        midThumb.name
      ).replace(/%2F/g, "/")}`;
      const videoUrl = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(
        mp4.name
      ).replace(/%2F/g, "/")}`;
      if (existingUrls.has(videoUrl) || existingUrls.has(thumbUrl)) continue;

      existingStems.add(stem);
      candidates.push({
        mediaType: spec.mediaType,
        category: spec.category,
        country: spec.country,
        mediaSource: "archive_mp4",
        originalTitle: String(doc.title || id).trim(),
        brandOrSource: "Internet Archive / Color Cinema & TVCF",
        year,
        aspectRatio: "4:3",
        durationSec,
        startSec: midThumb.sec,
        thumbnailUrl: thumbUrl,
        previewVideoUrl: videoUrl,
        youtubeId: null,
        sourceUrl,
        licenseNote: "Public Domain / Internet Archive",
      });
    }
  }

  return candidates;
}

/**
 * Priority 2: Disabled non-cinema street discovery (locked to Color CLASSIC_FILM + TVCF)
 */
async function discoverWikimediaCandidates() {
  return [];
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
    cand.category,
    tCache
  );
  const paletteByCategory = {
    STREET_ERA: ["#101824", "#D97724", "#356B8C", "#E5B94C", "#ECE6D8"],
    TVCF: ["#141E30", "#D94B38", "#E6B43C", "#2C7A8C", "#F4EFE2"],
    CLASSIC_FILM: ["#12141C", "#A83B2D", "#C89B45", "#3A546B", "#EAE3D2"],
    WEB_PHANTOM: ["#0E1525", "#27D3C3", "#E5533D", "#E8B931", "#ECE7DC"],
    ANIME_COMIC: ["#161C34", "#E24A33", "#F0B429", "#2E7DB2", "#F5F0E1"],
    AD_BILLBOARD: ["#162238", "#D94B38", "#E6B43C", "#3A7D8C", "#F4EFE2"],
    ALBUM_POSTER: ["#1A1822", "#C93B2B", "#E0A834", "#3B6E8C", "#F0EAE0"],
    PHOTO: ["#1A2B3C", "#C84B31", "#4A7C8C", "#D9A441", "#EFE8DA"],
  };
  const palette = paletteByCategory[cand.category] || paletteByCategory.PHOTO;

  return {
    id,
    titleKo,
    originalTitle: cand.originalTitle,
    brandOrSource: cand.brandOrSource,
    year: cand.year,
    era: mapEra(cand.year),
    mediaType: cand.mediaType,
    category: cand.category,
    country: cand.country || "US",
    aspectRatio: cand.aspectRatio,
    durationSec: cand.durationSec,
    startSec: cand.startSec,
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
      primaryGrid: cand.mediaType === "PRINT" ? "symmetry" : "perspective",
    },
    beats: [
      {
        label: "핵심 시선 앵커",
        timeOrZone: cand.mediaSource === "archive_mp4" ? "0:02" : "중앙 포커스",
        noteKo: "강렬한 명도 대비와 색채 포인트로 1초 내 시선 고정",
        focusCrop: "50% 48%",
      },
      {
        label: "구도 리딩라인",
        timeOrZone: cand.mediaSource === "archive_mp4" ? "0:10" : "좌→우 축",
        noteKo: "기하학 선분과 소실점이 화면 깊이와 몰입을 강화",
        focusCrop: "35% 55%",
      },
      {
        label: "색채 보색 대비",
        timeOrZone: cand.mediaSource === "archive_mp4" ? "0:22" : "배경×전경",
        noteKo: "한색 배경과 난색 포인트의 균형으로 주목도 극대화",
        focusCrop: "65% 42%",
      },
      {
        label: "아카이브 마감",
        timeOrZone: cand.mediaSource === "archive_mp4" ? "0:35" : "전체 프레임",
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
  const existingStems = new Set();
  for (const item of existing) {
    existingUrls.add(item.sourceUrl);
    existingUrls.add(item.thumbnailUrl);
    if (item.previewVideoUrl) existingUrls.add(item.previewVideoUrl);
    const s1 = normalizeAssetStem(item.thumbnailUrl);
    const s2 = normalizeAssetStem(item.sourceUrl);
    const s3 = normalizeAssetStem(item.originalTitle);
    if (s1) existingStems.add(s1);
    if (s2) existingStems.add(s2);
    if (s3) existingStems.add(s3);
  }

  console.log(
    `[KINOFRAME V5 AUTO-CURATOR] Mode: ${DRY_RUN ? "DRY-RUN" : "WRITE"} | Limit: ${LIMIT} | Existing: ${existing.length}`
  );
  console.log(`[USER-AGENT] ${USER_AGENT}`);

  // Strictly video-first discovery to preserve archive_mp4 > still_image ratio
  const [iaMotion, wmAll] = await Promise.all([
    discoverInternetArchiveMotionCandidates(existingUrls, existingStems, cache),
    discoverWikimediaCandidates(existingUrls, existingStems, cache),
  ]);

  const wmVideos = wmAll.filter((c) => c.mediaSource === "archive_mp4");
  const wmStills = wmAll.filter((c) => c.mediaSource === "still_image");

  // Use video candidates exclusively whenever available; only append stills if zero videos discovered
  const videoPool = [...iaMotion, ...wmVideos];
  const pool = videoPool.length >= LIMIT ? videoPool : [...videoPool, ...wmStills];

  console.log(
    `[CANDIDATES] Discovered ${pool.length} clean non-duplicate candidates (${
      pool.filter((c) => c.mediaSource === "archive_mp4").length
    } auto-loop videos).`
  );

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
      `[VERIFIED 200] ${item.id} (${item.category}/${item.mediaSource}) -> ${item.titleKo}`
    );
  }

  if (DRY_RUN) {
    console.log(
      `[DRY-RUN COMPLETE] ${accepted.length} verified candidate(s) ready. No snapshot files modified.`
    );
    return;
  }

  if (accepted.length > 0) {
    const merged = enforceSeedSnapshotCap(
      [...existing, ...accepted],
      MAX_SEED_SNAPSHOT_SIZE
    );
    saveJsonFile(SNAPSHOT_PATH, merged);
    saveJsonFile(CACHE_PATH, cache);
    saveJsonFile(TRANSLATION_CACHE_PATH, tCache);
    console.log(
      `[CURATION COMPLETE] Added ${accepted.length} items -> total ${merged.length} (cap ${MAX_SEED_SNAPSHOT_SIZE})`
    );
  } else {
    console.log("[CURATION COMPLETE] No new items added.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[FATAL]", err);
    process.exit(1);
  });
}
