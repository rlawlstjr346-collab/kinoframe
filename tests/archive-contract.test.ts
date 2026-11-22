import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import archiveSnapshot from "@/data/archive-snapshot.json";
import type { ArchiveCategory, ArchiveItem, CountryCode } from "@/types/archive";
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
  BLOCKED_CONTENT_REGEX,
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

const PURGED_LOW_TASTE_IDS = [
  "KF-199",
  "KF-244",
  "KF-249",
  "KF-297",
  "KF-357",
  "KF-367",
  "KF-398",
  "KF-399",
  "KF-404",
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

describe("KINOFRAME V6.1 90%+ Moving Wall, Zero-Tear Masonry, Video-Only Conduit & Scheduler Contract", () => {
  it("verifies zero legacy one-off curate-v* scripts remain in scripts/", () => {
    const scriptsDir = path.resolve(process.cwd(), "scripts");
    const files = fs.readdirSync(scriptsDir);
    const legacyCrawlers = files.filter((f) => /^curate-v/i.test(f));
    expect(legacyCrawlers).toEqual([]);
    expect(files).toContain("verify-links.mjs");
    expect(files).toContain("auto-discover-archive.mjs");
  });

  it("achieves 90%+ direct-link archive_mp4 moving wall (>= 240 mp4, <= 25 stills, 0 youtube_embed) and purges hardware/stamps/docs", () => {
    const byCategory = new Map<ArchiveCategory, number>();
    const byCountry = new Map<CountryCode, number>();
    const mp4ByCategory = new Map<ArchiveCategory, number>();
    let totalAutoLoopMp4 = 0;
    let totalStillImages = 0;
    let totalYoutube = 0;

    for (const item of ITEMS) {
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

    // Core V6.1 90%+ pure moving wall contract
    expect(totalAutoLoopMp4).toBeGreaterThanOrEqual(240);
    expect(totalStillImages).toBeLessThanOrEqual(25);
    expect(totalYoutube).toBe(0);
    expect(totalAutoLoopMp4 / ITEMS.length).toBeGreaterThanOrEqual(0.9);

    // Internal 8-category taxonomy intact
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

    expect(mp4ByCategory.get("STREET_ERA") ?? 0).toBeGreaterThanOrEqual(70);
    expect(mp4ByCategory.get("TVCF") ?? 0).toBeGreaterThanOrEqual(55);
    expect(mp4ByCategory.get("CLASSIC_FILM") ?? 0).toBeGreaterThanOrEqual(50);
    expect(mp4ByCategory.get("ANIME_COMIC") ?? 0).toBeGreaterThanOrEqual(24);
    expect(mp4ByCategory.get("WEB_PHANTOM") ?? 0).toBeGreaterThanOrEqual(24);

    // Purged low-taste hardware/stamp/matchbox IDs must be completely absent
    const idSet = new Set(ITEMS.map((i) => i.id));
    for (const purgedId of PURGED_LOW_TASTE_IDS) {
      expect(idSet.has(purgedId)).toBe(false);
    }
    expect(idSet.size).toBe(ITEMS.length);
  });

  it("verifies >= 16 distinct global cities inside STREET_ERA and zero duplicate source stems", () => {
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
      } else {
        expect(item.mediaSource).toBe("still_image");
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

      expect(item.compositionTags.length).toBeGreaterThanOrEqual(1);
      expect(item.persuasionTags.length).toBeGreaterThanOrEqual(1);
      for (const c of item.compositionTags) {
        expect(COMPOSITION_TAGS).toContain(c);
      }
      for (const p of item.persuasionTags) {
        expect(PERSUASION_TAGS).toContain(p);
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

  it("guarantees >= 42/48 (87.5%+) auto-loop archive_mp4 on default sort and across 20 random seeds", () => {
    const defaultSorted = filterAndSortArchive(ITEMS, DEFAULT_FILTER_STATE);
    expect(defaultSorted).toHaveLength(ITEMS.length);

    const top24 = defaultSorted.slice(0, 24);
    const top48 = defaultSorted.slice(0, 48);
    expect(
      top24.filter((i) => i.mediaSource === "archive_mp4").length
    ).toBeGreaterThanOrEqual(21);
    expect(
      top48.filter((i) => i.mediaSource === "archive_mp4").length
    ).toBeGreaterThanOrEqual(42);

    const top16 = defaultSorted.slice(0, 16);
    expect(top16.filter((i) => isChromaticItem(i)).length).toBeGreaterThanOrEqual(11);

    const seeds = [
      7, 19, 42, 101, 256, 512, 777, 1024, 2026, 3333,
      4815, 6174, 7919, 9091, 12345, 31415, 54321, 77777, 99991, 271828,
    ];
    const topSignatures = new Set<string>();

    for (const seed of seeds) {
      const rotated = rotateArchiveWithSeed(defaultSorted, seed);
      expect(rotated).toHaveLength(ITEMS.length);
      expect(new Set(rotated.map((i) => i.id)).size).toBe(ITEMS.length);

      const rotTop48Mp4 = rotated
        .slice(0, 48)
        .filter((i) => i.mediaSource === "archive_mp4").length;

      expect(rotTop48Mp4).toBeGreaterThanOrEqual(42);
      topSignatures.add(rotated.slice(0, 12).map((i) => i.id).join(","));
    }

    expect(topSignatures.size).toBeGreaterThanOrEqual(18);
  });

  it("enforces global video concurrency cap (desktop 18 / mobile 6), hysteresis retention, and instant hover promotion", () => {
    const defaultScheduler = new VideoPlaybackScheduler();
    expect(defaultScheduler.getMaxConcurrentSlots()).toBe(18);

    const desktopScheduler = new VideoPlaybackScheduler(18);
    const states = new Map<string, boolean>();

    for (let i = 1; i <= 24; i += 1) {
      const id = `KF-${String(i).padStart(3, "0")}`;
      desktopScheduler.register({
        id,
        ratio: 0.7,
        centerDistance: i * 35,
        hovered: false,
        onSlotChange: (allowed) => states.set(id, allowed),
      });
    }

    expect(desktopScheduler.getActiveIds()).toHaveLength(18);
    expect(states.get("KF-001")).toBe(true);
    expect(states.get("KF-018")).toBe(true);
    expect(states.get("KF-024")).toBe(false);

    // Hysteresis: minor centerDistance shift on inactive KF-019 must NOT evict active KF-018
    desktopScheduler.update("KF-019", { ratio: 0.72, centerDistance: 500 });
    expect(states.get("KF-018")).toBe(true);
    expect(states.get("KF-019")).toBe(false);

    // Hovering KF-024 promotes it immediately while staying capped at 18
    desktopScheduler.update("KF-024", { hovered: true });
    expect(desktopScheduler.getActiveIds()).toHaveLength(18);
    expect(states.get("KF-024")).toBe(true);

    // Mobile cap = 6
    const mobileScheduler = new VideoPlaybackScheduler(6);
    for (let i = 1; i <= 12; i += 1) {
      mobileScheduler.register({
        id: `M-${i}`,
        ratio: 0.75,
        centerDistance: i * 25,
        hovered: false,
        onSlotChange: () => {},
      });
    }
    expect(mobileScheduler.getActiveIds()).toHaveLength(6);
  });

  it("validates video-only conduit normalization, hardware/afips/stamp/doc blocking, SSRF allowlist, and 429 circuit breaker", () => {
    const iaItem = normalizeInternetArchiveItem({
      identifier: "Midnight_VHS_Tape_1994",
      title: "Midnight_VHS_Neon_Street_1994.mp4",
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
    expect(iaItem?.titleKo).not.toContain("_");

    const wmVideo = normalizeWikimediaItem({
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
    expect(wmVideo).not.toBeNull();
    expect(wmVideo?.id).toBe("KF-WM-98765432");
    expect(wmVideo?.mediaSource).toBe("archive_mp4");

    // Conduit must reject still-only Wikimedia items (video-only policy)
    const wmStillRejected = normalizeWikimediaItem({
      pageId: 55555,
      title: "File:Static_Postage_Photo.jpg",
      descriptionUrl: "https://commons.wikimedia.org/wiki/File:Static_Postage_Photo.jpg",
      thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Static.jpg",
      videoUrl: null,
      category: "PHOTO",
    });
    expect(wmStillRejected).toBeNull();

    // Hardware, flip phones, stamps, AFIPS conference flyers, manuals, and books are 100% blocked
    const forbiddenTitles = [
      "AFIPS Fall Joint Computer Conference Flyer 1968",
      "Nintendo Famicom Game Boy Console Hardware",
      "Nokia Flip Phone Smartphone Unboxing Review",
      "1964 Tokyo Postage Stamp & Matchbox Brochure",
      "Vintage Textbook Manuscript Diagram Manual",
    ];
    for (const badTitle of forbiddenTitles) {
      expect(BLOCKED_CONTENT_REGEX.test(badTitle)).toBe(true);
      expect(
        normalizeInternetArchiveItem({
          identifier: "test_item_1",
          title: badTitle,
          year: 1990,
          mp4FileName: "clip_512kb.mp4",
          category: "WEB_PHANTOM",
        })
      ).toBeNull();
    }

    // SSRF / untrusted host must be rejected
    expect(isAllowedMediaUrl("http://127.0.0.1/internal.mp4")).toBe(false);
    expect(isAllowedMediaUrl("https://upload.wikimedia.org/wikipedia/commons/x.webm")).toBe(true);

    // Deduplication removes duplicate IDs, sourceUrls, and videoUrls
    const deduped = deduplicateConduitItems([iaItem!, { ...iaItem! }, wmVideo!]);
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
    expect(isAllowedMediaProxyUrl("http://127.0.0.1:3000/api/vault")).toBe(false);
    expect(isAllowedMediaProxyUrl("https://localhost/secret")).toBe(false);
    expect(isAllowedMediaProxyUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedMediaProxyUrl("https://evil.example.com/steal.png")).toBe(false);
    expect(isAllowedMediaProxyUrl("file:///etc/passwd")).toBe(false);
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
