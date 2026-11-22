export interface VideoSlotRegistration {
  id: string;
  ratio: number;
  centerDistance: number;
  hovered: boolean;
  onSlotChange: (allowed: boolean) => void;
}

const MIN_VISIBLE_RATIO = 0.15;
const HYSTERESIS_DISTANCE_BONUS_PX = 320;
const HYSTERESIS_RATIO_BONUS = 0.35;

export class VideoPlaybackScheduler {
  private entries = new Map<string, VideoSlotRegistration>();
  private activeIds = new Set<string>();
  private maxSlotsOverride: number | null;
  private suspended = false;

  constructor(maxSlotsOverride: number | null = null) {
    this.maxSlotsOverride = maxSlotsOverride;
  }

  isSuspended(): boolean {
    return this.suspended;
  }

  setSuspended(nextSuspended: boolean): void {
    if (this.suspended === nextSuspended) return;
    this.suspended = nextSuspended;
    if (nextSuspended) {
      for (const entry of this.entries.values()) {
        if (this.activeIds.has(entry.id)) {
          entry.onSlotChange(false);
        }
      }
      this.activeIds.clear();
    } else {
      this.recompute();
    }
  }

  getMaxConcurrentSlots(): number {
    if (this.maxSlotsOverride !== null) {
      return Math.max(1, this.maxSlotsOverride);
    }
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return 6;
    }
    return 18;
  }

  register(entry: VideoSlotRegistration): void {
    this.entries.set(entry.id, entry);
    this.recompute();
    if (!this.activeIds.has(entry.id)) {
      entry.onSlotChange(false);
    }
  }

  update(
    id: string,
    patch: Partial<Pick<VideoSlotRegistration, "ratio" | "centerDistance" | "hovered">>
  ): void {
    const existing = this.entries.get(id);
    if (!existing) return;
    this.entries.set(id, { ...existing, ...patch });
    this.recompute();
  }

  unregister(id: string): void {
    if (!this.entries.has(id)) return;
    this.entries.delete(id);
    this.activeIds.delete(id);
    this.recompute();
  }

  getActiveIds(): string[] {
    return Array.from(this.activeIds);
  }

  recompute(): void {
    if (this.suspended) {
      for (const entry of this.entries.values()) {
        if (this.activeIds.has(entry.id)) {
          entry.onSlotChange(false);
        }
      }
      this.activeIds.clear();
      return;
    }

    const limit = this.getMaxConcurrentSlots();

    const eligible: VideoSlotRegistration[] = [];
    for (const entry of this.entries.values()) {
      if (entry.hovered || entry.ratio >= MIN_VISIBLE_RATIO) {
        eligible.push(entry);
      }
    }

    eligible.sort((a, b) => {
      // Priority 1: hovered / focused tile wins immediately
      if (a.hovered !== b.hovered) return a.hovered ? -1 : 1;

      // Priority 2: hysteresis retention for already-playing in-viewport tiles
      const aActive = this.activeIds.has(a.id) && a.ratio >= MIN_VISIBLE_RATIO;
      const bActive = this.activeIds.has(b.id) && b.ratio >= MIN_VISIBLE_RATIO;
      const aEffRatio = a.ratio + (aActive ? HYSTERESIS_RATIO_BONUS : 0);
      const bEffRatio = b.ratio + (bActive ? HYSTERESIS_RATIO_BONUS : 0);
      const ratioDiff = bEffRatio - aEffRatio;
      if (Math.abs(ratioDiff) > 0.2) return ratioDiff;

      // Priority 3: closer to vertical center (with hysteresis bonus for active tiles)
      const aEffDist = Math.max(
        0,
        a.centerDistance - (aActive ? HYSTERESIS_DISTANCE_BONUS_PX : 0)
      );
      const bEffDist = Math.max(
        0,
        b.centerDistance - (bActive ? HYSTERESIS_DISTANCE_BONUS_PX : 0)
      );
      if (Math.abs(aEffDist - bEffDist) > 36) {
        return aEffDist - bEffDist;
      }

      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    const nextActive = new Set<string>(
      eligible.slice(0, limit).map((entry) => entry.id)
    );

    for (const entry of this.entries.values()) {
      const wasActive = this.activeIds.has(entry.id);
      const isNowActive = nextActive.has(entry.id);
      if (wasActive !== isNowActive) {
        entry.onSlotChange(isNowActive);
      }
    }

    this.activeIds = nextActive;
  }
}

export const globalVideoScheduler = new VideoPlaybackScheduler();
