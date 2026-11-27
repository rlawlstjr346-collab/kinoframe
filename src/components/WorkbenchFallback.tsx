import type { AspectRatio } from "@/types/archive";
import { getAspectRatioClass } from "@/lib/taxonomy";

/** Wall skeleton shown until the browser-only workbench and the live wall catalog are ready. */
export function WorkbenchFallback({ aspects }: { aspects: AspectRatio[] }) {
  return (
    <div className="min-h-screen w-full bg-[#000000] text-white">
      <div className="fixed inset-x-0 top-0 z-50 h-[clamp(62px,3.8vw,78px)] bg-[#000000]/80 px-6 py-3 backdrop-blur-2xl">
        <div className="flex h-full items-center justify-between">
          <span className="text-[1.35rem] font-bold tracking-tight text-white">
            KINOFRAME<span className="text-[#C89E52]">.</span>
          </span>
        </div>
      </div>
      <div className="mx-auto w-full px-3 pt-[clamp(68px,4.3vw,88px)] sm:px-4 lg:px-6">
        <div className="grid grid-cols-2 items-start gap-[8px] md:grid-cols-3 lg:grid-cols-5">
          {aspects.slice(0, 15).map((aspect, index) => (
            <div
              key={index}
              className={`w-full overflow-hidden rounded-[18px] bg-[#141416] ring-1 ring-white/[0.07] ${
                aspect === "4:5" ? "aspect-[4/3]" : getAspectRatioClass(aspect)
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
