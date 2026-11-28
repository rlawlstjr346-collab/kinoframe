import type { ArchiveItem } from "@/types/archive";
import { resolveItemCategory } from "@/lib/taxonomy";
import { matchesArchiveQuery } from "@/lib/search";

export const DEFAULT_SITE_URL = "https://kinoframe.vercel.app";
export const INDEXNOW_KEY = "51e58ede71e681c9ceef985dc0c9a62d";

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return DEFAULT_SITE_URL;
  return raw.replace(/\/+$/, "");
}

export interface SeoTopicDefinition {
  slug: string;
  labelKo: string;
  labelEn: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lead: string;
  keywords: string[];
  match: (item: ArchiveItem) => boolean;
}

export const SEO_TOPICS: readonly SeoTopicDefinition[] = [
  {
    slug: "tvcf-reference",
    labelKo: "광고 레퍼런스 · TVCF 연출",
    labelEn: "TVCF & Commercial Directing Reference",
    metaTitle: "광고 레퍼런스 사이트 · TVCF 연출 모음 (Commercial Visual Reference)",
    metaDescription:
      "글로벌 아이코닉 TVCF와 브랜드 필름 연출 레퍼런스를 고화질 무빙 루프로 탐색하세요. 애플·나이키·소니·볼보·디올·리바이스 등 CF 콘티와 초반 3초 훅 모음.",
    h1: "광고 레퍼런스 사이트 · TVCF 연출 모음",
    lead: "애플, 나이키, 소니 브라비아, 볼보, 디올, 리바이스 등 시대별 글로벌 명작 TVCF의 초반 3초 훅과 카메라 연출을 고화질 무빙 루프로 바로 비교하고 캡처하세요.",
    keywords: [
      "광고 레퍼런스 사이트",
      "TVCF 레퍼런스",
      "CF 콘티 레퍼런스",
      "브랜드 필름 레퍼런스",
      "commercial visual reference",
      "advertising directing archive",
    ],
    match: (item) => resolveItemCategory(item) === "TVCF",
  },
  {
    slug: "cinema-composition",
    labelKo: "영화 연출 구도 · 미장센",
    labelEn: "Cinema Composition & Mise-en-scène Archive",
    metaTitle: "영화 연출 구도 · 미장센 레퍼런스 아카이브 (Cinema Composition Reference)",
    metaDescription:
      "기생충·올드보이·라라랜드·블레이드 러너·그랜드 부다페스트 호텔 등 거장 감독의 1점 투시, 대칭 구도, 프레임 속 프레임 미장센을 5초 무빙 루프로 연구하세요.",
    h1: "영화 연출 구도 · 미장센 레퍼런스 아카이브",
    lead: "봉준호, 박찬욱, 스탠리 큐브릭, 왕가위, 드니 빌뇌브, 웨스 앤더슨의 1점 투시·대칭 구도·역광 실루엣 미장센을 5초 무빙 컷으로 탐색하세요.",
    keywords: [
      "영화 연출 구도",
      "영화 미장센 아카이브",
      "1점 투시 구도",
      "대칭 구도 레퍼런스",
      "cinema composition reference",
      "film cinematography archive",
    ],
    match: (item) => resolveItemCategory(item) === "CLASSIC_FILM",
  },
  {
    slug: "one-take",
    labelKo: "원테이크 · 롱테이크 레퍼런스",
    labelEn: "One-Take & Long Take Reference",
    metaTitle: "원테이크 · 롱테이크 영화·광고 레퍼런스 (One-Take & Long Take Archive)",
    metaDescription:
      "올드보이 복도, 1917, 칠드런 오브 맨, 좋은 친구들 코파카바나, 혼다 어코드 Cog, 볼보 에픽 스플릿 등 컷 전환 없는 원테이크·롱테이크 명장면 레퍼런스 모음.",
    h1: "원테이크 · 롱테이크 영화·광고 레퍼런스",
    lead: "컷 없이 카메라 동선과 공간 설계만으로 몰입감을 극대화한 영화·TVCF 원테이크 및 롱테이크 시퀀스를 무편집 루프로 분석하세요.",
    keywords: [
      "원테이크 샷",
      "롱테이크 레퍼런스",
      "스테디캠 트래킹 샷",
      "원테이크 광고",
      "one take film reference",
      "long take cinematography",
    ],
    match: (item) => {
      const text = [
        item.titleKo,
        item.originalTitle,
        item.breakdown?.hook3s,
        item.breakdown?.hook,
        item.breakdown?.framing,
        item.breakdown?.camera,
        item.breakdown?.editing,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        /(원테이크|롱테이크|원컨티뉴어스|싱글\s*테이크|무편집|one[\s-]*take|long[\s-]*take|oner|cog|epic split|oldboy|1917|goodfellas|children of men)/i.test(
          text
        ) || matchesArchiveQuery(item, "원테이크")
      );
    },
  },
  {
    slug: "color-grading",
    labelKo: "시네마틱 색감 · 컬러 팔레트",
    labelEn: "Cinematic Color Grading & Film Palette",
    metaTitle: "시네마틱 색감 · 필름 컬러 팔레트 레퍼런스 (Cinematic Color Grading)",
    metaDescription:
      "화양연화·라라랜드·그녀·블레이드 러너 2049·영웅·서스페리아 등 실제 프레임에서 추출한 5색 시네마틱 컬러 팔레트와 네온·골든아워 색보정 레퍼런스.",
    h1: "시네마틱 색감 · 필름 컬러 팔레트 레퍼런스",
    lead: "네온 느와르, 골든아워, 테크니컬러, 파스텔 보케까지 — 거장 촬영감독의 조명과 실제 프레임 픽셀 컬러 팔레트를 바로 참고하세요.",
    keywords: [
      "시네마틱 색감 아카이브",
      "필름 컬러 팔레트",
      "영화 색보정 레퍼런스",
      "컬러 그레이딩 참고",
      "cinematic color grading reference",
      "film color palette archive",
    ],
    match: (item) =>
      Array.isArray(item.palette) &&
      item.palette.length >= 5 &&
      (resolveItemCategory(item) === "CLASSIC_FILM" ||
        item.year >= 2000 ||
        matchesArchiveQuery(item, "네온") ||
        matchesArchiveQuery(item, "골든아워")),
  },
  {
    slug: "vintage-commercial",
    labelKo: "70s·80s·90s 빈티지 광고 · 레트로 CF",
    labelEn: "70s, 80s & 90s Vintage TV Commercials",
    metaTitle: "70s·80s·90s 빈티지 광고 · 레트로 CF 모음 (Vintage TVCF Archive)",
    metaDescription:
      "코카콜라 Hilltop(1971), 애플 매킨토시 1984, 리바이스 501, 맥셀 Blown Away, JR 도카이 크리스마스 익스프레스 등 1970~90년대 전설의 빈티지 TVCF 아카이브.",
    h1: "70s·80s·90s 빈티지 광고 · 레트로 CF 모음",
    lead: "아날로그 필름 질감과 대담한 아트 디렉션이 살아 있는 1970년대~2000년대 초반 글로벌 빈티지 TVCF 명작을 복원 화질로 감상하세요.",
    keywords: [
      "빈티지 광고",
      "레트로 CF 모음",
      "80년대 광고 레퍼런스",
      "90년대 TVCF",
      "vintage commercial archive",
      "retro tvcf reference",
    ],
    match: (item) =>
      resolveItemCategory(item) === "TVCF" &&
      (item.year <= 2004 || item.isArchivalSd === true),
  },
  {
    slug: "visual-hook",
    labelKo: "초반 3초 훅 · 시선 강탈 연출",
    labelEn: "3-Second Visual Hook & Attention Framing",
    metaTitle: "초반 3초 훅 · 시선 강탈 영상 연출 레퍼런스 (Visual Hook Reference)",
    metaDescription:
      "광고·쇼츠·브랜드 필름의 초반 3초 시선 강탈 연출과 무대사 직관 전달, 스케일 반전, 매치 컷 레퍼런스를 실제 무빙 루프로 바로 확인하세요.",
    h1: "초반 3초 훅 · 시선 강탈 영상 연출 레퍼런스",
    lead: "대사나 자막 없이 첫 프레임의 시각적 은유·스케일 반전·매치 컷만으로 시선을 사로잡는 광고 및 영화 훅(Hook) 레퍼런스를 모았습니다.",
    keywords: [
      "초반 3초 훅",
      "시선 강탈 영상 연출",
      "매치 컷 레퍼런스",
      "무대사 광고 연출",
      "visual hook commercial reference",
      "3 second hook video directing",
    ],
    match: (item) =>
      item.persuasionTags?.some(
        (tag) =>
          tag === "초반 3초 시선 강탈" ||
          tag === "무대사 직관 전달" ||
          tag === "스케일 반전"
      ) ||
      item.compositionTags?.some(
        (tag) => tag === "매치 컷" || tag === "기하학 조형" || tag === "1점 투시"
      ) ||
      resolveItemCategory(item) === "TVCF",
  },
];

export function getSeoTopicBySlug(slug: string): SeoTopicDefinition | undefined {
  return SEO_TOPICS.find((t) => t.slug === slug);
}

export function filterItemsBySeoTopic(
  items: readonly ArchiveItem[],
  topic: SeoTopicDefinition
): ArchiveItem[] {
  const matched = items.filter((item) => topic.match(item));
  return matched.length > 0 ? matched : [...items].slice(0, 24);
}

/** Server-safe clean title & sub-caption formatter (avoids importing from "use client" modules). */
export function formatSeoItemMeta(item: ArchiveItem): {
  primaryTitle: string;
  subCaption: string;
} {
  let primary = (item.titleKo || item.originalTitle || "").trim();
  primary = primary.replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim();
  const parenMatch = primary.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (parenMatch) {
    const left = parenMatch[1].trim();
    const inside = parenMatch[2].trim();
    if (/[가-힣]/.test(left) && /[A-Za-z]/.test(inside)) {
      primary = left;
    }
  }
  primary = primary.replace(/\s*·\s*$/, "").trim();

  let origWork = (item.originalTitle || "").trim();
  let extractedCredit = "";
  const origCreditMatch = origWork.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (origCreditMatch) {
    origWork = origCreditMatch[1].trim();
    const creditParts = origCreditMatch[2]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !/^(?:19|20)\d{2}$/.test(s));
    if (creditParts.length > 0) {
      extractedCredit = creditParts.join(", ");
    }
  }

  const credit = (extractedCredit || item.brandOrSource || "")
    .replace(/\s*\((?:19|20)\d{2}\)\s*$/, "")
    .trim();

  const parts: string[] = [];
  if (origWork && origWork.toLowerCase() !== primary.toLowerCase()) {
    parts.push(origWork);
  }
  if (item.year) {
    parts.push(String(item.year));
  }
  if (
    credit &&
    !parts.some((p) => p.toLowerCase().includes(credit.toLowerCase()))
  ) {
    parts.push(credit);
  }

  return {
    primaryTitle: primary || item.originalTitle,
    subCaption: parts.join(" · "),
  };
}

export function resolveSeoSourceUrl(item: ArchiveItem): string {
  const raw = (item.sourceUrl || "").trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" || u.protocol === "http:") {
        return u.toString();
      }
    } catch {
      // fall through
    }
  }
  const q = `${item.originalTitle || item.titleKo} ${item.year || ""}`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}
