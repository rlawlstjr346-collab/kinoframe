import type {
  ArchiveCategory,
  ArchiveItem,
  AspectRatio,
  CountryCode,
  Era,
  MediaMode,
  MediaType,
} from "@/types/archive";
import { isAllowedMediaProxyUrl } from "@/lib/media-allowlist";
import { getCanonicalMediaKey } from "@/lib/canonical-media";

export const CONDUIT_USER_AGENT =
  "KinoframeConduit/6.0 (+https://github.com/rlawlstjr346-collab/kinoframe; stateless-realtime-conduit)";

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_LRU_ENTRIES = 160;
const HOST_JITTER_MIN_MS = 1500;
const HOST_JITTER_MAX_MS = 2500;
const REQUEST_TIMEOUT_MS = 6500;
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;

const ALLOWED_SOURCE_HOSTS = new Set<string>([
  "archive.org",
  "commons.wikimedia.org",
  "images.nasa.gov",
]);

export interface ConduitQueryParams {
  category?: ArchiveCategory | "ALL";
  country?: CountryCode | "ALL";
  decade?: Era | "ALL";
  mediaMode?: MediaMode;
  q?: string;
  cursor?: number;
  seed?: number;
}

export interface ConduitResponsePayload {
  items: ArchiveItem[];
  cursor: number;
  nextCursor: number | null;
  hasMore: boolean;
  cached: boolean;
  sources: {
    archiveOrg: number;
    wikimedia: number;
  };
  degraded: boolean;
}

export function isAllowedMediaUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  return isAllowedMediaProxyUrl(rawUrl);
}

export function isAllowedSourceUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_SOURCE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export class ConduitCircuitBreaker {
  private cooldownUntil = new Map<string, number>();
  private readonly defaultCooldownMs: number;

  constructor(defaultCooldownMs = CIRCUIT_COOLDOWN_MS) {
    this.defaultCooldownMs = defaultCooldownMs;
  }

  isOpen(host: string, now = Date.now()): boolean {
    const until = this.cooldownUntil.get(host.toLowerCase());
    if (!until) return false;
    if (now >= until) {
      this.cooldownUntil.delete(host.toLowerCase());
      return false;
    }
    return true;
  }

  trip(host: string, status: number, now = Date.now()): boolean {
    if (status === 429 || status === 403) {
      this.cooldownUntil.set(host.toLowerCase(), now + this.defaultCooldownMs);
      return true;
    }
    return false;
  }

  reset(host?: string): void {
    if (host) {
      this.cooldownUntil.delete(host.toLowerCase());
    } else {
      this.cooldownUntil.clear();
    }
  }
}

interface LruEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryLruCache<T> {
  private store = new Map<string, LruEntry<T>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = MAX_LRU_ENTRIES, ttlMs = CACHE_TTL_MS) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get(key: string, now = Date.now()): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (now >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // Refresh LRU recency
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { value, expiresAt: now + this.ttlMs });
  }
}

interface HttpConditionalEntry {
  etag: string | null;
  lastModified: string | null;
  body: unknown;
  storedAt: number;
}

export const conduitCircuitBreaker = new ConduitCircuitBreaker();
const responseLru = new MemoryLruCache<ConduitResponsePayload>(MAX_LRU_ENTRIES, CACHE_TTL_MS);
const conditionalLru = new MemoryLruCache<HttpConditionalEntry>(MAX_LRU_ENTRIES * 2, CACHE_TTL_MS * 2);
const hostLastRequestAt = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitHostJitter(host: string): Promise<void> {
  const key = host.toLowerCase();
  const last = hostLastRequestAt.get(key) ?? 0;
  const elapsed = Date.now() - last;
  if (last > 0 && elapsed < HOST_JITTER_MIN_MS) {
    const jitter =
      HOST_JITTER_MIN_MS +
      Math.floor(Math.random() * (HOST_JITTER_MAX_MS - HOST_JITTER_MIN_MS + 1));
    await sleep(Math.max(0, jitter - elapsed));
  }
  hostLastRequestAt.set(key, Date.now());
}

async function fetchJsonPolitely(
  url: string,
  breaker: ConduitCircuitBreaker = conduitCircuitBreaker
): Promise<{ ok: boolean; data: unknown | null; degraded: boolean }> {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, data: null, degraded: false };
  }

  const cachedHttp = conditionalLru.get(url);
  if (breaker.isOpen(host)) {
    return {
      ok: Boolean(cachedHttp),
      data: cachedHttp?.body ?? null,
      degraded: true,
    };
  }

  await waitHostJitter(host);

  const headers: Record<string, string> = {
    "User-Agent": CONDUIT_USER_AGENT,
    Accept: "application/json",
  };
  if (cachedHttp?.etag) {
    headers["If-None-Match"] = cachedHttp.etag;
  }
  if (cachedHttp?.lastModified) {
    headers["If-Modified-Since"] = cachedHttp.lastModified;
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (breaker.trip(host, res.status)) {
      if (res.body) {
        try {
          await res.body.cancel();
        } catch {}
      }
      return {
        ok: Boolean(cachedHttp),
        data: cachedHttp?.body ?? null,
        degraded: true,
      };
    }

    if (res.status === 304 && cachedHttp) {
      return { ok: true, data: cachedHttp.body, degraded: false };
    }

    if (!res.ok) {
      if (res.body) {
        try {
          await res.body.cancel();
        } catch {}
      }
      return {
        ok: Boolean(cachedHttp),
        data: cachedHttp?.body ?? null,
        degraded: false,
      };
    }

    const body = (await res.json()) as unknown;
    conditionalLru.set(url, {
      etag: res.headers.get("etag") || cachedHttp?.etag || null,
      lastModified: res.headers.get("last-modified") || cachedHttp?.lastModified || null,
      body,
      storedAt: Date.now(),
    });
    return { ok: true, data: body, degraded: false };
  } catch {
    return {
      ok: Boolean(cachedHttp),
      data: cachedHttp?.body ?? null,
      degraded: true,
    };
  }
}

const KO_GLOSSARY: Array<[RegExp, string]> = [
  [/\bVHS\b/gi, "VHS 테이프"],
  [/\bCamcorder\b/gi, "캠코더"],
  [/\bHome\s*Movies?\b/gi, "홈비디오"],
  [/\bComputer\s*Graphics?\b/gi, "초기 컴퓨터 그래픽"],
  [/\bComputer\s*Chronicles\b/gi, "컴퓨터 크로니클"],
  [/\bCyber(space|punk)?\b/gi, "사이버 스페이스"],
  [/\bVirtual\s*Reality\b/gi, "가상현실"],
  [/\b3D\s*Animation\b/gi, "초기 3D 애니메이션"],
  [/\bOscilloscope\b/gi, "오실로스코프"],
  [/\bCRT\b/gi, "브라운관 CRT"],
  [/\bGlitch\b/gi, "글리치 신호"],
  [/\bTelevision|Broadcast\b/gi, "심야 방송"],
  [/\bCommercial(s)?\b/gi, "TVCF"],
  [/\bTrailer(s)?\b/gi, "예고편"],
  [/\bCartoon(s)?\b/gi, "셀 애니"],
  [/\bAnimation\b/gi, "애니메이션"],
  [/\bPoster\b/gi, "포스터"],
  [/\bBillboard\b/gi, "빌보드"],
  [/\bNeon\b/gi, "네온"],
  [/\bStreetcar|Cable\s*Car|Tram\b/gi, "트램"],
  [/\bStreet\b/gi, "거리"],
  [/\bTokyo\b/gi, "도쿄"],
  [/\bShibuya\b/gi, "시부야"],
  [/\bShinjuku\b/gi, "신주쿠"],
  [/\bSeoul\b/gi, "서울"],
  [/\bTaipei\b/gi, "타이베이"],
  [/\bHong\s*Kong\b/gi, "홍콩"],
  [/\bNew\s*York\b/gi, "뉴욕"],
  [/\bSan\s*Francisco\b/gi, "샌프란시스코"],
  [/\bParis\b/gi, "파리"],
  [/\bLondon\b/gi, "런던"],
  [/\bBerlin\b/gi, "베를린"],
  [/\bNight\b/gi, "야경"],
  [/\bVintage\b/gi, "빈티지"],
  [/\bKodachrome\b/gi, "코다크롬"],
];

const CATEGORY_KO_SUFFIX: Record<ArchiveCategory, string> = {
  TVCF: "빈티지 TVCF",
  CLASSIC_FILM: "고전 시네마 클립",
  STREET_ERA: "시대 거리 아카이브",
  WEB_PHANTOM: "인터넷 망령 아카이브",
  AD_BILLBOARD: "옥외·지면 광고",
  ALBUM_POSTER: "그래픽 포스터",
  ANIME_COMIC: "고전 애니·코믹",
  PHOTO: "아카이브 보도사진",
};

const CATEGORY_PALETTES: Record<
  ArchiveCategory,
  [string, string, string, string, string]
> = {
  TVCF: ["#141E30", "#D94B38", "#E6B43C", "#2C7A8C", "#F4EFE2"],
  CLASSIC_FILM: ["#12141C", "#A83B2D", "#C89B45", "#3A546B", "#EAE3D2"],
  STREET_ERA: ["#101824", "#D97724", "#356B8C", "#E5B94C", "#ECE6D8"],
  WEB_PHANTOM: ["#0E1525", "#27D3C3", "#E5533D", "#E8B931", "#ECE7DC"],
  AD_BILLBOARD: ["#162238", "#D94B38", "#E6B43C", "#3A7D8C", "#F4EFE2"],
  ALBUM_POSTER: ["#1A1822", "#C93B2B", "#E0A834", "#3B6E8C", "#F0EAE0"],
  ANIME_COMIC: ["#161C34", "#E24A33", "#F0B429", "#2E7DB2", "#F5F0E1"],
  PHOTO: ["#1A2B3C", "#C84B31", "#4A7C8C", "#D9A441", "#EFE8DA"],
};

export function cleanKoreanTitle(
  rawTitle: string,
  year: number,
  category: ArchiveCategory
): string {
  let cleaned = String(rawTitle || "")
    .replace(/^File:/i, "")
    .replace(/\.(jpg|jpeg|png|webp|gif|mp4|webm|ogv|mov|mkv)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\b(512kb|ia|hd|4k|1080p|720p|480p)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, ko] of KO_GLOSSARY) {
    cleaned = cleaned.replace(pattern, ko);
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  const core = cleaned.length > 38 ? `${cleaned.slice(0, 38).trim()}…` : cleaned || "무제 필름";
  const suffix = CATEGORY_KO_SUFFIX[category];
  return `${year} ${core} · ${suffix}`.replace(/\s+/g, " ").trim();
}

export function buildInternetArchivePointerId(identifier: string): string {
  const sanitized = String(identifier || "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 44);
  if (sanitized.length >= 2) {
    return `KF-IA-${sanitized}`;
  }
  let hash = 2166136261;
  for (let i = 0; i < identifier.length; i += 1) {
    hash ^= identifier.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `KF-IA-${(hash >>> 0).toString(36)}`;
}

export function buildWikimediaPointerId(pageId: number | string): string {
  const sanitized = String(pageId || "")
    .replace(/[^A-Za-z0-9_-]+/g, "")
    .slice(0, 44);
  return `KF-WM-${sanitized.length >= 2 ? sanitized : `P${sanitized || "00"}`}`;
}

function mapEra(year: number): Era {
  if (year < 1970) return "1950-60s";
  if (year < 1980) return "1970s";
  if (year < 1990) return "1980s";
  return "1990-00s";
}

function mapAspectRatio(w: number, h: number): AspectRatio {
  const ratio = w / Math.max(1, h);
  if (ratio < 0.9) return "4:5";
  if (ratio > 2.0) return "2.39:1";
  if (ratio > 1.6) return "16:9";
  if (ratio > 1.4) return "3:2";
  return "4:3";
}

function mapCategoryToMediaType(
  category: ArchiveCategory,
  isVideo: boolean
): MediaType {
  if (category === "TVCF") return "TVCF";
  if (!isVideo && (category === "AD_BILLBOARD" || category === "ALBUM_POSTER")) {
    return "PRINT";
  }
  if (!isVideo && category === "PHOTO") return "PHOTO";
  return "NEWS";
}

function inferCountryFromText(
  text: string,
  fallback: CountryCode = "GLOBAL"
): CountryCode {
  if (/seoul|busan|korea|서울|부산|한국/i.test(text)) return "KR";
  if (/tokyo|osaka|kyoto|shibuya|shinjuku|ginza|japan|도쿄|일본/i.test(text)) return "JP";
  if (/taipei|taiwan|타이베이|대만/i.test(text)) return "TW";
  if (/paris|london|berlin|rome|milan|amsterdam|prague|europe|파리|런던|베를린/i.test(text)) {
    return "EU";
  }
  if (/new york|san francisco|chicago|los angeles|usa|american|뉴욕|샌프란시스코/i.test(text)) {
    return "US";
  }
  return fallback;
}

function parseDurationSec(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(5, Math.min(3600, Math.round(raw)));
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return Math.max(5, Math.min(3600, Math.round(Number(trimmed))));
    }
    const parts = trimmed.split(":").map(Number);
    if (parts.every((n) => Number.isFinite(n))) {
      if (parts.length === 2) return Math.max(5, Math.round(parts[0] * 60 + parts[1]));
      if (parts.length === 3) {
        return Math.max(5, Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]));
      }
    }
  }
  return 45;
}

export const BLOCKED_CONTENT_REGEX =
  /\b(porn|xxx|nsfw|nude|hentai|selfie|group[_ -]?photo|merchandise|t-?shirt|storefront|afips|federation|conference|symposium|seminar|lecture|talk|interview|unboxing|review|nintendo|famicom|game.?boy|atari|sega|playstation|xbox|console|flip.?phone|cell.?phone|smartphone|nokia|motorola|hardware|motherboard|calculator|typewriter|stamp|postage|matchbox|brochure|flyer|pamphlet|manual|catalog|manuscript|book.?page|textbook|dictionary|patent|diagram|chart|slide.?deck)\b/i;

export interface RawInternetArchiveInput {
  identifier: string;
  title: string;
  year?: number | string | null;
  mp4FileName: string;
  durationRaw?: unknown;
  category: ArchiveCategory;
  countryHint?: CountryCode;
}

export function normalizeInternetArchiveItem(
  input: RawInternetArchiveInput
): ArchiveItem | null {
  const idClean = String(input.identifier || "").trim();
  const mp4Clean = String(input.mp4FileName || "").trim();
  if (!idClean || !mp4Clean || !/\.mp4$/i.test(mp4Clean)) return null;
  if (BLOCKED_CONTENT_REGEX.test(`${idClean} ${input.title}`)) return null;

  const thumbnailUrl = `https://archive.org/services/img/${encodeURIComponent(idClean)}`;
  const previewVideoUrl = `https://archive.org/download/${encodeURIComponent(
    idClean
  )}/${encodeURIComponent(mp4Clean).replace(/%2F/g, "/")}`;
  const sourceUrl = `https://archive.org/details/${encodeURIComponent(idClean)}`;

  if (
    !isAllowedMediaUrl(thumbnailUrl) ||
    !isAllowedMediaUrl(previewVideoUrl) ||
    !isAllowedSourceUrl(sourceUrl)
  ) {
    return null;
  }

  const parsedYear = Number.parseInt(String(input.year ?? "1986").slice(0, 4), 10);
  const year = Math.max(1950, Math.min(2009, Number.isNaN(parsedYear) ? 1986 : parsedYear));
  const originalTitle = String(input.title || idClean).trim().slice(0, 140);
  const country = inferCountryFromText(
    `${originalTitle} ${idClean}`,
    input.countryHint ?? "US"
  );
  const palette = CATEGORY_PALETTES[input.category];

  return {
    id: buildInternetArchivePointerId(idClean),
    titleKo: cleanKoreanTitle(originalTitle, year, input.category),
    originalTitle,
    brandOrSource: "Internet Archive / Live Conduit Stream",
    year,
    era: mapEra(year),
    mediaType: mapCategoryToMediaType(input.category, true),
    category: input.category,
    country,
    aspectRatio: "4:3",
    durationSec: parseDurationSec(input.durationRaw),
    mediaSource: "archive_mp4",
    thumbnailUrl,
    previewVideoUrl,
    youtubeId: null,
    sourceUrl,
    licenseNote: "Public Domain / Internet Archive (Live Conduit)",
    compositionTags: ["프레임 속 프레임", "기하학 조형"],
    persuasionTags: ["초반 3초 시선 강탈", "다큐 리얼리즘"],
    palette,
    viewfinder: {
      vanishingPoint: [50, 48],
      eyePath: [
        [26, 58],
        [50, 48],
        [74, 38],
      ],
      primaryGrid: "perspective",
    },
    beats: [
      {
        label: "초반 훅 프레임",
        timeOrZone: "0:02",
        noteKo: "실시간 외부 수맥에서 스트리밍된 원판 영상의 즉각적인 시각 임팩트",
        focusCrop: "50% 48%",
      },
      {
        label: "구도 리딩라인",
        timeOrZone: "0:10",
        noteKo: "아날로그 필름·테이프 원판의 공간 깊이와 피사체 배치",
        focusCrop: "35% 54%",
      },
      {
        label: "색채 톤 대비",
        timeOrZone: "0:20",
        noteKo: "시대적 색수차와 명도 대비가 형성하는 시각적 무드",
        focusCrop: "65% 42%",
      },
      {
        label: "루프 아카이브",
        timeOrZone: "0:32",
        noteKo: "무음 자동 루프 월에서 반복 리듬을 형성하는 클로징 구간",
        focusCrop: "50% 50%",
      },
    ],
    breakdown: {
      hook3s: "원판 아카이브 필름 특유의 텍스처와 움직임이 첫 1초 만에 시선을 고정한다.",
      framing: "현장 기록 중심의 비정형 프레이밍이 현대 광고·영상에 신선한 시각 레퍼런스를 제공한다.",
      marketingApply: "실시간 발굴된 퍼블릭 도메인 무빙 소스로 캠페인 무드보드 및 티저 시안에 활용한다.",
    },
  };
}

export interface RawWikimediaInput {
  pageId: number | string;
  title: string;
  descriptionUrl: string;
  thumbnailUrl: string;
  videoUrl?: string | null;
  width?: number;
  height?: number;
  durationSec?: number | null;
  year?: number;
  category: ArchiveCategory;
  countryHint?: CountryCode;
}

export function normalizeWikimediaItem(
  input: RawWikimediaInput
): ArchiveItem | null {
  const titleClean = String(input.title || "")
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .trim();
  if (!titleClean || BLOCKED_CONTENT_REGEX.test(titleClean)) return null;

  const cleanThumb = String(input.thumbnailUrl || "").split("?utm_source=")[0];
  const cleanVideo = input.videoUrl ? String(input.videoUrl) : null;
  const sourceUrl = String(input.descriptionUrl || "");

  if (!isAllowedMediaUrl(cleanThumb) || !isAllowedSourceUrl(sourceUrl)) {
    return null;
  }
  if (cleanVideo && !isAllowedMediaUrl(cleanVideo)) {
    return null;
  }

  const isVideo = Boolean(cleanVideo && /\.(webm|mp4)(\?.*)?$/i.test(cleanVideo));
  if (!isVideo) return null;
  const year = Math.max(1950, Math.min(2009, input.year ?? (isVideo ? 1996 : 1968)));
  const country = inferCountryFromText(titleClean, input.countryHint ?? "GLOBAL");
  const palette = CATEGORY_PALETTES[input.category];

  return {
    id: buildWikimediaPointerId(input.pageId),
    titleKo: cleanKoreanTitle(titleClean, year, input.category),
    originalTitle: titleClean.slice(0, 140),
    brandOrSource: isVideo
      ? "Wikimedia Commons / Open Motion Conduit"
      : "Wikimedia Commons / Archival Still Conduit",
    year,
    era: mapEra(year),
    mediaType: mapCategoryToMediaType(input.category, isVideo),
    category: input.category,
    country,
    aspectRatio: mapAspectRatio(input.width ?? 1280, input.height ?? 720),
    durationSec: isVideo ? parseDurationSec(input.durationSec ?? 24) : null,
    mediaSource: isVideo ? "archive_mp4" : "still_image",
    thumbnailUrl: cleanThumb,
    previewVideoUrl: isVideo ? cleanVideo : null,
    youtubeId: null,
    sourceUrl,
    licenseNote: "CC / Public Domain (Wikimedia Commons Conduit)",
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
      primaryGrid: isVideo ? "perspective" : "symmetry",
    },
    beats: [
      {
        label: "핵심 시선 앵커",
        timeOrZone: isVideo ? "0:02" : "중앙 포커스",
        noteKo: "선명한 실루엣과 프레임 비례가 첫 시선을 화면 중앙에 고정한다",
        focusCrop: "50% 48%",
      },
      {
        label: "리딩라인 전개",
        timeOrZone: isVideo ? "0:08" : "좌→우 축",
        noteKo: "공간 투시선과 시선 이동 축이 입체감을 강화한다",
        focusCrop: "36% 54%",
      },
      {
        label: "색채 밸런스",
        timeOrZone: isVideo ? "0:16" : "배경×전경",
        noteKo: "명암 대비와 아카이브 톤 밸런스로 시각적 밀도를 유지한다",
        focusCrop: "64% 42%",
      },
      {
        label: "프레임 마감",
        timeOrZone: isVideo ? "0:24" : "전체 프레임",
        noteKo: "실시간 아카이브 원판의 질감과 구도를 그대로 보존한다",
        focusCrop: "50% 50%",
      },
    ],
    breakdown: {
      hook3s: "원판 아카이브 특유의 공간감과 명도 대비가 즉각적인 몰입을 유도한다.",
      framing: "균형 잡힌 비례와 소실점 배치가 시각 정보를 단숨에 정돈한다.",
      marketingApply: "키 비주얼·무드보드·숏폼 인트로 컷 구성 시 구도 레퍼런스로 활용한다.",
    },
  };
}

export function deduplicateConduitItems(
  items: ArchiveItem[],
  existingKeys?: {
    ids?: Set<string>;
    sourceUrls?: Set<string>;
    videoUrls?: Set<string>;
    canonicalKeys?: Set<string>;
  }
): ArchiveItem[] {
  const seenIds = new Set<string>(existingKeys?.ids ?? []);
  const seenSources = new Set<string>(existingKeys?.sourceUrls ?? []);
  const seenVideos = new Set<string>(existingKeys?.videoUrls ?? []);
  const seenCanonical = new Set<string>(existingKeys?.canonicalKeys ?? []);
  const out: ArchiveItem[] = [];

  for (const item of items) {
    if (!item?.id || !item.sourceUrl || !item.thumbnailUrl) continue;
    if (!isAllowedMediaUrl(item.thumbnailUrl) || !isAllowedSourceUrl(item.sourceUrl)) {
      continue;
    }
    if (item.previewVideoUrl && !isAllowedMediaUrl(item.previewVideoUrl)) {
      continue;
    }
    const canonicalKey = getCanonicalMediaKey(item);
    if (
      seenIds.has(item.id) ||
      seenSources.has(item.sourceUrl) ||
      seenCanonical.has(canonicalKey)
    ) {
      continue;
    }
    if (item.previewVideoUrl && seenVideos.has(item.previewVideoUrl)) continue;

    seenIds.add(item.id);
    seenSources.add(item.sourceUrl);
    seenCanonical.add(canonicalKey);
    if (item.previewVideoUrl) seenVideos.add(item.previewVideoUrl);
    out.push(item);
  }

  return out;
}

interface ConduitSourceSpec {
  iaQuery: string;
  wmVideoQuery: string;
  targetCategory: ArchiveCategory;
  countryHint: CountryCode;
}

function getCategorySourceSpecs(
  category: ArchiveCategory | "ALL",
  country: CountryCode | "ALL",
  q: string,
  seed: number,
  cursor: number
): ConduitSourceSpec {
  const userQ = q.trim().replace(/["<>]/g, " ");
  const countryKeyword: Record<CountryCode | "ALL", string> = {
    ALL: "",
    KR: "Seoul Korea",
    JP: "Tokyo Japan",
    TW: "Taipei Taiwan",
    US: "New York San Francisco",
    EU: "Paris London Berlin",
    GLOBAL: "Hong Kong Istanbul Cairo Mexico",
  };
  const countryToken = countryKeyword[country] || "";
  const extraSearch = [userQ, countryToken].filter(Boolean).join(" ").trim();
  const iaExtra = extraSearch ? ` AND (${extraSearch})` : "";

  const allRotation: ArchiveCategory[] = [
    "STREET_ERA",
    "TVCF",
    "CLASSIC_FILM",
    "WEB_PHANTOM",
    "ANIME_COMIC",
    "AD_BILLBOARD",
    "ALBUM_POSTER",
    "PHOTO",
  ];
  const resolvedCategory: ArchiveCategory =
    category === "ALL"
      ? allRotation[(Math.abs(seed) + Math.max(0, cursor - 1)) % allRotation.length]
      : category;

  const countryHint: CountryCode = country === "ALL" ? "GLOBAL" : country;

  switch (resolvedCategory) {
    case "WEB_PHANTOM":
      return {
        targetCategory: "WEB_PHANTOM",
        countryHint,
        iaQuery: `(collection:vhsvault OR collection:home_movies OR collection:ephemeralfilms OR collection:television) AND mediatype:movies AND format:"512Kb MPEG4"${iaExtra}`,
        wmVideoQuery: `filetype:video ${extraSearch || "CRT analog oscilloscope neon visual glitch"}`,
      };
    case "TVCF":
      return {
        targetCategory: "TVCF",
        countryHint: country === "ALL" ? "US" : country,
        iaQuery: `(collection:prelinger OR collection:classic_tv_commercials) AND mediatype:movies AND (commercial OR advertisement OR television) AND format:"512Kb MPEG4"${iaExtra}`,
        wmVideoQuery: `filetype:video ${extraSearch || "vintage commercial television film"}`,
      };
    case "CLASSIC_FILM":
      return {
        targetCategory: "CLASSIC_FILM",
        countryHint: country === "ALL" ? "US" : country,
        iaQuery: `(collection:movie_trailers OR collection:feature_films OR collection:film_noir OR collection:sci_fi_horror) AND mediatype:movies AND format:"512Kb MPEG4"${iaExtra}`,
        wmVideoQuery: `filetype:video ${extraSearch || "classic cinema film trailer silent movie"}`,
      };
    case "STREET_ERA":
      return {
        targetCategory: "STREET_ERA",
        countryHint,
        iaQuery: `(collection:prelinger OR collection:travelogues) AND mediatype:movies AND (street OR tram OR city OR harbor OR downtown) AND format:"512Kb MPEG4"${iaExtra}`,
        wmVideoQuery: `filetype:video ${extraSearch || "city street tram night driving walking"}`,
      };
    case "ANIME_COMIC":
      return {
        targetCategory: "ANIME_COMIC",
        countryHint: country === "ALL" ? "US" : country,
        iaQuery: `(collection:classic_cartoons OR collection:animationandcartoons) AND mediatype:movies AND format:"512Kb MPEG4"${iaExtra}`,
        wmVideoQuery: `filetype:video ${extraSearch || "classic cartoon animation cel"}`,
      };
    case "AD_BILLBOARD":
      return {
        targetCategory: "AD_BILLBOARD",
        countryHint,
        iaQuery: `collection:prelinger AND mediatype:movies AND (neon OR billboard OR sign OR times square) AND format:"512Kb MPEG4"${iaExtra}`,
        wmVideoQuery: `filetype:video ${extraSearch || "neon sign billboard night street"}`,
      };
    case "ALBUM_POSTER":
      return {
        targetCategory: "ALBUM_POSTER",
        countryHint,
        iaQuery: `(collection:prelinger OR collection:musicvideo) AND mediatype:movies AND (concert OR jazz OR music OR festival) AND format:"512Kb MPEG4"${iaExtra}`,
        wmVideoQuery: `filetype:video ${extraSearch || "vintage jazz concert music performance"}`,
      };
    case "PHOTO":
    default:
      return {
        targetCategory: "PHOTO",
        countryHint,
        iaQuery: `(collection:prelinger OR collection:newsandpublicaffairs) AND mediatype:movies AND (city OR aerial OR train OR night) AND format:"512Kb MPEG4"${iaExtra}`,
        wmVideoQuery: `filetype:video ${extraSearch || "historical newsreel documentary street cinema"}`,
      };
  }
}

function buildDecadeFilter(decade: Era | "ALL"): string {
  switch (decade) {
    case "1950-60s":
      return " AND year:[1950 TO 1969]";
    case "1970s":
      return " AND year:[1970 TO 1979]";
    case "1980s":
      return " AND year:[1980 TO 1989]";
    case "1990-00s":
      return " AND year:[1990 TO 2009]";
    default:
      return "";
  }
}

function pickBestIaMp4File(files: unknown): { name: string; length?: unknown } | null {
  if (!Array.isArray(files)) return null;
  const mp4s = files.filter((entry): entry is { name: string; size?: string | number; length?: unknown } => {
    if (!entry || typeof entry !== "object") return false;
    const f = entry as { name?: unknown; size?: unknown };
    if (typeof f.name !== "string" || !/\.mp4$/i.test(f.name)) return false;
    const size = Number(f.size ?? 0);
    return size > 180_000 && size < 140_000_000;
  });
  if (mp4s.length === 0) return null;
  mp4s.sort((a, b) => {
    const a512 = /_512kb\.mp4$/i.test(a.name) ? 0 : 1;
    const b512 = /_512kb\.mp4$/i.test(b.name) ? 0 : 1;
    if (a512 !== b512) return a512 - b512;
    return Number(a.size ?? 0) - Number(b.size ?? 0);
  });
  return mp4s[0];
}

async function fetchInternetArchiveConduit(
  spec: ConduitSourceSpec,
  decade: Era | "ALL",
  cursor: number,
  seed: number,
  mediaMode: MediaMode
): Promise<{ items: ArchiveItem[]; degraded: boolean }> {
  if (mediaMode === "STILL") {
    return { items: [], degraded: false };
  }

  // Deep abyss offset: each visit/shuffle seed lands on a distinct deep archive page
  const abyssPageOffset = Math.abs(seed) % 32;
  const page = Math.max(1, cursor + abyssPageOffset);
  const fullQuery = `${spec.iaQuery}${buildDecadeFilter(decade)}`;

  const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
    fullQuery
  )}&fl[]=identifier&fl[]=title&fl[]=year&rows=8&page=${page}&output=json`;

  const searchRes = await fetchJsonPolitely(searchUrl);
  if (!searchRes.ok || !searchRes.data) {
    return { items: [], degraded: searchRes.degraded };
  }

  const docs = (
    searchRes.data as {
      response?: { docs?: Array<{ identifier?: string; title?: string; year?: string | number }> };
    }
  )?.response?.docs;
  if (!Array.isArray(docs) || docs.length === 0) {
    return { items: [], degraded: searchRes.degraded };
  }

  const items: ArchiveItem[] = [];
  let degraded = searchRes.degraded;

  // Fetch up to 3 metadata entries sequentially (honoring 1.5~2.5s same-host jitter)
  const sampleDocs = docs.slice(0, 3);
  for (const doc of sampleDocs) {
    const id = doc.identifier;
    if (!id) continue;
    const metaRes = await fetchJsonPolitely(
      `https://archive.org/metadata/${encodeURIComponent(id)}/files`
    );
    if (metaRes.degraded) degraded = true;
    if (!metaRes.ok || !metaRes.data) continue;

    const files = (metaRes.data as { result?: unknown[] })?.result;
    const best = pickBestIaMp4File(files);
    if (!best) continue;

    const normalized = normalizeInternetArchiveItem({
      identifier: id,
      title: String(doc.title || id),
      year: doc.year,
      mp4FileName: best.name,
      durationRaw: best.length,
      category: spec.targetCategory,
      countryHint: spec.countryHint,
    });
    if (normalized) items.push(normalized);
  }

  return { items, degraded };
}

async function fetchWikimediaConduit(
  spec: ConduitSourceSpec,
  cursor: number,
  seed: number,
  mediaMode: MediaMode
): Promise<{ items: ArchiveItem[]; degraded: boolean }> {
  // Strictly video-only conduit: never pull static documents, stamps, or hardware stills
  if (mediaMode === "STILL") {
    return { items: [], degraded: false };
  }

  const gsroffset = ((Math.max(0, cursor - 1) + (Math.abs(seed) % 14)) * 12) % 240;
  const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
    spec.wmVideoQuery
  )}&gsrlimit=14&gsroffset=${gsroffset}&prop=videoinfo&viprop=url|size|mime|derivatives&viurlwidth=960&format=json`;

  const res = await fetchJsonPolitely(apiUrl);
  if (!res.ok || !res.data) {
    return { items: [], degraded: res.degraded };
  }

  const pages = (
    res.data as {
      query?: {
        pages?: Record<
          string,
          {
            pageid?: number;
            title?: string;
            videoinfo?: Array<{
              url?: string;
              thumburl?: string;
              descriptionurl?: string;
              width?: number;
              height?: number;
              duration?: number;
              derivatives?: Array<{ src?: string }>;
            }>;
          }
        >;
      };
    }
  )?.query?.pages;

  if (!pages) {
    return { items: [], degraded: res.degraded };
  }

  const items: ArchiveItem[] = [];
  for (const page of Object.values(pages)) {
    if (!page?.pageid || !page.title) continue;
    const info = page.videoinfo?.[0];
    if (!info?.thumburl || !info.descriptionurl) continue;
    if ((info.width ?? 0) < 320) continue;

    const derivs = Array.isArray(info.derivatives) ? info.derivatives : [];
    const preferred =
      derivs.find(
        (d) =>
          typeof d?.src === "string" &&
          /480p.*\.webm(\?.*)?$/i.test(d.src) &&
          isAllowedMediaUrl(d.src)
      ) ||
      derivs.find(
        (d) =>
          typeof d?.src === "string" &&
          /720p.*\.webm(\?.*)?$/i.test(d.src) &&
          isAllowedMediaUrl(d.src)
      ) ||
      derivs.find(
        (d) =>
          typeof d?.src === "string" &&
          /\.webm(\?.*)?$/i.test(d.src) &&
          isAllowedMediaUrl(d.src)
      );

    const videoUrl =
      preferred?.src ||
      (typeof info.url === "string" &&
      /\.(webm|mp4)(\?.*)?$/i.test(info.url) &&
      isAllowedMediaUrl(info.url)
        ? info.url
        : null);
    if (!videoUrl) continue;

    const item = normalizeWikimediaItem({
      pageId: page.pageid,
      title: page.title,
      descriptionUrl: info.descriptionurl,
      thumbnailUrl: info.thumburl,
      videoUrl,
      width: info.width,
      height: info.height,
      durationSec: info.duration,
      category: spec.targetCategory,
      countryHint: spec.countryHint,
    });
    if (item) items.push(item);
  }

  return { items, degraded: res.degraded };
}

export async function queryConduitStream(
  rawParams: ConduitQueryParams
): Promise<ConduitResponsePayload> {
  const category = rawParams.category ?? "ALL";
  const country = rawParams.country ?? "ALL";
  const decade = rawParams.decade ?? "ALL";
  const mediaMode = rawParams.mediaMode ?? "ALL";
  const q = (rawParams.q ?? "").trim().slice(0, 120);
  const cursor = Math.max(1, Math.min(200, Math.floor(rawParams.cursor ?? 1) || 1));
  const seed = Math.abs(Math.floor(rawParams.seed ?? 1)) || 1;

  const cacheKey = JSON.stringify({
    category,
    country,
    decade,
    mediaMode,
    q: q.toLowerCase(),
    cursor,
    seed: seed % 64,
  });

  const cachedHit = responseLru.get(cacheKey);
  if (cachedHit) {
    return { ...cachedHit, cached: true };
  }

  const spec = getCategorySourceSpecs(category, country, q, seed, cursor);

  // Parallel cross-host fetch (archive.org + commons.wikimedia.org) with individual timeouts
  const [iaSettled, wmSettled] = await Promise.allSettled([
    fetchInternetArchiveConduit(spec, decade, cursor, seed, mediaMode),
    fetchWikimediaConduit(spec, cursor, seed, mediaMode),
  ]);

  const iaResult =
    iaSettled.status === "fulfilled"
      ? iaSettled.value
      : { items: [], degraded: true };
  const wmResult =
    wmSettled.status === "fulfilled"
      ? wmSettled.value
      : { items: [], degraded: true };

  // Strictly 100% direct-link video items only
  const combined = [...iaResult.items, ...wmResult.items].filter(
    (entry) => entry.mediaSource === "archive_mp4" && Boolean(entry.previewVideoUrl)
  );

  const deduped = deduplicateConduitItems(combined);
  const degraded = iaResult.degraded || wmResult.degraded;
  const hasMore = deduped.length > 0 && cursor < 200;

  const payload: ConduitResponsePayload = {
    items: deduped,
    cursor,
    nextCursor: hasMore ? cursor + 1 : null,
    hasMore,
    cached: false,
    sources: {
      archiveOrg: iaResult.items.length,
      wikimedia: wmResult.items.length,
    },
    degraded,
  };

  responseLru.set(cacheKey, payload);
  return payload;
}
