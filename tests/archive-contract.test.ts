import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveCategory, ArchiveItem, CountryCode, MediaType } from "@/types/archive";
import {
  ARCHIVE_CATEGORIES,
  COMPOSITION_TAGS,
  COUNTRIES,
  DEFAULT_FILTER_STATE,
  INITIAL_VISIBLE_COUNT,
  LOAD_MORE_STEP,
  MEDIA_MODES,
  PERSUASION_TAGS,
  filterAndSortArchive,
  generateMoodboardMarkdown,
  getVisibleArchiveSlice,
  isChromaticItem,
  parseBoardIds,
  resolveItemCategory,
  resolveItemCountry,
  rotateArchiveWithSeed,
  serializeBoardIds,
} from "@/lib/taxonomy";
import { isAllowedMediaProxyUrl } from "@/lib/media-allowlist";
import { VideoPlaybackScheduler } from "@/lib/video-scheduler";
import {
  ConduitCircuitBreaker,
  cleanKoreanTitle,
  deduplicateConduitItems,
  isAllowedMediaUrl,
  normalizeInternetArchiveItem,
  normalizeWikimediaItem,
} from "@/lib/conduit";
import { isConduitItemId, isValidArchiveItemId } from "@/lib/vault";
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";

const ITEMS = archiveSnapshot as ArchiveItem[];

const FORBIDDEN_PHRASES = [
  "준비 중",
  "Coming Soon",
  "coming soon",
  "샘플 데이터",
  "샘플 데이터 모드",
];

const ALL_V6_CATEGORIES: ArchiveCategory[] = [
  "TVCF",
  "CLASSIC_FILM",
  "STREET_ERA",
  "WEB_PHANTOM",
  "AD_BILLBOARD",
  "ALBUM_POSTER",
  "ANIME_COMIC",
  "PHOTO",
];

const PURGED_JUNK_SAMPLE_IDS = [
  "KF-199",
  "KF-244",
  "KF-249",
  "KF-297",
  "KF-439",
  "KF-442",
];

const WORLD_CITY_MATCHERS: Array<{ city: string; pattern: RegExp }> = [
  { city: "Paris", pattern: /paris|파리/i },
  { city: "London", pattern: /london|런던/i },
  { city: "Berlin", pattern: /berlin|베를린/i },
  { city: "Rome/Milan", pattern: /rome|roma|milan|milano|로마|밀라노/i },
  { city: "Amsterdam/Lisbon", pattern: /amsterdam|lisbon|lisboa|암스테르담|리스본/i },
  { city: "Budapest/Prague", pattern: /budapest|prague|praha|부다페스트|프라하/i },
  { city: "Moscow", pattern: /moscow|moskva|모스크바/i },
  { city: "New York", pattern: /new york|manhattan|times square|broadway|뉴욕|맨해튼/i },
  { city: "San Francisco", pattern: /san francisco|market street|cable car|샌프란시스코/i },
  { city: "Chicago", pattern: /chicago|시카고/i },
  { city: "Los Angeles", pattern: /los angeles|hollywood|로스앤젤레스|할리우드/i },
  { city: "Havana", pattern: /havana|habana|아바나/i },
  { city: "Mexico City", pattern: /mexico city|ciudad de m[eé]xico|멕시코시티/i },
  { city: "Buenos Aires", pattern: /buenos aires|부에노스아이레스/i },
  { city: "Rio/Sao Paulo", pattern: /rio de janeiro|s[aã]o paulo|리우|상파울루/i },
  { city: "Hong Kong", pattern: /hong kong|kowloon|홍콩|구룡/i },
  { city: "Shanghai/Beijing", pattern: /shanghai|beijing|peking|상하이|베이징/i },
  { city: "Bangkok/Singapore/Saigon", pattern: /bangkok|singapore|saigon|ho chi minh|방콕|싱가포르|사이공|호치민/i },
  { city: "Istanbul", pattern: /istanbul|galata|istiklal|이스탄불/i },
  { city: "Cairo/Casablanca/Beirut", pattern: /cairo|casablanca|beirut|marrakesh|카이로|카사블랑카|베이루트|마라케시/i },
  { city: "Tokyo/Osaka", pattern: /tokyo|shibuya|shinjuku|ginza|harajuku|osaka|도쿄|오사카/i },
  { city: "Seoul/Busan", pattern: /seoul|busan|myeongdong|서울|부산|한국/i },
  { city: "Taipei", pattern: /taipei|ximending|타이베이/i },
];

function extractSourceStem(url: string): string {
  try {
    const u = new URL(url);
    const ytV = u.searchParams.get("v");
    if (ytV) return `yt${ytV.toLowerCase()}`;
    const seg = decodeURIComponent(u.pathname.split("/").pop() || "");
    return seg
      .replace(/^File:/i, "")
      .replace(/^\d+px-/i, "")
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "");
  } catch {
    return url.toLowerCase();
  }
}

describe("KINOFRAME V6 Moving Wall, WEB_PHANTOM, Real-Time Conduit & Clean Scripts Contract", () => {
  it("verifies zero legacy one-off curate-v* scripts remain in scripts/", () => {
    const scriptsDir = path.resolve(process.cwd(), "scripts");
    const files = fs.readdirSync(scriptsDir);
    const legacyCrawlers = files.filter((f) => /^curate-v/i.test(f));
    expect(legacyCrawlers).toEqual([]);
    expect(files).toContain("verify-links.mjs");
    expect(files).toContain("auto-discover-archive.mjs");
  });

  it("achieves archive_mp4 > still_image inversion across all 8 categories including WEB_PHANTOM (>= 24)", () => {
    const byMedia = new Map<MediaType, number>();
    const byCategory = new Map<ArchiveCategory, number>();
    const byCountry = new Map<CountryCode, number>();
    const mp4ByCategory = new Map<ArchiveCategory, number>();
    let totalAutoLoopMp4 = 0;
    let totalStillImages = 0;
    let totalYoutube = 0;

    for (const item of ITEMS) {
      byMedia.set(item.mediaType, (byMedia.get(item.mediaType) ?? 0) + 1);
      const cat = resolveItemCategory(item);
      const country = resolveItemCountry(item);
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
      byCountry.set(country, (byCountry.get(country) ?? 0) + 1);

      if (item.mediaSource === "archive_mp4") {
        totalAutoLoopMp4 += 1;
        mp4ByCategory.set(cat, (mp4ByCategory.get(cat) ?? 0) + 1);
      } else if (item.mediaSource === "still_image") {
        totalStillImages += 1;
      } else if (item.mediaSource === "youtube_embed") {
        totalYoutube += 1;
      }
    }

    // Core V6 video-dominant inversion
    expect(totalAutoLoopMp4).toBeGreaterThanOrEqual(240);
    expect(totalStillImages).toBeLessThanOrEqual(190);
    expect(totalAutoLoopMp4).toBeGreaterThan(totalStillImages);
    expect((totalAutoLoopMp4 + totalYoutube) / ITEMS.length).toBeGreaterThanOrEqual(0.58);

    // 8 categories: ALL + 8 = 9 tabs
    expect(ARCHIVE_CATEGORIES).toHaveLength(9);
    expect(ARCHIVE_CATEGORIES.map((c) => c.value)).toEqual([
      "ALL",
      "TVCF",
      "CLASSIC_FILM",
      "STREET_ERA",
      "WEB_PHANTOM",
      "AD_BILLBOARD",
      "ALBUM_POSTER",
      "ANIME_COMIC",
      "PHOTO",
    ]);
    expect(MEDIA_MODES).toHaveLength(3);
    expect(COUNTRIES.some((c) => c.value === "GLOBAL")).toBe(true);
    for (const cat of ALL_V6_CATEGORIES) {
      const floor = cat === "WEB_PHANTOM" ? 24 : 34;
      expect(byCategory.get(cat) ?? 0).toBeGreaterThanOrEqual(floor);
    }

    // WEB_PHANTOM must be heavily motion-first
    expect(mp4ByCategory.get("WEB_PHANTOM") ?? 0).toBeGreaterThanOrEqual(24);

    // Category video density targets
    const streetTotal = byCategory.get("STREET_ERA") ?? 0;
    const streetMp4 = mp4ByCategory.get("STREET_ERA") ?? 0;
    expect(streetTotal).toBeGreaterThanOrEqual(72);
    expect(streetMp4).toBeGreaterThanOrEqual(60);

    const filmTotal = byCategory.get("CLASSIC_FILM") ?? 0;
    const filmMp4 = mp4ByCategory.get("CLASSIC_FILM") ?? 0;
    expect(filmTotal).toBeGreaterThanOrEqual(50);
    expect(filmMp4 / Math.max(1, filmTotal)).toBeGreaterThanOrEqual(0.75);

    expect(byCategory.get("TVCF") ?? 0).toBeGreaterThanOrEqual(65);
    expect(mp4ByCategory.get("TVCF") ?? 0).toBeGreaterThanOrEqual(48);

    expect(byCategory.get("ANIME_COMIC") ?? 0).toBeGreaterThanOrEqual(34);
    expect(mp4ByCategory.get("ANIME_COMIC") ?? 0).toBeGreaterThanOrEqual(18);

    // GLOBAL metropolitan filter populated
    expect(byCountry.get("GLOBAL") ?? 0).toBeGreaterThanOrEqual(20);
    expect(byCountry.get("EU") ?? 0).toBeGreaterThanOrEqual(40);

    const uniqueIds = new Set(ITEMS.map((i) => i.id));
    expect(uniqueIds.size).toBe(ITEMS.length);
  });

  it("verifies >= 16 distinct global cities inside STREET_ERA and GLOBAL country filter accuracy", () => {
    const streetItems = filterAndSortArchive(ITEMS, {
      ...DEFAULT_FILTER_STATE,
      category: "STREET_ERA",
    });

    const matchedCities = new Set<string>();
    for (const item of streetItems) {
      const text = `${item.titleKo} ${item.originalTitle} ${item.brandOrSource}`;
      for (const { city, pattern } of WORLD_CITY_MATCHERS) {
        if (pattern.test(text)) {
          matchedCities.add(city);
        }
      }
    }
    expect(matchedCities.size).toBeGreaterThanOrEqual(16);

    const globalFiltered = filterAndSortArchive(ITEMS, {
      ...DEFAULT_FILTER_STATE,
      country: "GLOBAL",
    });
    expect(globalFiltered.length).toBeGreaterThanOrEqual(20);
    for (const item of globalFiltered) {
      expect(resolveItemCountry(item)).toBe("GLOBAL");
    }
  });

  it("purges low-taste junk photos & bot duplicates and has zero duplicate source stems", () => {
    const idSet = new Set(ITEMS.map((i) => i.id));
    for (const purgedId of PURGED_JUNK_SAMPLE_IDS) {
      expect(idSet.has(purgedId)).toBe(false);
    }

    const sourceUrls = new Set<string>();
    const stems = new Set<string>();
    for (const item of ITEMS) {
      expect(sourceUrls.has(item.sourceUrl)).toBe(false);
      sourceUrls.add(item.sourceUrl);

      const stem = extractSourceStem(item.sourceUrl);
      expect(stem.length).toBeGreaterThan(2);
      expect(stems.has(stem)).toBe(false);
      stems.add(stem);
    }
  });

  it("contains zero forbidden placeholder strings, zero dead links, and valid URLs/palettes/beats", () => {
    const serialized = JSON.stringify(ITEMS);
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(serialized).not.toContain(phrase);
    }

    for (const item of ITEMS) {
      expect(item.id).toMatch(/^KF-\d{3,5}$/);
      expect(item.titleKo.trim().length).toBeGreaterThan(2);
      expect(item.originalTitle.trim().length).toBeGreaterThan(2);
      expect(item.thumbnailUrl).toMatch(/^https?:\/\//);
      expect(item.thumbnailUrl).not.toBe("#");
      expect(item.sourceUrl).toMatch(/^https?:\/\//);
      expect(item.sourceUrl).not.toBe("#");
      expect(ALL_V6_CATEGORIES).toContain(item.category);
      expect(item.country).toBeDefined();

      if (item.mediaSource === "archive_mp4") {
        expect(item.previewVideoUrl).toMatch(/^https?:\/\//);
        expect(item.previewVideoUrl).toMatch(/\.(mp4|webm)(\?.*)?$/i);
        expect(item.durationSec).not.toBeNull();
      } else if (item.mediaSource === "youtube_embed") {
        expect(item.youtubeId).toBeTruthy();
        expect(item.durationSec).not.toBeNull();
      } else {
        expect(item.durationSec).toBeNull();
      }

      expect(item.palette).toHaveLength(5);
      for (const hex of item.palette) {
        expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }

      expect(item.beats).toHaveLength(4);
      for (const beat of item.beats) {
        expect(beat.label.trim().length).toBeGreaterThan(0);
        expect(beat.noteKo.trim().length).toBeGreaterThan(5);
        expect(beat.focusCrop.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("validates viewfinder coordinates strictly within 0..100 range for schema compatibility", () => {
    for (const item of ITEMS) {
      const [vx, vy] = item.viewfinder.vanishingPoint;
      expect(vx).toBeGreaterThanOrEqual(0);
      expect(vx).toBeLessThanOrEqual(100);
      expect(vy).toBeGreaterThanOrEqual(0);
      expect(vy).toBeLessThanOrEqual(100);

      expect(item.viewfinder.eyePath).toHaveLength(3);
      for (const [x, y] of item.viewfinder.eyePath) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }

      expect(["perspective", "thirds", "symmetry", "golden"]).toContain(
        item.viewfinder.primaryGrid
      );
    }
  });

  it("slices progressive infinite scroll windows cleanly (initial 48 + step 36)", () => {
    expect(INITIAL_VISIBLE_COUNT).toBe(48);
    expect(LOAD_MORE_STEP).toBe(36);

    const firstPage = getVisibleArchiveSlice(ITEMS, INITIAL_VISIBLE_COUNT);
    expect(firstPage).toHaveLength(48);
    expect(firstPage[0].id).toBe(ITEMS[0].id);

    const secondPage = getVisibleArchiveSlice(
      ITEMS,
      INITIAL_VISIBLE_COUNT + LOAD_MORE_STEP
    );
    expect(secondPage).toHaveLength(84);

    expect(getVisibleArchiveSlice(ITEMS, 10)).toHaveLength(48);
    expect(getVisibleArchiveSlice(ITEMS, ITEMS.length + 500)).toHaveLength(
      ITEMS.length
    );
  });

  it("accurately filters by V5 7 categories, mediaMode (ALL/MOTION/STILL), country, era, and sorts cleanly", () => {
    for (const item of ITEMS) {
      expect(item.compositionTags.length).toBeGreaterThanOrEqual(1);
      expect(item.persuasionTags.length).toBeGreaterThanOrEqual(1);
      for (const c of item.compositionTags) {
        expect(COMPOSITION_TAGS).toContain(c);
      }
      for (const p of item.persuasionTags) {
        expect(PERSUASION_TAGS).toContain(p);
      }
    }

    const legacyMock = { ...ITEMS[0], category: "ROCK_POSTER" as unknown as ArchiveCategory };
    expect(resolveItemCategory(legacyMock)).toBe("ALBUM_POSTER");

    const motionOnly = filterAndSortArchive(ITEMS, {
      ...DEFAULT_FILTER_STATE,
      mediaMode: "MOTION",
    });
    expect(motionOnly.length).toBeGreaterThanOrEqual(225);
    for (const item of motionOnly) {
      expect(["archive_mp4", "youtube_embed"]).toContain(item.mediaSource);
    }

    const stillOnly = filterAndSortArchive(ITEMS, {
      ...DEFAULT_FILTER_STATE,
      mediaMode: "STILL",
    });
    expect(stillOnly.length).toBeLessThanOrEqual(190);
    expect(stillOnly.length).toBeGreaterThanOrEqual(140);
    for (const item of stillOnly) {
      expect(item.mediaSource).toBe("still_image");
    }

    const asc = filterAndSortArchive(ITEMS, {
      ...DEFAULT_FILTER_STATE,
      sort: "year_asc",
    });
    for (let i = 1; i < asc.length; i += 1) {
      expect(asc[i].year).toBeGreaterThanOrEqual(asc[i - 1].year);
    }

    const desc = filterAndSortArchive(ITEMS, {
      ...DEFAULT_FILTER_STATE,
      sort: "year_desc",
    });
    for (let i = 1; i < desc.length; i += 1) {
      expect(desc[i].year).toBeLessThanOrEqual(desc[i - 1].year);
    }
  });

  it("guarantees 75% auto-loop archive_mp4 (>= 18/24 & >= 36/48) on default sort and across 20 random seeds", () => {
    const defaultSorted = filterAndSortArchive(ITEMS, DEFAULT_FILTER_STATE);
    expect(defaultSorted).toHaveLength(ITEMS.length);

    const top24 = defaultSorted.slice(0, 24);
    const top48 = defaultSorted.slice(0, 48);
    expect(top24.filter((i) => i.mediaSource === "archive_mp4").length).toBeGreaterThanOrEqual(18);
    expect(top48.filter((i) => i.mediaSource === "archive_mp4").length).toBeGreaterThanOrEqual(36);

    const top16 = defaultSorted.slice(0, 16);
    expect(top16.filter((i) => isChromaticItem(i)).length).toBeGreaterThanOrEqual(12);
    expect(new Set(top16.map((i) => i.mediaType)).size).toBe(4);
    expect(new Set(top16.map((i) => resolveItemCategory(i))).size).toBeGreaterThanOrEqual(5);

    for (let i = 2; i < top16.length; i += 1) {
      const same3Media =
        top16[i].mediaType === top16[i - 1].mediaType &&
        top16[i - 1].mediaType === top16[i - 2].mediaType;
      expect(same3Media).toBe(false);

      const mono3 =
        !isChromaticItem(top16[i]) &&
        !isChromaticItem(top16[i - 1]) &&
        !isChromaticItem(top16[i - 2]);
      expect(mono3).toBe(false);

      const same3Country =
        resolveItemCountry(top16[i]) === resolveItemCountry(top16[i - 1]) &&
        resolveItemCountry(top16[i - 1]) === resolveItemCountry(top16[i - 2]);
      expect(same3Country).toBe(false);
    }

    const seeds = [
      7, 19, 42, 101, 256, 512, 777, 1024, 2026, 3333,
      4815, 6174, 7919, 9091, 12345, 31415, 54321, 77777, 99991, 271828,
    ];
    const topSignatures = new Set<string>();

    for (const seed of seeds) {
      const rotated = rotateArchiveWithSeed(defaultSorted, seed);
      expect(rotated).toHaveLength(ITEMS.length);
      expect(new Set(rotated.map((i) => i.id)).size).toBe(ITEMS.length);

      const rotTop24Mp4 = rotated
        .slice(0, 24)
        .filter((i) => i.mediaSource === "archive_mp4").length;
      const rotTop48Mp4 = rotated
        .slice(0, 48)
        .filter((i) => i.mediaSource === "archive_mp4").length;
      const rotTop16Chroma = rotated
        .slice(0, 16)
        .filter((i) => isChromaticItem(i)).length;

      expect(rotTop24Mp4).toBeGreaterThanOrEqual(18);
      expect(rotTop48Mp4).toBeGreaterThanOrEqual(36);
      expect(rotTop16Chroma).toBeGreaterThanOrEqual(11);

      topSignatures.add(rotated.slice(0, 12).map((i) => i.id).join(","));
    }

    expect(topSignatures.size).toBeGreaterThanOrEqual(18);
  });

  it("enforces global video concurrency cap (desktop 8 / mobile 4) and instant hover promotion", () => {
    const desktopScheduler = new VideoPlaybackScheduler(8);
    const states = new Map<string, boolean>();

    for (let i = 1; i <= 14; i += 1) {
      const id = `KF-${String(i).padStart(3, "0")}`;
      desktopScheduler.register({
        id,
        ratio: 0.8,
        centerDistance: i * 40,
        hovered: false,
        onSlotChange: (allowed) => states.set(id, allowed),
      });
    }

    expect(desktopScheduler.getActiveIds()).toHaveLength(8);
    expect(states.get("KF-001")).toBe(true);
    expect(states.get("KF-014")).toBe(false);

    // Hovering KF-014 promotes it immediately into active slots while staying capped at 8
    desktopScheduler.update("KF-014", { hovered: true });
    expect(desktopScheduler.getActiveIds()).toHaveLength(8);
    expect(states.get("KF-014")).toBe(true);
    expect(states.get("KF-008")).toBe(false);

    // Unregistering an active card hands off slot cleanly
    desktopScheduler.unregister("KF-001");
    expect(desktopScheduler.getActiveIds()).toHaveLength(8);
    expect(states.get("KF-008")).toBe(true);

    // Mobile cap = 4
    const mobileScheduler = new VideoPlaybackScheduler(4);
    for (let i = 1; i <= 10; i += 1) {
      mobileScheduler.register({
        id: `M-${i}`,
        ratio: 0.75,
        centerDistance: i * 25,
        hovered: false,
        onSlotChange: () => {},
      });
    }
    expect(mobileScheduler.getActiveIds()).toHaveLength(4);
  });

  it("verifies scrypt password hashing and HMAC-SHA256 session token signing/tamper resistance", () => {
    const hashed = hashPassword("kinoframe-test-pass-2026");
    expect(hashed).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(verifyPassword("kinoframe-test-pass-2026", hashed)).toBe(true);
    expect(verifyPassword("wrong-password", hashed)).toBe(false);
    expect(verifyPassword("kinoframe-test-pass-2026", "corrupted-hash")).toBe(false);

    const token = createSessionToken({
      sub: "account:tester@kinoframe.local",
      provider: "account",
      name: "아카이브 테스터",
      email: "tester@kinoframe.local",
    });

    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe("account:tester@kinoframe.local");
    expect(verified?.provider).toBe("account");

    const [payload, sig] = token.split(".");
    const tampered = `${payload}.${sig.slice(0, -2)}AA`;
    expect(verifySessionToken(tampered)).toBeNull();
    expect(verifySessionToken("invalid.token.shape")).toBeNull();
  });

  it("enforces strict SSRF allowlist on media proxy hosts and blocks arbitrary or internal targets", () => {
    expect(
      isAllowedMediaProxyUrl(
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a8/test.jpg"
      )
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl(
        "https://upload.wikimedia.org/wikipedia/commons/e/e0/test.webm"
      )
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl("https://archive.org/download/Corvairi1960/Corvairi1960_512kb.mp4")
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl("https://ia801509.us.archive.org/12/items/test/video.mp4")
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl("https://images-assets.nasa.gov/image/as17-148-22727/as17-148-22727~thumb.jpg")
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl("https://i.ytimg.com/vi/M7FIvfx5J10/hqdefault.jpg")
    ).toBe(true);
    expect(
      isAllowedMediaProxyUrl("https://tile.loc.gov/image-services/iiif/service/default.jpg")
    ).toBe(true);

    expect(isAllowedMediaProxyUrl("http://127.0.0.1:3000/api/vault")).toBe(false);
    expect(isAllowedMediaProxyUrl("https://localhost/secret")).toBe(false);
    expect(isAllowedMediaProxyUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedMediaProxyUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedMediaProxyUrl("https://evil.example.com/steal.png")).toBe(false);
    expect(isAllowedMediaProxyUrl("https://archive.org.evil.com/x.mp4")).toBe(false);
    expect(isAllowedMediaProxyUrl("http://thumb.wikimedia.org/insecure.jpg")).toBe(false);
    expect(isAllowedMediaProxyUrl("file:///etc/passwd")).toBe(false);
  });

  it("validates conduit normalization, deduplication, SSRF media allowlist, and 429 circuit breaker", () => {
    const iaItem = normalizeInternetArchiveItem({
      identifier: "Midnight_VHS_Tape_1994",
      title: "Midnight_VHS_Computer_Graphics_1994.mp4",
      year: 1994,
      mp4FileName: "Midnight_VHS_Tape_1994_512kb.mp4",
      durationRaw: "1:25",
      category: "WEB_PHANTOM",
      countryHint: "US",
    });
    expect(iaItem).not.toBeNull();
    expect(iaItem?.id).toBe("KF-IA-Midnight_VHS_Tape_1994");
    expect(iaItem?.mediaSource).toBe("archive_mp4");
    expect(iaItem?.durationSec).toBe(85);
    expect(iaItem?.titleKo).toContain("1994");
    expect(iaItem?.titleKo).not.toContain("_");

    const wmItem = normalizeWikimediaItem({
      pageId: 98765432,
      title: "File:Tokyo_Shibuya_Night_Tram_1998.webm",
      descriptionUrl: "https://commons.wikimedia.org/wiki/File:Tokyo_Shibuya_Night_Tram_1998.webm",
      thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Tokyo.jpg/960px-Tokyo.jpg",
      videoUrl: "https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a1/Tokyo.webm/Tokyo.webm.480p.vp9.webm",
      width: 854,
      height: 480,
      durationSec: 22,
      category: "STREET_ERA",
    });
    expect(wmItem).not.toBeNull();
    expect(wmItem?.id).toBe("KF-WM-98765432");
    expect(wmItem?.country).toBe("JP");

    // SSRF / untrusted host must be rejected
    const evilWm = normalizeWikimediaItem({
      pageId: 11111,
      title: "File:Malicious.webm",
      descriptionUrl: "https://evil.example.com/file",
      thumbnailUrl: "https://evil.example.com/thumb.jpg",
      videoUrl: "https://evil.example.com/vid.webm",
      category: "WEB_PHANTOM",
    });
    expect(evilWm).toBeNull();
    expect(isAllowedMediaUrl("http://127.0.0.1/internal.mp4")).toBe(false);
    expect(isAllowedMediaUrl("https://upload.wikimedia.org/wikipedia/commons/x.webm")).toBe(true);

    // Deduplication removes duplicate IDs, sourceUrls, and videoUrls
    expect(iaItem && wmItem).toBeTruthy();
    const deduped = deduplicateConduitItems([iaItem!, { ...iaItem! }, wmItem!]);
    expect(deduped).toHaveLength(2);

    // Zero-cost Korean title cleaner removes underscores/extensions
    const cleaned = cleanKoreanTitle("File:Retro_VHS_Oscilloscope_1991.webm", 1991, "WEB_PHANTOM");
    expect(cleaned).not.toContain("_");
    expect(cleaned).not.toContain(".webm");

    // 429 / 403 Circuit Breaker trips and recovers after cooldown
    const breaker = new ConduitCircuitBreaker(5000);
    expect(breaker.isOpen("archive.org", 1000)).toBe(false);
    expect(breaker.trip("archive.org", 200, 1000)).toBe(false);
    expect(breaker.trip("archive.org", 429, 1000)).toBe(true);
    expect(breaker.isOpen("archive.org", 3000)).toBe(true);
    expect(breaker.isOpen("archive.org", 6001)).toBe(false);
  });

  it("preserves serverless ?board= URL serialization, round-trip parsing (including KF-IA-* & KF-WM-*), and markdown brief generation", () => {
    const conduitIaId = "KF-IA-Midnight_VHS_94";
    const conduitWmId = "KF-WM-98765432";
    expect(isValidArchiveItemId(ITEMS[0].id)).toBe(true);
    expect(isValidArchiveItemId(conduitIaId)).toBe(true);
    expect(isValidArchiveItemId(conduitWmId)).toBe(true);
    expect(isConduitItemId(conduitIaId)).toBe(true);
    expect(isConduitItemId(ITEMS[0].id)).toBe(false);

    const validIds = new Set([...ITEMS.map((i) => i.id), conduitIaId, conduitWmId]);
    const targetIds = [ITEMS[0].id, conduitIaId, conduitWmId, ITEMS[4].id, ITEMS[0].id, "INVALID-999"];
    const serialized = serializeBoardIds(targetIds);
    expect(serialized).toBe(`${ITEMS[0].id},${conduitIaId},${conduitWmId},${ITEMS[4].id}`);

    const restored = parseBoardIds(`${serialized},KF-999,malicious`, validIds);
    expect(restored).toEqual([ITEMS[0].id, conduitIaId, conduitWmId, ITEMS[4].id]);

    const md = generateMoodboardMarkdown(
      [ITEMS[0], ITEMS[4]],
      `https://kinoframe.example/?board=${serialized}`
    );
    expect(md).toContain(ITEMS[0].titleKo);
    expect(md).toContain(ITEMS[4].titleKo);
    expect(md).toContain(`?board=${serialized}`);
  });
});
