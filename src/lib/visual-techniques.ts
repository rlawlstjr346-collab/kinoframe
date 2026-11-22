import type { ArchiveItem } from "@/types/archive";
import {
  analyzePaletteChroma,
  computePrimaryColorHsl,
  resolveItemCategory,
} from "@/lib/taxonomy";

export type OpticalBranchSlug =
  | "optics-lens"
  | "camera-movement"
  | "framing-angles"
  | "lighting-color"
  | "editing-cf-hook";

export interface OpticalBranch {
  slug: OpticalBranchSlug;
  label: string;
  labelKo: string;
  descriptionKo: string;
}

export interface VisualTechnique {
  slug: string;
  branchSlug: OpticalBranchSlug;
  label: string;
  labelKo: string;
  descriptionKo: string;
  conduitQuery: string;
  keywords: string[];
}

export const OPTICAL_BRANCHES: OpticalBranch[] = [
  {
    slug: "optics-lens",
    label: "Optics & Lens",
    labelKo: "광학 · 렌즈",
    descriptionKo:
      "초점 심도, 셔터 블러, 아나모픽 플레어, 초광각 왜곡 등 렌즈 광학계 자체의 시각 질감을 설계하는 기법군.",
  },
  {
    slug: "camera-movement",
    label: "Camera Movement",
    labelKo: "카메라 무빙",
    descriptionKo:
      "달리 트래킹, 급격한 줌·팬, 360° 회전과 항공 부감으로 공간의 리듬과 에너지를 조형하는 카메라워크.",
  },
  {
    slug: "framing-angles",
    label: "Framing & Angles",
    labelKo: "구도 · 앵글",
    descriptionKo:
      "1점 소실점 대칭, 극근접 클로즈업, 로우·더치 앵글과 프레임 분할로 심리적 긴장과 권위를 설계하는 구도.",
  },
  {
    slug: "lighting-color",
    label: "Lighting & Color",
    labelKo: "조명 · 색보정",
    descriptionKo:
      "키아로스쿠로 명암, 네온 텅스텐, 테크니컬러 난색·시안 한색 그레이딩과 하이키 스튜디오 조명 문법.",
  },
  {
    slug: "editing-cf-hook",
    label: "Editing & CF Hook",
    labelKo: "편집 · 광고 훅",
    descriptionKo:
      "초반 3초 시선을 장악하는 패스트 컷, 매치 컷, 슬로우 모션, 프로덕트 히어로 샷과 분할 타이틀 연출.",
  },
];

export const VISUAL_TECHNIQUES: VisualTechnique[] = [
  // 1. Optics & Lens (5)
  {
    slug: "motion-blur",
    branchSlug: "optics-lens",
    label: "Motion Blur",
    labelKo: "모션 블러",
    descriptionKo:
      "느린 셔터 스피드와 고속 이동 피사체의 잔상으로 속도감과 몽환적 시간 흐름을 각인하는 광학 연출. 왕가위식 스텝 프린팅이나 야간 도심 주행 컷의 오마주 레퍼런스로 활용한다.",
    conduitQuery: "night driving tram city motion speed film",
    keywords: ["motion blur", "blur", "speed", "streak", "모션 블러", "잔상", "속도감", "야간 주행"],
  },
  {
    slug: "shallow-focus",
    branchSlug: "optics-lens",
    label: "Shallow Focus",
    labelKo: "얕은 심도 · 보케",
    descriptionKo:
      "개방 조리개로 배경을 부드럽게 녹여 인물과 핵심 오브제만 도려내는 선택적 초점 기법. 감성 인물 컷과 제품 디테일 훅에서 시선을 즉각 고정하는 오마주 포인트가 된다.",
    conduitQuery: "close up portrait vintage cinema soft focus",
    keywords: ["shallow focus", "bokeh", "depth of field", "portrait", "얕은 심도", "보케", "아웃포커스"],
  },
  {
    slug: "deep-focus",
    branchSlug: "optics-lens",
    label: "Deep Focus",
    labelKo: "딥 포커스",
    descriptionKo:
      "전경의 인물부터 원경의 건축 소실점까지 모든 레이어를 또렷하게 열어 한 쇼트 안에 복수의 서사를 담는 광학 문법. 오슨 웰스와 고전 35mm 로케이션 미장센의 핵심이다.",
    conduitQuery: "deep focus street avenue architecture perspective",
    keywords: ["deep focus", "perspective", "avenue", "railway", "딥 포커스", "팬 포커스", "소실점"],
  },
  {
    slug: "anamorphic-flare",
    branchSlug: "optics-lens",
    label: "Anamorphic Flare",
    labelKo: "아나모픽 플레어",
    descriptionKo:
      "강한 점광원·네온·헤드라이트가 렌즈 수평축을 따라 번지며 시네마틱 글로우를 만드는 광학 현상. 70~80년대 SF·야경 영화와 하이엔드 자동차 TVCF의 시그니처 오마주 요소다.",
    conduitQuery: "neon night lights glow flare cinema highway",
    keywords: ["anamorphic", "flare", "glow", "headlight", "아나모픽", "플레어", "빛번짐", "네온"],
  },
  {
    slug: "wide-fisheye",
    branchSlug: "optics-lens",
    label: "Wide / Fisheye",
    labelKo: "광각 · 어안 렌즈",
    descriptionKo:
      "초광각 원근 과장과 화면 가장자리 곡률 왜곡으로 공간의 스케일과 역동적 위트를 극대화하는 렌즈 연출. 뮤직비디오·스트리트 패션 필름·90년대 TVCF 오마주에 직결된다.",
    conduitQuery: "wide panoramic skyline highway street lens",
    keywords: ["wide", "fisheye", "panorama", "skyline", "광각", "어안", "와이드", "파노라마"],
  },

  // 2. Camera Movement (5)
  {
    slug: "dolly-tracking",
    branchSlug: "camera-movement",
    label: "Dolly & Tracking",
    labelKo: "달리 · 트래킹 샷",
    descriptionKo:
      "트램·차량·레일 위를 미끄러지듯 전진·평행 이동하며 관객을 공간 내부로 끌어들이는 주행 카메라워크. 오프닝 시퀀스의 공간 몰입도를 결정짓는 고전 시네마 기법이다.",
    conduitQuery: "tram streetcar train driving tracking city",
    keywords: ["dolly", "tracking", "tram", "streetcar", "train", "drive", "달리", "트래킹", "주행"],
  },
  {
    slug: "crash-zoom",
    branchSlug: "camera-movement",
    label: "Crash Zoom",
    labelKo: "크래시 줌",
    descriptionKo:
      "망원단으로 순식간에 파고들어 표정이나 제품의 결정적 순간에 충격을 주는 초고속 줌인 기법. 1970년대 스릴러·예고편과 임팩트 중심 TVCF 오마주에 강력한 리듬을 부여한다.",
    conduitQuery: "vintage movie trailer zoom dramatic action",
    keywords: ["crash zoom", "zoom", "snap zoom", "trailer", "크래시 줌", "급줌", "예고편"],
  },
  {
    slug: "whip-pan",
    branchSlug: "camera-movement",
    label: "Whip Pan",
    labelKo: "휩 팬",
    descriptionKo:
      "카메라를 좌우로 채찍처럼 휘둘러 모션 블러 전환과 빠른 시점 이동을 동시에 달성하는 역동적 패닝 기법. 에드가 라이트식 코믹·커머셜 컷 전환의 원형으로 참고된다.",
    conduitQuery: "fast pan action commercial chase street",
    keywords: ["whip pan", "swish pan", "pan", "fast", "휩 팬", "스위시 팬", "패닝"],
  },
  {
    slug: "orbit-360",
    branchSlug: "camera-movement",
    label: "Orbit 360",
    labelKo: "오빗 360° 회전",
    descriptionKo:
      "중심 피사체 주위를 원형 궤도로 선회하며 입체적 실루엣과 배경의 시차를 드라마틱하게 드러내는 무빙 샷. 히어로 등장 컷과 자동차·오브제 쇼룸 광고의 정석 구도다.",
    conduitQuery: "car showroom turntable orbit circle dance",
    keywords: ["orbit", "360", "arc shot", "turntable", "showroom", "오빗", "회전", "선회"],
  },
  {
    slug: "crane-aerial",
    branchSlug: "camera-movement",
    label: "Crane & Aerial",
    labelKo: "크레인 · 항공 부감",
    descriptionKo:
      "지상에서 상공·궤도까지 수직 상승하거나 도시 전경을 내려다보며 압도적 스케일과 기하학 패턴을 포착하는 부감 무빙. 에필로그 확장 쇼트와 글로벌 브랜드 오프닝의 정석이다.",
    conduitQuery: "aerial flight skyline earth space helicopter",
    keywords: ["crane", "aerial", "bird eye", "flight", "space", "apollo", "크레인", "항공", "부감", "우주"],
  },

  // 3. Framing & Angles (5)
  {
    slug: "one-point-symmetry",
    branchSlug: "framing-angles",
    label: "One-Point Symmetry",
    labelKo: "1점 투시 · 대칭",
    descriptionKo:
      "화면 정중앙 소실점과 좌우 완벽한 대칭 축으로 강렬한 그래픽 질서를 세우는 큐브릭·웨스 앤더슨식 시네마 구도. 단 1초 만에 프레임의 완성도를 각인시킨다.",
    conduitQuery: "symmetry corridor architecture bridge perspective",
    keywords: ["symmetry", "one point", "kubrick", "corridor", "대칭", "1점 투시", "중앙", "소실점"],
  },
  {
    slug: "extreme-close-up",
    branchSlug: "framing-angles",
    label: "Extreme Close-Up",
    labelKo: "익스트림 클로즈업",
    descriptionKo:
      "눈동자·손끝·거품·기계 디테일을 화면 가득 밀착시켜 촉각적 몰입과 심리적 긴장감을 극대화하는 초근접 프레이밍. 세르조 레오네식 대치 컷과 식음료 TVCF의 필수 문법이다.",
    conduitQuery: "extreme close up eye face detail commercial",
    keywords: ["extreme close up", "ecu", "close up", "macro", "detail", "클로즈업", "초근접", "디테일"],
  },
  {
    slug: "low-angle",
    branchSlug: "framing-angles",
    label: "Low Angle",
    labelKo: "로우 앵글",
    descriptionKo:
      "지면에 바짝 낮춘 카메라로 인물·건축·로켓을 올려다보며 압도적 위압감과 영웅적 스케일을 부여하는 앵글. 건축 포스터와 스펙터클 예고편 오마주의 핵심 축이다.",
    conduitQuery: "low angle skyscraper rocket tower monument",
    keywords: ["low angle", "worm eye", "rocket", "tower", "skyscraper", "로우 앵글", "앙각", "스케일"],
  },
  {
    slug: "dutch-angle",
    branchSlug: "framing-angles",
    label: "Dutch Angle",
    labelKo: "더치 앵글",
    descriptionKo:
      "수평 축을 의도적으로 비틀어 불안·현기증·초현실적 에너지를 주입하는 틸트 프레이밍. 표현주의 누아르·컬트 호러와 반항적 스트리트 광고 연출의 오마주 교과서다.",
    conduitQuery: "dutch angle thriller horror film noir tilt",
    keywords: ["dutch angle", "canted", "tilt", "horror", "noir", "더치 앵글", "기울기", "스릴러"],
  },
  {
    slug: "frame-within-frame",
    branchSlug: "framing-angles",
    label: "Frame Within Frame",
    labelKo: "프레임 속 프레임",
    descriptionKo:
      "창틀·아치·문·차창·모니터 윤곽으로 화면 내부에 두 번째 액자를 만들어 시선을 피사체 깊숙이 가두는 다층 구도. 공간의 깊이와 관음적 서사를 동시에 전달한다.",
    conduitQuery: "frame within frame window doorway arch mirror",
    keywords: ["frame within frame", "window", "doorway", "arch", "mirror", "프레임 속 프레임", "창틀", "액자"],
  },

  // 4. Lighting & Color (5)
  {
    slug: "chiaroscuro-noir",
    branchSlug: "lighting-color",
    label: "Chiaroscuro Noir",
    labelKo: "키아로스쿠로 누아르",
    descriptionKo:
      "깊은 칠흑 암부와 날카로운 한 줄기 키 라이트의 극단적 명암 대비로 인물의 윤곽과 음영을 조각하는 고전 조명. 블라인드 그림자와 역광 실루엣 오마주의 원형이다.",
    conduitQuery: "film noir chiaroscuro shadow backlight silhouette",
    keywords: ["chiaroscuro", "noir", "silhouette", "shadow", "contrast", "키아로스쿠로", "누아르", "실루엣", "명암"],
  },
  {
    slug: "neon-tungsten",
    branchSlug: "lighting-color",
    label: "Neon Tungsten",
    labelKo: "네온 · 텅스텐 조명",
    descriptionKo:
      "밤거리 네온 사인과 실내 텅스텐 가로등이 젖은 아스팔트 위에 강렬한 색 대비를 흩뿌리는 야간 조명 문법. 도쿄·홍콩·뉴욕 심야 시네마와 사이버펑크 비주얼의 뿌리다.",
    conduitQuery: "neon night city street lights tokyo new york",
    keywords: ["neon", "tungsten", "night", "urban", "kabukicho", "shibuya", "네온", "텅스텐", "야경", "밤거리"],
  },
  {
    slug: "technicolor-warm",
    branchSlug: "lighting-color",
    label: "Technicolor Warm",
    labelKo: "테크니컬러 웜 톤",
    descriptionKo:
      "코닥 500T 호박빛과 3-스트립 테크니컬러 특유의 진한 크림슨·골드·앰버 난색 밀도로 회화적 온기를 채우는 색보정. 황금기 할리우드와 레트로 TVCF의 시그니처 팔레트다.",
    conduitQuery: "technicolor vintage color warm gold retro film",
    keywords: ["technicolor", "warm", "amber", "gold", "kodachrome", "테크니컬러", "웜 톤", "난색", "앰버"],
  },
  {
    slug: "cyan-cold-grade",
    branchSlug: "lighting-color",
    label: "Cyan & Cold Grade",
    labelKo: "시안 · 콜드 그레이드",
    descriptionKo:
      "차가운 시안·스틸 블루·에메랄드 색온도로 고독·미래적 정밀함·긴장감을 조형하는 한색 그레이딩. SF 우주 기록·CRT 신호·현대 테크 필름의 컬러 오마주 기준점이다.",
    conduitQuery: "blue cyan cold night space ocean crt film",
    keywords: ["cyan", "cold", "blue", "teal", "steel", "시안", "콜드", "한색", "블루"],
  },
  {
    slug: "high-key-studio",
    branchSlug: "lighting-color",
    label: "High-Key Studio",
    labelKo: "하이키 스튜디오",
    descriptionKo:
      "그림자를 최소화한 밝고 균일한 스튜디오 조명으로 깔끔한 그래픽 팝과 낙관적 미드센추리 톤을 구현하는 조명 기법. 1950~70년대 가전·식음료·패션 TVCF의 핵심 문법이다.",
    conduitQuery: "vintage studio commercial kitchen bright fashion",
    keywords: ["high key", "studio", "bright", "showroom", "kitchen", "하이키", "스튜디오", "밝은 조명"],
  },

  // 5. Editing & CF Hook (5)
  {
    slug: "fast-cut-montage",
    branchSlug: "editing-cf-hook",
    label: "Fast-Cut Montage",
    labelKo: "패스트 컷 몽타주",
    descriptionKo:
      "0.5~1.5초 단위의 타이트한 컷 충돌로 짧은 러닝타임 안에 폭발적 정보량과 시각 리듬을 압축하는 편집 기법. 빈티지 극장 예고편과 15초 TVCF 초반 훅의 교과서다.",
    conduitQuery: "fast cut montage movie trailer commercial spot",
    keywords: ["fast cut", "montage", "quick", "trailer", "spot", "패스트 컷", "몽타주", "예고편"],
  },
  {
    slug: "match-cut",
    branchSlug: "editing-cf-hook",
    label: "Match Cut",
    labelKo: "매치 컷",
    descriptionKo:
      "서로 다른 시공간·오브제를 동일한 도형 윤곽이나 동작 축으로 매끄럽게 이어 시각적 은유를 폭발시키는 편집 기법. 브랜드 메시지와 제품 전환 컷의 가장 세련된 연결 방식이다.",
    conduitQuery: "match cut transition commercial visual metaphor",
    keywords: ["match cut", "transition", "metaphor", "매치 컷", "시각적 은유", "컷 전환"],
  },
  {
    slug: "slow-motion",
    branchSlug: "editing-cf-hook",
    label: "Slow Motion",
    labelKo: "슬로우 모션",
    descriptionKo:
      "고속 촬영으로 시간의 결을 늘려 화염·물방울·표정의 미세한 운동을 조각처럼 음미하게 만드는 연출. 로켓 점화·액체 포어링·클라이맥스 감정선의 핵심 오마주 소스다.",
    conduitQuery: "slow motion launch flame water dance cinema",
    keywords: ["slow motion", "high speed", "launch", "water", "슬로우 모션", "고속 촬영", "궤적"],
  },
  {
    slug: "product-hero-shot",
    branchSlug: "editing-cf-hook",
    label: "Product Hero Shot",
    labelKo: "프로덕트 히어로 샷",
    descriptionKo:
      "자동차·음료·소비재를 정교한 림 라이트와 그래픽 구도로 주인공처럼 각인시키는 커머셜 클라이맥스 컷. 초반 3초 시선 점유와 브랜드 리콜을 극대화하는 광고 연출의 정수다.",
    conduitQuery: "vintage television commercial car drink product ad",
    keywords: ["product", "hero shot", "tvcf", "commercial", "chevrolet", "ford", "pepsi", "프로덕트", "광고", "제품"],
  },
  {
    slug: "split-screen-title",
    branchSlug: "editing-cf-hook",
    label: "Split Screen & Title",
    labelKo: "분할 화면 · 타이틀",
    descriptionKo:
      "대담한 화면 분할·키네틱 레터링·그래픽 타이틀 시퀀스가 영상 프레임과 일체화되는 편집 디자인. 1960년대 사울 배스식 오프닝과 타이포 중심 TVCF 오마주에 직결된다.",
    conduitQuery: "title sequence graphic typography trailer split screen",
    keywords: ["split screen", "title", "typography", "graphic", "copy", "분할 화면", "타이틀", "타이포"],
  },
];

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16) || 0,
    Number.parseInt(clean.slice(2, 4), 16) || 0,
    Number.parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

function getWarmthScore(palette: readonly string[]): number {
  let warm = 0;
  for (const hex of palette) {
    const [r, g, b] = parseHexRgb(hex);
    if (r > b + 35 && r >= 150 && g >= 60) warm += 1;
  }
  return warm;
}

function getCoolScore(palette: readonly string[]): number {
  let cool = 0;
  for (const hex of palette) {
    const [r, g, b] = parseHexRgb(hex);
    if (b >= r + 18 && (b >= 95 || g >= 105)) cool += 1;
  }
  return cool;
}

function getAvgBrightness(palette: readonly string[]): number {
  if (palette.length === 0) return 0;
  let sum = 0;
  for (const hex of palette) {
    const [r, g, b] = parseHexRgb(hex);
    sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  return sum / palette.length;
}

export function getBranchBySlug(
  slug: OpticalBranchSlug
): OpticalBranch | undefined {
  return OPTICAL_BRANCHES.find((b) => b.slug === slug);
}

export function getTechniquesByBranch(
  branchSlug: OpticalBranchSlug
): VisualTechnique[] {
  return VISUAL_TECHNIQUES.filter((t) => t.branchSlug === branchSlug);
}

export function getTechniqueBySlug(slug: string): VisualTechnique | undefined {
  return VISUAL_TECHNIQUES.find((t) => t.slug === slug);
}

export function getSiblingTechniques(techniqueSlug: string): VisualTechnique[] {
  const target = getTechniqueBySlug(techniqueSlug);
  if (!target) return [];
  return getTechniquesByBranch(target.branchSlug);
}

export function matchesTechnique(item: ArchiveItem, slug: string): boolean {
  const cat = resolveItemCategory(item);
  const chroma = analyzePaletteChroma(item.palette);
  const hero = computePrimaryColorHsl(item.palette);
  const text = `${item.titleKo} ${item.originalTitle} ${item.brandOrSource}`.toLowerCase();
  const warmth = getWarmthScore(item.palette);
  const coolness = getCoolScore(item.palette);
  const avgLum = getAvgBrightness(item.palette);
  const dur = item.durationSec ?? 60;

  switch (slug) {
    // 1. Optics & Lens
    case "motion-blur":
      return (
        /speed|motion|night|drive|race|chase|flight|action|car|auto|road|주행|속도|야경/i.test(
          text
        ) ||
        item.compositionTags.includes("매치 컷") ||
        (cat === "TVCF" && dur <= 45)
      );
    case "shallow-focus":
      return (
        item.compositionTags.includes("초근접 클로즈업") ||
        /portrait|face|woman|man|coffee|kitchen|fashion|model|love|drama|beauty|perfume|인물|클로즈업|패션/i.test(
          text
        ) ||
        (hero.l >= 0.42 && hero.l <= 0.68 && chroma.avgSaturation >= 0.34)
      );
    case "deep-focus":
      return (
        item.compositionTags.includes("1점 투시") ||
        item.viewfinder.primaryGrid === "perspective" ||
        /avenue|street|corridor|city|world|house|hall|투시|거리/i.test(text)
      );
    case "anamorphic-flare":
      return (
        /neon|night|light|glow|space|sunset|highway|showroom|star|sci-fi|future|laser|네온|야경|빛/i.test(
          text
        ) ||
        item.aspectRatio === "16:9" ||
        item.aspectRatio === "2.39:1" ||
        (chroma.luminanceSpread >= 0.52 && chroma.maxSaturation >= 0.58)
      );
    case "wide-fisheye":
      return (
        item.aspectRatio === "16:9" ||
        item.aspectRatio === "2.39:1" ||
        item.aspectRatio === "3:2" ||
        /wide|panorama|skyline|highway|fair|world|desert|ocean|mountain|와이드|광각/i.test(
          text
        ) ||
        (cat === "CLASSIC_FILM" && dur >= 3600)
      );

    // 2. Camera Movement
    case "dolly-tracking":
      return (
        /drive|car|train|road|journey|walk|chase|street|city|escape|auto|ford|honda|toyota|chevrolet|bmw|porsche|주행|트래킹|자동차/i.test(
          text
        ) ||
        (cat === "CLASSIC_FILM" && item.viewfinder.primaryGrid === "perspective")
      );
    case "crash-zoom":
      return (
        /horror|thriller|action|monster|alien|blood|terror|killer|kung|fu|fight|crime|호러|스릴러|액션/i.test(
          text
        ) ||
        (cat === "CLASSIC_FILM" && dur <= 3000) ||
        item.persuasionTags.includes("초반 3초 시선 강탈")
      );
    case "whip-pan":
      return (
        item.compositionTags.includes("매치 컷") ||
        /chase|race|sport|dance|spot|commercial|action|music|party|패스트|스팟/i.test(
          text
        ) ||
        (cat === "TVCF" && dur <= 70)
      );
    case "orbit-360":
      return (
        /showroom|car|chevrolet|ford|honda|toyota|motor|dance|stage|fashion|watch|perfume|bottle|쇼룸|자동차|회전/i.test(
          text
        ) ||
        (cat === "TVCF" && item.compositionTags.includes("기하학 조형")) ||
        item.viewfinder.primaryGrid === "golden"
      );
    case "crane-aerial":
      return (
        /sky|flight|air|mountain|sea|ocean|island|city|war|epic|battle|space|planet|항공|우주|전경/i.test(
          text
        ) ||
        item.persuasionTags.includes("스케일 반전") ||
        (cat === "CLASSIC_FILM" && dur >= 4500)
      );

    // 3. Framing & Angles
    case "one-point-symmetry":
      return (
        item.compositionTags.includes("대칭 구도") ||
        item.viewfinder.primaryGrid === "symmetry" ||
        item.compositionTags.includes("1점 투시")
      );
    case "extreme-close-up":
      return (
        item.compositionTags.includes("초근접 클로즈업") ||
        /eye|face|hand|coffee|drink|food|watch|camera|kodak|polaroid|detail|인물|클로즈업|근접/i.test(
          text
        ) ||
        cat === "TVCF"
      );
    case "low-angle":
      return (
        item.persuasionTags.includes("스케일 반전") ||
        /giant|monster|hero|tower|building|king|god|power|truck|car|rocket|스케일|히어로/i.test(
          text
        ) ||
        (cat === "CLASSIC_FILM" && chroma.luminanceSpread >= 0.48)
      );
    case "dutch-angle":
      return (
        /horror|noir|thriller|suspense|night|dead|blood|evil|ghost|vampire|zombie|murder|psycho|호러|누아르|스릴러/i.test(
          text
        ) ||
        (cat === "CLASSIC_FILM" && avgLum <= 0.38)
      );
    case "frame-within-frame":
      return (
        item.compositionTags.includes("프레임 속 프레임") ||
        item.compositionTags.includes("기하학 조형") ||
        /window|door|mirror|arch|screen|tv|house|room|창|거울|프레임/i.test(text)
      );

    // 4. Lighting & Color
    case "chiaroscuro-noir":
      return (
        item.compositionTags.includes("역광 실루엣") ||
        avgLum <= 0.36 ||
        chroma.luminanceSpread >= 0.56
      );
    case "neon-tungsten":
      return (
        /neon|night|tokyo|japan|hong kong|club|disco|city|80s|90s|sony|seiko|네온|텅스텐|야경/i.test(
          text
        ) ||
        (item.year >= 1978 &&
          ((hero.h >= 270 && hero.h <= 345) || (hero.h >= 20 && hero.h <= 55)) &&
          hero.s >= 0.38)
      );
    case "technicolor-warm":
      return (
        warmth >= 2 ||
        (hero.h >= 0 && hero.h <= 62 && hero.s >= 0.3) ||
        (hero.h >= 330 && hero.s >= 0.3)
      );
    case "cyan-cold-grade":
      return (
        coolness >= 2 ||
        (hero.h >= 165 && hero.h <= 255 && hero.s >= 0.22) ||
        /space|ocean|blue|winter|ice|water|sea|우주|바다|블루/i.test(text)
      );
    case "high-key-studio":
      return (
        avgLum >= 0.48 ||
        /studio|kitchen|fashion|showroom|soap|cereal|soda|cola|pepsi|home|family|주방|쇼룸|패션/i.test(
          text
        ) ||
        (cat === "TVCF" && hero.l >= 0.46)
      );

    // 5. Editing & CF Hook
    case "fast-cut-montage":
      return (
        item.persuasionTags.includes("초반 3초 시선 강탈") ||
        dur <= 90 ||
        cat === "TVCF"
      );
    case "match-cut":
      return (
        item.compositionTags.includes("매치 컷") ||
        item.persuasionTags.includes("시각적 은유") ||
        item.persuasionTags.includes("무대사 직관 전달")
      );
    case "slow-motion":
      return (
        dur >= 2400 ||
        /dance|water|ocean|dream|love|music|ballet|flight|슬로우|무용|바다/i.test(
          text
        ) ||
        (cat === "CLASSIC_FILM" && item.year >= 1970 && item.year <= 1995)
      );
    case "product-hero-shot":
      return (
        cat === "TVCF" ||
        /chevrolet|ford|pepsi|coca|coffee|kodak|sony|honda|toyota|polaroid|commercial|자동차|쇼룸|광고/i.test(
          text
        )
      );
    case "split-screen-title":
      return (
        item.persuasionTags.includes("카피×구도 일체형") ||
        item.compositionTags.includes("기하학 조형") ||
        (cat === "TVCF" && item.year >= 1975)
      );
    default:
      return true;
  }
}

export function matchesBranch(
  item: ArchiveItem,
  branchSlug: OpticalBranchSlug
): boolean {
  const branchTechs = getTechniquesByBranch(branchSlug);
  return branchTechs.some((tech) => matchesTechnique(item, tech.slug));
}

export function getTechniquesForItem(
  item: ArchiveItem,
  max = 5
): VisualTechnique[] {
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

  const matchedBranch = OPTICAL_BRANCHES.find(
    (b) =>
      b.label.toLowerCase().includes(q) ||
      b.labelKo.toLowerCase().includes(q) ||
      b.slug.includes(q)
  );
  if (matchedBranch && matchesBranch(item, matchedBranch.slug)) {
    return true;
  }

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
    id: "bd-dolly-street",
    eyebrow: "OPTICAL BREAKDOWN · CAMERA MOVEMENT",
    headline: "TOKYO TO NEW YORK — DOLLY & TRACKING",
    subtitleKo:
      "도쿄·서울·홍콩·파리·뉴욕 트램과 야간 네온이 만드는 1점 투시 주행 카메라워크 시퀀스 해부",
    techniqueSlug: "dolly-tracking",
    ctaLabel: "EXPLORE SEQUENCE",
    fallbackItemId: "KF-224",
  },
  {
    id: "bd-golden-tvcf",
    eyebrow: "OPTICAL BREAKDOWN · EDITING & CF HOOK",
    headline: "GOLDEN AGE PRODUCT HERO & 3S HOOK",
    subtitleKo:
      "1950–80년대 테크니컬러 TVCF가 첫 3초 만에 시선을 점유하는 프레이밍과 프로덕트 히어로 샷",
    techniqueSlug: "product-hero-shot",
    ctaLabel: "EXPLORE SEQUENCE",
    fallbackItemId: "KF-031",
  },
  {
    id: "bd-neon-tungsten",
    eyebrow: "OPTICAL BREAKDOWN · LIGHTING & COLOR",
    headline: "KODAK 500T NEON & TUNGSTEN NOIR",
    subtitleKo:
      "심야 네온 사인·텅스텐 가로등·아날로그 색수차가 빚어내는 고밀도 시네마 조명 팔레트",
    techniqueSlug: "neon-tungsten",
    ctaLabel: "EXPLORE SEQUENCE",
    fallbackItemId: "KF-607",
  },
];
