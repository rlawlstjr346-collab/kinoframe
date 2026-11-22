import type { ArchiveItem } from "@/types/archive";
import { analyzePaletteChroma, resolveItemCategory, resolveItemCountry } from "@/lib/taxonomy";

export interface VisualTechnique {
  slug: string;
  label: string;
  labelKo: string;
  descriptionKo: string;
  conduitQuery: string;
  keywords: string[];
}

export const VISUAL_TECHNIQUES: VisualTechnique[] = [
  {
    slug: "symmetry",
    label: "SYMMETRY",
    labelKo: "대칭 구도",
    descriptionKo: "중앙 소실점과 좌우 균형 축으로 강렬한 그래픽 질서를 구축하는 시네마틱 프레이밍.",
    conduitQuery: "symmetry architecture corridor street",
    keywords: ["symmetry", "대칭", "중앙", "corridor", "metro", "bridge", "arch"],
  },
  {
    slug: "neon-noir",
    label: "NEON NOIR",
    labelKo: "네온 누아르",
    descriptionKo: "어두운 밤거리 위 네온 간판과 강렬한 색 대비가 어우러진 도시 야경 시퀀스.",
    conduitQuery: "neon night city street glow",
    keywords: ["neon", "night", "noir", "네온", "야경", "심야", "누아르", "kabukicho", "shibuya", "hong kong"],
  },
  {
    slug: "fast-cut",
    label: "FAST CUT",
    labelKo: "패스트 컷",
    descriptionKo: "짧은 러닝타임 안에 리드미컬한 컷 전환으로 시선을 압도하는 몽타주·커머셜 편집.",
    conduitQuery: "fast cut commercial montage trailer",
    keywords: ["fast", "cut", "quick", "spot", "trailer", "패스트", "컷", "편집", "예고편"],
  },
  {
    slug: "tracking-shot",
    label: "TRACKING SHOT",
    labelKo: "트래킹 샷",
    descriptionKo: "트램·열차·차량과 함께 이동하며 공간의 깊이와 속도감을 담아내는 주행 카메라워크.",
    conduitQuery: "tram streetcar train driving tracking city",
    keywords: ["tracking", "tram", "streetcar", "cable car", "train", "bus", "drive", "walk", "트램", "주행", "열차", "거리"],
  },
  {
    slug: "35mm-grain",
    label: "35MM GRAIN",
    labelKo: "35mm 필름 그레인",
    descriptionKo: "아날로그 셀룰로이드 원판 특유의 입자감과 유기적 톤 커브가 살아 있는 필름 아카이브.",
    conduitQuery: "35mm vintage film grain cinema",
    keywords: ["35mm", "grain", "film", "kodachrome", "필름", "그레인", "원판", "셀룰로이드"],
  },
  {
    slug: "commercial-hook",
    label: "COMMERCIAL HOOK",
    labelKo: "3초 광고 훅",
    descriptionKo: "초반 3초 내 제품 실루엣과 시각적 위트로 시청자를 붙잡는 빈티지 광고 연출.",
    conduitQuery: "vintage television commercial spot",
    keywords: ["commercial", "tvcf", "ad", "hook", "광고", "커머셜", "브랜드", "스팟"],
  },
  {
    slug: "close-up",
    label: "CLOSE UP",
    labelKo: "클로즈업",
    descriptionKo: "피사체의 표정·질감·디테일을 화면 가득 채워 심리적 밀도를 높이는 근접 프레이밍.",
    conduitQuery: "close up portrait cinema face detail",
    keywords: ["close", "closeup", "face", "portrait", "eye", "클로즈업", "근접", "인물"],
  },
  {
    slug: "wide-anamorphic",
    label: "WIDE ANAMORPHIC",
    labelKo: "와이드 아나모픽",
    descriptionKo: "광활한 수평 스케일과 16:9·2.39:1 시네마스코프 비례로 공간을 압도하는 와이드 샷.",
    conduitQuery: "wide panoramic city skyline highway",
    keywords: ["wide", "anamorphic", "panorama", "skyline", "와이드", "파노라마", "광각", "시네마스코프"],
  },
  {
    slug: "silhouette",
    label: "SILHOUETTE",
    labelKo: "역광 실루엣",
    descriptionKo: "강한 역광과 암부 대비로 피사체의 윤곽만 날카롭게 추출하는 극적 조명 기법.",
    conduitQuery: "silhouette backlight shadow dusk night",
    keywords: ["silhouette", "shadow", "backlight", "실루엣", "역광", "그림자"],
  },
  {
    slug: "chiaroscuro",
    label: "CHIAROSCURO",
    labelKo: "키아로스쿠로",
    descriptionKo: "깊은 어둠과 한 줄기 하이라이트의 극단적 명암비로 긴장감을 조각하는 고전 조명.",
    conduitQuery: "film noir chiaroscuro dramatic shadow",
    keywords: ["chiaroscuro", "noir", "contrast", "dark", "shadow", "명암", "누아르", "대비"],
  },
  {
    slug: "montage",
    label: "MONTAGE",
    labelKo: "몽타주",
    descriptionKo: "서로 다른 시공간과 이미지를 충돌·연결해 새로운 의미를 만들어내는 시퀀스 편집.",
    conduitQuery: "montage trailer newsreel cinema sequence",
    keywords: ["montage", "sequence", "trailer", "reel", "몽타주", "시퀀스", "뉴스릴"],
  },
  {
    slug: "retro-tvcf",
    label: "RETRO TVCF",
    labelKo: "레트로 TV광고",
    descriptionKo: "1950–90년대 미국·일본·유럽 황금기 텔레비전 커머셜의 대담한 연출과 타이포그래피.",
    conduitQuery: "retro television commercial 1960s 1970s 1980s",
    keywords: ["retro", "tvcf", "commercial", "chevrolet", "pepsi", "ford", "코카콜라", "빈티지 광고", "레트로"],
  },
  {
    slug: "low-angle",
    label: "LOW ANGLE",
    labelKo: "로우 앵글",
    descriptionKo: "낮은 시선에서 올려다보며 건축·인물·로켓의 웅장한 스케일을 극대화하는 앵글.",
    conduitQuery: "low angle skyscraper rocket monument tower",
    keywords: ["low angle", "rocket", "launch", "tower", "skyscraper", "로우", "발사", "빌딩"],
  },
  {
    slug: "aerial",
    label: "AERIAL",
    labelKo: "항공·버즈아이",
    descriptionKo: "상공과 궤도에서 도시·해안·지구를 내려다보며 기하학적 패턴을 포착하는 부감 시선.",
    conduitQuery: "aerial flight skyline earth space helicopter",
    keywords: ["aerial", "flight", "earth", "space", "apollo", "sky", "항공", "우주", "지구", "비행"],
  },
  {
    slug: "dutch-angle",
    label: "DUTCH ANGLE",
    labelKo: "더치 앵글",
    descriptionKo: "수평선을 의도적으로 기울여 불안감·역동성·초현실적 에너지를 주입하는 카메라 틸트.",
    conduitQuery: "dutch angle thriller horror noir action",
    keywords: ["dutch", "tilt", "horror", "thriller", "suspense", "더치", "호러", "스릴러", "서스펜스"],
  },
  {
    slug: "slow-motion",
    label: "SLOW MOTION",
    labelKo: "슬로우 모션",
    descriptionKo: "시간의 밀도를 늘려 연기·불꽃·움직임의 미세한 궤적을 조각처럼 드러내는 연출.",
    conduitQuery: "slow motion launch ocean waves dance",
    keywords: ["slow", "motion", "space", "launch", "water", "슬로우", "움직임", "궤적"],
  },
  {
    slug: "warm-tungsten",
    label: "WARM TUNGSTEN",
    labelKo: "웜 텅스텐",
    descriptionKo: "호박빛 텅스텐 조명과 테크니컬러 난색 팔레트로 감성적 온도를 높이는 색채 연출.",
    conduitQuery: "technicolor warm sunset amber tungsten vintage",
    keywords: ["warm", "tungsten", "technicolor", "gold", "amber", "테크니컬러", "난색", "텅스텐"],
  },
  {
    slug: "vintage-film",
    label: "VINTAGE FILM",
    labelKo: "고전 영화",
    descriptionKo: "할리우드·유럽·아시아 고전 시네마와 극장 예고편에서 추출한 시대를 초월한 미장센.",
    conduitQuery: "classic cinema movie trailer vintage film",
    keywords: ["vintage", "classic", "cinema", "movie", "film", "고전", "영화", "시네마"],
  },
  {
    slug: "animation-cell",
    label: "ANIMATION CELL",
    labelKo: "셀 애니메이션",
    descriptionKo: "수작업 잉크·페인트 셀과 과장된 스쿼시 앤 스트레치 리듬이 빛나는 고전 애니메이션.",
    conduitQuery: "classic cartoon cel animation retro",
    keywords: ["animation", "cartoon", "anime", "cel", "fleischer", "popeye", "superman", "애니", "만화", "셀"],
  },
  {
    slug: "title-design",
    label: "TITLE DESIGN",
    labelKo: "타이틀 디자인",
    descriptionKo: "오프닝 시퀀스·예고편 카피·그래픽 리더가 화면과 일체화되는 키네틱 타이틀 연출.",
    conduitQuery: "movie trailer title sequence graphic leader",
    keywords: ["title", "trailer", "leader", "graphic", "타이틀", "예고편", "그래픽"],
  },
  {
    slug: "urban-night",
    label: "URBAN NIGHT",
    labelKo: "도시 야경",
    descriptionKo: "도쿄·서울·홍콩·뉴욕·파리의 밤거리 불빛과 군중의 흐름을 담은 시티 스케이프.",
    conduitQuery: "urban night street city lights tokyo new york",
    keywords: ["urban", "night", "tokyo", "seoul", "hong kong", "taipei", "shinjuku", "shibuya", "도시", "야경", "밤거리"],
  },
  {
    slug: "product-shot",
    label: "PRODUCT SHOT",
    labelKo: "프로덕트 샷",
    descriptionKo: "자동차·음료·오브제를 완벽한 조명과 반사로 조각하는 하이엔드 커머셜 컷.",
    conduitQuery: "car commercial showroom product vintage ad",
    keywords: ["product", "car", "chevrolet", "ford", "drink", "coffee", "제품", "쇼룸", "자동차"],
  },
  {
    slug: "archival-still",
    label: "ARCHIVAL STILL",
    labelKo: "아카이브 스틸",
    descriptionKo: "큐브릭·NASA·동아시아 야경 등 단 한 장으로 서사를 완결하는 초고밀도 스틸 프레임.",
    conduitQuery: "cinematic photography archival frame street",
    keywords: ["still", "photo", "kubrick", "nasa", "사진", "스틸", "프레임"],
  },
  {
    slug: "vhs-analog",
    label: "VHS ANALOG",
    labelKo: "VHS 아날로그",
    descriptionKo: "심야 브라운관 노이즈·자기 테이프 주사선·잊힌 캠코더 유물이 빚는 인터넷 망령 미학.",
    conduitQuery: "vhs analog crt tape camcorder retro",
    keywords: ["vhs", "analog", "crt", "oscilloscope", "camcorder", "tape", "망령", "테이프", "아날로그", "캠코더"],
  },
  {
    slug: "split-frame",
    label: "SPLIT FRAME",
    labelKo: "프레임 속 프레임",
    descriptionKo: "창틀·문·아치·거울로 화면을 이중 분할해 시선을 중심 피사체로 가두는 구도.",
    conduitQuery: "frame within frame window doorway mirror cinema",
    keywords: ["split", "frame", "window", "door", "mirror", "프레임", "분할", "창문"],
  },
  {
    slug: "deep-focus",
    label: "DEEP FOCUS",
    labelKo: "딥 포커스",
    descriptionKo: "전경부터 원경 소실점까지 또렷하게 열어 도시와 군중의 레이어를 동시에 읽게 하는 심도.",
    conduitQuery: "deep focus street avenue railway perspective",
    keywords: ["deep", "focus", "perspective", "avenue", "railway", "투시", "심도", "소실점"],
  },
  {
    slug: "kinetic-type",
    label: "KINETIC TYPE",
    labelKo: "키네틱 타이포",
    descriptionKo: "화면 속 네온 간판·광고 카피·움직이는 레터링이 리듬을 만드는 타이포그래피 컷.",
    conduitQuery: "neon signs typography commercial graphic motion",
    keywords: ["kinetic", "type", "neon", "sign", "copy", "타이포", "간판", "카피"],
  },
  {
    slug: "color-contrast",
    label: "COLOR CONTRAST",
    labelKo: "색채 보색 대비",
    descriptionKo: "강렬한 보색 충돌과 높은 채도 밀도로 첫 0.5초 만에 망막을 사로잡는 컬러 시퀀스.",
    conduitQuery: "technicolor vivid color contrast cinema",
    keywords: ["color", "contrast", "vivid", "technicolor", "컬러", "색채", "보색", "채도"],
  },
];

function getWarmthScore(palette: readonly string[]): number {
  let warm = 0;
  for (const hex of palette) {
    const clean = hex.replace("#", "");
    const r = Number.parseInt(clean.slice(0, 2), 16) || 0;
    const g = Number.parseInt(clean.slice(2, 4), 16) || 0;
    const b = Number.parseInt(clean.slice(4, 6), 16) || 0;
    if (r > b + 35 && r >= 150 && g >= 60) warm += 1;
  }
  return warm;
}

export function matchesTechnique(item: ArchiveItem, slug: string): boolean {
  const cat = resolveItemCategory(item);
  const country = resolveItemCountry(item);
  const chroma = analyzePaletteChroma(item.palette);
  const text = `${item.titleKo} ${item.originalTitle} ${item.brandOrSource}`.toLowerCase();

  switch (slug) {
    case "symmetry":
      return (
        item.compositionTags.includes("대칭 구도") ||
        item.viewfinder.primaryGrid === "symmetry" ||
        item.compositionTags.includes("1점 투시")
      );
    case "neon-noir":
      return (
        /neon|night|noir|kabukicho|shibuya|dotonbori|nathan|ximending|euljiro|네온|야경|심야|누아르/i.test(text) ||
        cat === "WEB_PHANTOM" ||
        (cat === "CLASSIC_FILM" && !chroma.isChromatic)
      );
    case "fast-cut":
      return (
        item.compositionTags.includes("매치 컷") ||
        item.persuasionTags.includes("초반 3초 시선 강탈") ||
        (item.durationSec !== null && item.durationSec <= 90)
      );
    case "tracking-shot":
      return (
        cat === "STREET_ERA" ||
        /tram|streetcar|cable car|train|subway|metro|street|bus|drive|트램|거리|주행|철도/i.test(text)
      );
    case "35mm-grain":
      return (
        item.year <= 1989 &&
        (item.mediaSource === "archive_mp4" || item.compositionTags.includes("1점 투시"))
      );
    case "commercial-hook":
      return (
        cat === "TVCF" ||
        item.persuasionTags.includes("초반 3초 시선 강탈") ||
        item.persuasionTags.includes("무대사 직관 전달")
      );
    case "close-up":
      return (
        item.compositionTags.includes("초근접 클로즈업") ||
        cat === "TVCF" ||
        cat === "CLASSIC_FILM"
      );
    case "wide-anamorphic":
      return (
        item.aspectRatio === "16:9" ||
        item.aspectRatio === "2.39:1" ||
        item.aspectRatio === "3:2" ||
        /wide|panorama|skyline|highway|와이드|파노라마/i.test(text)
      );
    case "silhouette":
      return (
        item.compositionTags.includes("역광 실루엣") ||
        item.compositionTags.includes("극단적 여백") ||
        chroma.luminanceSpread >= 0.68
      );
    case "chiaroscuro":
      return (
        cat === "CLASSIC_FILM" ||
        !chroma.isChromatic ||
        chroma.luminanceSpread >= 0.72
      );
    case "montage":
      return (
        cat === "CLASSIC_FILM" ||
        cat === "TVCF" ||
        cat === "WEB_PHANTOM"
      );
    case "retro-tvcf":
      return cat === "TVCF" || /commercial|tvcf|광고|스팟/i.test(text);
    case "low-angle":
      return (
        item.persuasionTags.includes("스케일 반전") ||
        /launch|rocket|apollo|shuttle|tower|skyline|bridge|godzilla|발사|우주|타워|빌딩/i.test(text) ||
        cat === "STREET_ERA"
      );
    case "aerial":
      return (
        /apollo|nasa|space|earth|shuttle|flight|sky|aerial|bridge|cable|우주|지구|항공|비행/i.test(text) ||
        (cat === "STREET_ERA" && (country === "US" || country === "EU" || country === "GLOBAL"))
      );
    case "dutch-angle":
      return (
        cat === "CLASSIC_FILM" ||
        cat === "WEB_PHANTOM" ||
        /horror|noir|thriller|night|glitch|호러|누아르|심야/i.test(text)
      );
    case "slow-motion":
      return (
        (item.durationSec !== null && item.durationSec >= 120) ||
        /nasa|apollo|space|ocean|water|dance|우주|발사/i.test(text) ||
        cat === "CLASSIC_FILM"
      );
    case "warm-tungsten":
      return getWarmthScore(item.palette) >= 2;
    case "vintage-film":
      return cat === "CLASSIC_FILM" || (item.mediaSource === "archive_mp4" && item.year <= 1975);
    case "animation-cell":
      return cat === "ANIME_COMIC" || /cartoon|animat|fleischer|popeye|superman|애니|만화/i.test(text);
    case "title-design":
      return (
        cat === "CLASSIC_FILM" ||
        cat === "TVCF" ||
        item.persuasionTags.includes("카피×구도 일체형")
      );
    case "urban-night":
      return (
        cat === "STREET_ERA" ||
        cat === "AD_BILLBOARD" ||
        /tokyo|seoul|hong kong|taipei|paris|new york|london|berlin|night|street|도쿄|서울|홍콩|타이베이|뉴욕|파리|야경/i.test(text)
      );
    case "product-shot":
      return (
        cat === "TVCF" ||
        /chevrolet|ford|pepsi|coca|coffee|kodak|motor|showroom|자동차|쇼룸|광고/i.test(text)
      );
    case "archival-still":
      return item.mediaSource === "still_image";
    case "vhs-analog":
      return (
        cat === "WEB_PHANTOM" ||
        item.era === "1980s" ||
        item.era === "1990-00s"
      );
    case "split-frame":
      return (
        item.compositionTags.includes("프레임 속 프레임") ||
        item.compositionTags.includes("기하학 조형")
      );
    case "deep-focus":
      return (
        item.compositionTags.includes("1점 투시") ||
        item.viewfinder.primaryGrid === "perspective"
      );
    case "kinetic-type":
      return (
        cat === "TVCF" ||
        cat === "AD_BILLBOARD" ||
        item.persuasionTags.includes("카피×구도 일체형") ||
        item.compositionTags.includes("기하학 조형")
      );
    case "color-contrast":
      return chroma.isChromatic && chroma.vividCount >= 2;
    default:
      return true;
  }
}

export function getTechniqueBySlug(slug: string): VisualTechnique | undefined {
  return VISUAL_TECHNIQUES.find((t) => t.slug === slug);
}

export function getTechniquesForItem(item: ArchiveItem, max = 5): VisualTechnique[] {
  const matched: VisualTechnique[] = [];
  for (const tech of VISUAL_TECHNIQUES) {
    if (matchesTechnique(item, tech.slug)) {
      matched.push(tech);
      if (matched.length >= max) break;
    }
  }
  return matched.length > 0 ? matched : [VISUAL_TECHNIQUES[0]];
}

export function searchItemByQuery(item: ArchiveItem, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const matchedTech = VISUAL_TECHNIQUES.find(
    (t) =>
      t.label.toLowerCase().includes(q) ||
      t.slug.includes(q) ||
      t.labelKo.toLowerCase().includes(q) ||
      t.keywords.some((k) => k.toLowerCase() === q)
  );
  if (matchedTech && matchesTechnique(item, matchedTech.slug)) {
    return true;
  }

  const haystack = [
    item.id,
    item.titleKo,
    item.originalTitle,
    item.brandOrSource,
    String(item.year),
    item.era,
    item.category ?? "",
    item.country ?? "",
    item.aspectRatio,
    ...item.compositionTags,
    ...item.persuasionTags,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export interface BreakdownShowcaseCard {
  id: string;
  eyebrow: string;
  headline: string;
  subtitleKo: string;
  techniqueSlug: string;
  ctaLabel: string;
  fallbackItemId: string;
}

export const BREAKDOWN_SHOWCASE_CARDS: BreakdownShowcaseCard[] = [
  {
    id: "bd-neon-street",
    eyebrow: "BREAKING DOWN",
    headline: "TOKYO TO NEW YORK — TRACKING NIGHT",
    subtitleKo: "도쿄·서울·홍콩·파리·뉴욕 트램과 야간 네온이 만드는 1점 투시 주행 시퀀스 해부",
    techniqueSlug: "tracking-shot",
    ctaLabel: "EXPLORE SEQUENCE",
    fallbackItemId: "KF-224",
  },
  {
    id: "bd-golden-tvcf",
    eyebrow: "BREAKING DOWN",
    headline: "GOLDEN AGE 3-SECOND COMMERCIAL HOOK",
    subtitleKo: "1950–80년대 테크니컬러 TVCF가 첫 3초 만에 시선을 점유하는 프레이밍과 매치 컷",
    techniqueSlug: "commercial-hook",
    ctaLabel: "EXPLORE SEQUENCE",
    fallbackItemId: "KF-031",
  },
  {
    id: "bd-vhs-phantom",
    eyebrow: "BREAKING DOWN",
    headline: "ANALOG VHS & FORGOTTEN SIGNAL",
    subtitleKo: "브라운관 주사선·심야 캠코더·초기 3D 신호가 만들어내는 초현실 아카이브 텍스처",
    techniqueSlug: "vhs-analog",
    ctaLabel: "EXPLORE SEQUENCE",
    fallbackItemId: "KF-607",
  },
];
