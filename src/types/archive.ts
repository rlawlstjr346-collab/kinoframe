export type Era = "1950-60s" | "1970s" | "1980s" | "1990-00s";

export type MediaType = "TVCF" | "NEWS" | "PRINT" | "PHOTO";

export type ArchiveCategory =
  | "TVCF"
  | "CLASSIC_FILM"
  | "ROCK_POSTER"
  | "AD_POSTER"
  | "PROPAGANDA"
  | "TSHIRT_GRAPHIC"
  | "PHOTO";

export type CountryCode = "KR" | "JP" | "TW" | "US" | "EU" | "GLOBAL";

export type AspectRatio = "4:3" | "3:2" | "4:5" | "16:9" | "2.39:1";

export type MediaSource = "archive_mp4" | "youtube_embed" | "still_image";

export type PrimaryGrid = "perspective" | "thirds" | "symmetry" | "golden";

export type CompositionTag =
  | "1점 투시"
  | "극단적 여백"
  | "대칭 구도"
  | "역광 실루엣"
  | "매치 컷"
  | "프레임 속 프레임"
  | "초근접 클로즈업"
  | "기하학 조형";

export type PersuasionTag =
  | "무대사 직관 전달"
  | "초반 3초 시선 강탈"
  | "시각적 은유"
  | "스케일 반전"
  | "카피×구도 일체형"
  | "다큐 리얼리즘";

export interface ViewfinderSpec {
  vanishingPoint: [number, number];
  eyePath: [[number, number], [number, number], [number, number]];
  primaryGrid: PrimaryGrid;
}

export interface ContactBeat {
  label: string;
  timeOrZone: string;
  noteKo: string;
  focusCrop: string;
}

export interface BreakdownSpec {
  hook3s: string;
  framing: string;
  marketingApply: string;
}

export interface ArchiveItem {
  id: string;
  titleKo: string;
  originalTitle: string;
  brandOrSource: string;
  year: number;
  era: Era;
  mediaType: MediaType;
  category?: ArchiveCategory;
  country?: CountryCode;
  priorityBoost?: number;
  aspectRatio: AspectRatio;
  durationSec: number | null;
  mediaSource: MediaSource;
  thumbnailUrl: string;
  previewVideoUrl: string | null;
  youtubeId: string | null;
  sourceUrl: string;
  licenseNote: string;
  compositionTags: CompositionTag[];
  persuasionTags: PersuasionTag[];
  palette: [string, string, string, string, string];
  viewfinder: ViewfinderSpec;
  beats: [ContactBeat, ContactBeat, ContactBeat, ContactBeat];
  breakdown: BreakdownSpec;
  addedAt?: string;
}

export type SortOption =
  | "smart_mix"
  | "curation_density"
  | "recent_added"
  | "year_asc"
  | "year_desc"
  | "duration_asc";

export interface FilterState {
  mediaType: MediaType | "ALL";
  category?: ArchiveCategory | "ALL";
  country?: CountryCode | "ALL";
  era: Era | "ALL";
  compositionTags: CompositionTag[];
  persuasionTags: PersuasionTag[];
  query: string;
  sort: SortOption;
  boardOnly: boolean;
  boardIds: string[];
}

export interface OverlayVisibility {
  perspective: boolean;
  thirds: boolean;
  symmetry: boolean;
  eyePath: boolean;
}

export interface VaultFolder {
  id: string;
  name: string;
}

export interface VaultBookmark {
  itemId: string;
  folderId: string;
  timestampSec: number | null;
  memo: string;
  savedAt: string;
}

export interface VaultState {
  folders: VaultFolder[];
  bookmarks: VaultBookmark[];
}

export interface AuthSessionState {
  authenticated: boolean;
  user: {
    sub: string;
    provider: "google" | "naver" | "account";
    name: string;
    email?: string;
    avatar?: string;
  } | null;
  cloudSyncAvailable: boolean;
}
