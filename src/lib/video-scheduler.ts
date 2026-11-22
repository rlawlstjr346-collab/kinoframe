export interface VideoSlotRegistration {
  id: string;
  ratio: number;
  centerDistance: number;
  hovered: boolean;
  onSlotChange: (allowed: boolean) => void;
}

export class VideoPlaybackScheduler {
  private entries = new Map<string, VideoSlotRegistration>();
  private activeIds = new Set<string>();
  private maxSlotsOverride: number | null;

  constructor(maxSlotsOverride: number | null = null) {
    this.maxSlotsOverride = maxSlotsOverride;
  }

  getMaxConcurrentSlots(): number {
    if (this.maxSlotsOverride !== null) {
      return Math.max(1, this.maxSlotsOverride);
    }
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return 4;
    }
    return 8;
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
    const limit = this.getMaxConcurrentSlots();

    const eligible: VideoSlotRegistration[] = [];
    for (const entry of this.entries.values()) {
      if (entry.hovered || entry.ratio >= 0.2) {
        eligible.push(entry);
      }
    }

    eligible.sort((a, b) => {
      // Priority 1: hovered / focused tile wins immediately
      if (a.hovered !== b.hovered) return a.hovered ? -1 : 1;
      // Priority 2: significantly higher visibility ratio wins
      const ratioDiff = b.ratio - a.ratio;
      if (Math.abs(ratioDiff) > 0.15) return ratioDiff;
      // Priority 3: closer to vertical center of viewport wins
      if (Math.abs(a.centerDistance - b.centerDistance) > 24) {
        return a.centerDistance - b.centerDistance;
      }
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
