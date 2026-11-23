import type { ArchiveItem } from "@/types/archive";

// Hangul Unicode tables for universal Choseong & Romanization transliteration
const CHOSEONG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const CHOSEONG_ROMAN = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s",
  "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];
const JUNGSEONG_ROMAN = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa",
  "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
const JONGSEONG_ROMAN = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "p", "l",
  "t", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t",
];

// Bidirectional multilingual/phonetic synonym & thesaurus groups
const THESAURUS_GROUPS: readonly (readonly string[])[] = [
  // Film & Commercial titles + Directors + Brands (ko <-> en)
  ["라라랜드", "la la land", "lalaland", "다미엔 차젤레", "damien chazelle", "라이언 고슬링", "엠마 스톤"],
  ["기생충", "parasite", "봉준호", "bong joon ho", "bong joon-ho", "송강호"],
  ["그녀", "her", "스파이크 존즈", "spike jonze", "호아킨 피닉스", "joaquin phoenix"],
  ["올드보이", "oldboy", "박찬욱", "park chan wook", "park chan-wook", "최민식", "복도 원테이크"],
  ["화양연화", "in the mood for love", "왕가위", "wong kar wai", "wong kar-wai", "양조위", "장만옥"],
  ["중경삼림", "chungking express", "왕가위", "wong kar wai"],
  ["블레이드 러너", "blade runner", "bladerunner", "리들리 스콧", "ridley scott", "드니 빌뇌브", "denis villeneuve", "2049"],
  ["2001 스페이스 오디세이", "2001 a space odyssey", "스탠리 큐브릭", "큐브릭", "stanley kubrick", "kubrick"],
  ["샤이닝", "the shining", "shining", "스탠리 큐브릭", "큐브릭", "stanley kubrick"],
  ["배리 린든", "barry lyndon", "스탠리 큐브릭", "큐브릭", "stanley kubrick"],
  ["현기증", "vertigo", "알프레드 히치콕", "히치콕", "alfred hitchcock", "hitchcock"],
  ["석양의 무법자", "the good the bad and the ugly", "세르조 레오네", "sergio leone"],
  ["대부", "the godfather", "godfather", "프란시스 포드 코폴라", "코폴라", "francis ford coppola", "coppola"],
  ["지옥의 묵시록", "apocalypse now", "코폴라", "francis ford coppola"],
  ["택시 드라이버", "taxi driver", "마틴 스코세이지", "스코세이지", "martin scorsese", "scorsese"],
  ["좋은 친구들", "goodfellas", "마틴 스코세이지", "스코세이지", "martin scorsese", "코파카바나"],
  ["서스페리아", "suspiria", "다리오 아르젠토", "dario argento"],
  ["파리 텍사스", "paris texas", "빔 벤더스", "wim wenders"],
  ["펄프 픽션", "pulp fiction", "쿠엔틴 타란티노", "타란티노", "quentin tarantino", "tarantino"],
  ["히트", "heat", "마이클 만", "michael mann"],
  ["칠드런 오브 맨", "children of men", "알폰소 쿠아론", "alfonso cuaron"],
  ["그랜드 부다페스트 호텔", "grand budapest hotel", "웨스 앤더슨", "wes anderson"],
  ["1917", "샘 멘데스", "sam mendes", "로저 디킨스", "roger deakins"],
  ["듄", "dune", "dune part two", "드니 빌뇌브", "denis villeneuve"],
  ["문라이트", "moonlight", "배리 젠킨스", "barry jenkins"],
  ["영웅", "hero", "장이머우", "장예모", "zhang yimou", "크리스토퍼 도일", "christopher doyle"],
  // Brands & Commercials
  ["애플", "apple", "매킨토시", "macintosh", "아이팟", "ipod", "홈팟", "homepod", "리들리 스콧", "스파이크 존즈"],
  ["나이키", "nike", "풋볼", "football", "존 우", "john woo", "오우삼", "you cant stop us"],
  ["소니", "sony", "브라비아", "bravia", "bouncing balls"],
  ["코카콜라", "coca cola", "cocacola", "콜라", "hilltop"],
  ["리바이스", "levis", "levi's", "501", "laundrette", "odyssey", "조나단 글레이저", "jonathan glazer"],
  ["혼다", "honda", "어코드", "accord", "cog"],
  ["맥셀", "maxell", "blown away"],
  ["디올", "dior", "자도르", "jadore", "j'adore"],
  ["겐조", "kenzo", "kenzo world", "my mutant brain", "스파이크 존즈", "spike jonze"],
  ["올드 스파이스", "old spice", "oldspice"],
  ["볼보", "volvo", "volvo trucks", "epic split", "에픽 스플릿", "반담", "van damme"],
  ["jr 도카이", "jr tokai", "크리스마스 익스프레스", "christmas express"],
  // Cinematography & Visual Technique Thesaurus
  ["원테이크", "원 테이크", "롱테이크", "롱 테이크", "싱글 테이크", "long take", "longtake", "one take", "onetake", "oner", "single take", "원컨티뉴어스"],
  ["대칭", "대칭 구도", "좌우 대칭", "symmetry", "symmetrical", "1점 투시", "one point perspective", "perspective"],
  ["역광", "실루엣", "역광 실루엣", "backlight", "silhouette", "chiaroscuro", "키아로스쿠로", "느와르", "noir"],
  ["네온", "야경", "네온 컬러", "neon", "cyberpunk", "사이버펑크", "night"],
  ["골든아워", "골든 아워", "일출", "일몰", "노을", "golden hour", "goldenhour", "warm", "amber"],
  ["슬로우모션", "슬로우 모션", "슬로모션", "slow motion", "slowmo", "high speed"],
  ["매치컷", "매치 컷", "스플릿", "match cut", "matchcut", "split screen"],
  ["클로즈업", "초근접", "close up", "closeup", "ecu", "portrait"],
  ["트래킹", "달리", "tracking", "dolly", "steadicam", "스테디캠", "핸드헬드", "handheld"],
  ["영화", "시네마", "필름", "cinema", "classic_film", "film", "movie"],
  ["광고", "커머셜", "cf", "tvcf", "commercial", "ad", "brand film"],
];

/** Strip Latin diacritics while keeping Hangul syllables composed in NFC. */
function foldAccentsKeepHangul(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

/** Strip spaces, punctuation, and lowercase for tight matching ("lala land" === "La La Land"). */
export function normalizeCompact(input: string): string {
  return foldAccentsKeepHangul(input)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ㄱ-ㅎ]/g, "");
}

/** Tokenize preserving alphanumeric & Hangul words. */
export function normalizeTokens(input: string): string[] {
  return foldAccentsKeepHangul(input)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ㄱ-ㅎ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Extract Korean Choseong (초성) string from Hangul text ("라라랜드" -> "ㄹㄹㄹㄷ"). */
export function extractChoseong(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = Math.floor((code - 0xac00) / 588);
      out += CHOSEONG[idx] || "";
    } else if (code >= 0x3131 && code <= 0x314e) {
      out += input[i];
    }
  }
  return out;
}

/** Returns true if input consists strictly of Korean Choseong consonants (e.g. "ㄹㄹㄹㄷ", "ㄱㅅㅊ"). */
export function isChoseongQuery(input: string): boolean {
  const compact = input.replace(/\s+/g, "");
  return compact.length >= 2 && /^[ㄱ-ㅎ]+$/.test(compact);
}

/**
 * Universal Hangul -> simplified phonetic Latin romanization, and Latin phonetic canonicalization
 * (e.g. "라라랜드" -> "rararaendeu" ~ "lalaland" after l/r, p/f, b/v, vowel simplification).
 */
export function hangulToRoman(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const s = code - 0xac00;
      const cho = Math.floor(s / 588);
      const jung = Math.floor((s % 588) / 28);
      const jong = s % 28;
      out +=
        (CHOSEONG_ROMAN[cho] || "") +
        (JUNGSEONG_ROMAN[jung] || "") +
        (JONGSEONG_ROMAN[jong] || "");
    } else {
      out += input[i];
    }
  }
  return out;
}

/** Reduce Latin/romanized string to phonetic skeleton so Korean loanwords match English originals. */
export function toPhoneticSkeleton(input: string): string {
  const roman = foldAccentsKeepHangul(hangulToRoman(input))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!roman) return "";
  return roman
    .replace(/eu/g, "")
    .replace(/eo/g, "o")
    .replace(/ae|oe|we|wi|ui/g, "e")
    .replace(/oo|ou/g, "u")
    .replace(/ph/g, "p")
    .replace(/ck/g, "k")
    .replace(/ch/g, "c")
    .replace(/sh/g, "s")
    .replace(/th/g, "t")
    .replace(/[rl]/g, "l")
    .replace(/[fv]/g, "p")
    .replace(/[bp]/g, "p")
    .replace(/[dt]/g, "t")
    .replace(/[gkqc]/g, "k")
    .replace(/[jz]/g, "j")
    .replace(/([a-z])\1+/g, "$1");
}

/** Fast Damerau-Levenshtein distance <= 1 check (handles 1 insertion, deletion, substitution, or transposition). */
export function isWithinEditDistanceOne(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la < 4 || lb < 4) return false;

  if (la === lb) {
    let diffs = 0;
    for (let i = 0; i < la; i += 1) {
      if (a[i] !== b[i]) {
        // Adjacent transposition check (e.g. "parastie" <-> "parasite")
        if (
          diffs === 0 &&
          i + 1 < la &&
          a[i] === b[i + 1] &&
          a[i + 1] === b[i]
        ) {
          diffs += 1;
          i += 1;
          continue;
        }
        diffs += 1;
        if (diffs > 1) return false;
      }
    }
    return diffs <= 1;
  }

  // Insertion / deletion of 1 character
  const shorter = la < lb ? a : b;
  const longer = la < lb ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
    } else if (!skipped) {
      skipped = true;
      j += 1;
    } else {
      return false;
    }
  }
  return true;
}

/** Expand a query with matching thesaurus synonyms (ko <-> en <-> technique). */
function expandQueryVariants(rawQuery: string): {
  compactVariants: string[];
  phoneticVariants: string[];
  queryTokens: string[];
  choseongOnly: string | null;
} {
  const trimmed = rawQuery.trim();
  const compact = normalizeCompact(trimmed);
  const tokens = normalizeTokens(trimmed);
  const choseongOnly = isChoseongQuery(trimmed)
    ? trimmed.replace(/\s+/g, "")
    : null;

  const compactSet = new Set<string>();
  const phoneticSet = new Set<string>();
  if (compact) {
    compactSet.add(compact);
    const skel = toPhoneticSkeleton(trimmed);
    if (skel.length >= 3) phoneticSet.add(skel);
  }

  for (const group of THESAURUS_GROUPS) {
    const groupCompacts = group.map(normalizeCompact).filter(Boolean);
    const hit = groupCompacts.some(
      (gc) =>
        gc === compact ||
        (compact.length >= 3 && (gc.includes(compact) || compact.includes(gc))) ||
        tokens.some((tk) => tk.length >= 2 && gc === tk)
    );
    if (hit) {
      for (const gc of groupCompacts) {
        compactSet.add(gc);
        const sk = toPhoneticSkeleton(gc);
        if (sk.length >= 3) phoneticSet.add(sk);
      }
    }
  }

  return {
    compactVariants: Array.from(compactSet),
    phoneticVariants: Array.from(phoneticSet),
    queryTokens: tokens,
    choseongOnly,
  };
}

interface SearchIndexEntry {
  rawJoined: string;
  compactFull: string;
  compactFields: string[];
  tokens: string[];
  choseongFields: string[];
  phoneticFields: string[];
}

const INDEX_CACHE = new WeakMap<ArchiveItem, SearchIndexEntry>();

function getItemSearchIndex(item: ArchiveItem): SearchIndexEntry {
  const cached = INDEX_CACHE.get(item);
  if (cached) return cached;

  const fields = [
    item.titleKo,
    item.originalTitle,
    item.brandOrSource,
    String(item.year),
    item.era,
    item.category || "",
    item.aspectRatio,
    ...(item.aliases || []),
    ...(item.compositionTags || []),
    ...(item.persuasionTags || []),
    item.breakdown?.hook3s || item.breakdown?.hook || "",
    item.breakdown?.framing || item.breakdown?.camera || "",
    item.breakdown?.lighting || "",
    item.breakdown?.editing || "",
  ].filter(Boolean);

  const rawJoined = fields.join(" ");
  const compactFields = fields.map(normalizeCompact).filter(Boolean);
  const compactFull = compactFields.join(" ");
  const tokens = Array.from(new Set(normalizeTokens(rawJoined)));
  const choseongFields = fields.map(extractChoseong).filter(Boolean);
  const phoneticFields = Array.from(
    new Set(
      [...fields, ...tokens]
        .map(toPhoneticSkeleton)
        .filter((s) => s.length >= 3)
    )
  );

  const entry: SearchIndexEntry = {
    rawJoined,
    compactFull,
    compactFields,
    tokens,
    choseongFields,
    phoneticFields,
  };
  INDEX_CACHE.set(item, entry);
  return entry;
}

/**
 * Compute relevance score (> 0 means match, 0 means no match) for an ArchiveItem against a user query.
 * Supports:
 * - Space/punctuation-insensitive matching ("lala land" <-> "La La Land")
 * - Korean <-> English phonetic transliteration & Wikidata aliases ("라라랜드", "기생충", "큐브릭", "애플")
 * - Korean Choseong initials ("ㄹㄹㄹㄷ", "ㄱㅅㅊ")
 * - Cinematography technique thesaurus ("원테이크" <-> "long take")
 * - Single-character typo tolerance (Damerau-Levenshtein <= 1)
 */
export function scoreArchiveSearch(item: ArchiveItem, query: string): number {
  const trimmed = query.trim();
  if (!trimmed) return 1;

  const idx = getItemSearchIndex(item);
  const { compactVariants, phoneticVariants, queryTokens, choseongOnly } =
    expandQueryVariants(trimmed);
  const primaryCompact = normalizeCompact(trimmed);

  // 1. Choseong-only query ("ㄹㄹㄹㄷ", "ㄱㅅㅊ")
  if (choseongOnly) {
    for (const cf of idx.choseongFields) {
      if (cf === choseongOnly) return 100;
      if (cf.includes(choseongOnly)) return 85;
    }
    return 0;
  }

  // 2. Direct compact substring match against title/aliases/metadata ("lala land" -> "lalaland")
  if (primaryCompact) {
    for (let i = 0; i < idx.compactFields.length; i += 1) {
      const cf = idx.compactFields[i];
      if (cf === primaryCompact) return i < 3 ? 120 : 95;
      if (cf.includes(primaryCompact)) return i < 3 ? 105 : 80;
    }
  }

  // 3. Expanded thesaurus & alias match (e.g. "큐브릭" -> "stanleykubrick", "원테이크" -> "longtake")
  for (const cv of compactVariants) {
    if (cv === primaryCompact) continue;
    if (cv.length < 2) continue;
    if (idx.compactFull.includes(cv)) return 90;
  }

  // 4. Multi-token AND match (with per-token phonetic + typo <= 1 fallback)
  if (queryTokens.length > 0) {
    let matchedTokens = 0;
    for (const qt of queryTokens) {
      const qtCompact = normalizeCompact(qt);
      if (!qtCompact) continue;
      if (idx.compactFull.includes(qtCompact)) {
        matchedTokens += 1;
        continue;
      }
      // Check typo <= 1 against indexed tokens
      if (
        qtCompact.length >= 4 &&
        idx.tokens.some((tok) => isWithinEditDistanceOne(qtCompact, tok))
      ) {
        matchedTokens += 1;
        continue;
      }
      // Check phonetic skeleton match for Hangul <-> English loanword
      const qtPhon = toPhoneticSkeleton(qt);
      if (
        qtPhon.length >= 3 &&
        idx.phoneticFields.some(
          (pf) =>
            pf.includes(qtPhon) ||
            qtPhon.includes(pf) ||
            isWithinEditDistanceOne(qtPhon, pf)
        )
      ) {
        matchedTokens += 1;
        continue;
      }
    }
    if (matchedTokens === queryTokens.length) {
      return 75;
    }
  }

  // 5. Whole-query phonetic transliteration or single-char typo match
  for (const pv of phoneticVariants) {
    if (pv.length < 4) continue;
    for (const pf of idx.phoneticFields) {
      if (pf.includes(pv) || (pf.length >= 4 && isWithinEditDistanceOne(pv, pf))) {
        return 65;
      }
    }
  }

  if (
    primaryCompact.length >= 4 &&
    idx.compactFields.some((cf) => isWithinEditDistanceOne(primaryCompact, cf))
  ) {
    return 60;
  }

  return 0;
}

export function matchesArchiveQuery(item: ArchiveItem, query: string): boolean {
  return scoreArchiveSearch(item, query) > 0;
}

export function searchArchiveItems(
  items: readonly ArchiveItem[],
  query: string
): ArchiveItem[] {
  const trimmed = query.trim();
  if (!trimmed) return [...items];

  const scored: Array<{ item: ArchiveItem; score: number }> = [];
  for (const item of items) {
    const score = scoreArchiveSearch(item, trimmed);
    if (score > 0) {
      scored.push({ item, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.item);
}
