import type { AspectRatio } from "@/types/archive";
import { getAspectRatioClass } from "@/lib/taxonomy";

/** Wall skeleton shown until the browser-only workbench and the live wall catalog are ready. */
export function WorkbenchFallback({ aspects }: { aspects: AspectRatio[] }) {
  return (
    <div className="min-h-screen w-full bg-[var(--kf-bg)] text-[var(--kf-text)]">
      <div className="sticky top-0 z-50 flex items-center px-[var(--kf-gutter)] py-[clamp(10px,0.6vw,22px)]">
        <span className="flex h-[var(--kf-control-h)] items-center text-[clamp(20px,1.3vw,46px)] font-bold tracking-tight text-white">
          KINOFRAME<span className="text-[#C89E52]">.</span>
        </span>
      </div>
      <div className="w-full px-[var(--kf-gutter)] pt-[calc(var(--kf-chip-h)+clamp(14px,0.9vw,34px))]">
        <div className="grid grid-cols-2 items-start gap-[clamp(8px,0.45vw,18px)] md:grid-cols-3 lg:grid-cols-5">
          {aspects.slice(0, 15).map((aspect, index) => (
            <div
              key={index}
              className={`w-full overflow-hidden rounded-[clamp(14px,0.95vw,30px)] bg-[var(--kf-tile-bg)] ring-1 ring-white/[0.07] ${
                aspect === "4:5" ? "aspect-[4/3]" : getAspectRatioClass(aspect)
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
