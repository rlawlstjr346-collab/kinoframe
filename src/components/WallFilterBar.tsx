"use client";

import React, { useLayoutEffect, useRef, useState } from "react";

export type WallCategory = "ALL" | "CLASSIC_FILM" | "TVCF";

const CATEGORY_TABS: Array<{ value: WallCategory; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "CLASSIC_FILM", label: "시네마" },
  { value: "TVCF", label: "TVCF" },
];

interface WallFilterBarProps {
  category: WallCategory;
  onCategoryChange: (value: WallCategory) => void;
  techniques: Array<{ tag: string; count: number }>;
  activeTechnique: string | null;
  onTechniqueChange: (tag: string | null) => void;
  resultCount: number;
}

const CHIP_BASE =
  "inline-flex h-[var(--kf-chip-h)] shrink-0 items-center gap-[0.4em] whitespace-nowrap rounded-full px-[clamp(12px,0.85vw,30px)] text-[length:var(--kf-text-chip)] font-medium tracking-[-0.01em] transition-[background-color,color,border-color,transform] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] active:duration-[120ms]";

export function WallFilterBar({
  category,
  onCategoryChange,
  techniques,
  activeTechnique,
  onTechniqueChange,
  resultCount,
}: WallFilterBarProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);
  const activeIndex = CATEGORY_TABS.findIndex((t) => t.value === category);

  // Sliding capsule: measured once per change, animated with transform only.
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeIndex];
      if (el) setIndicator({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, [activeIndex]);

  return (
    <nav aria-label="벽면 필터" className="w-full">
      <div className="kf-rail flex items-center [mask-image:linear-gradient(to_right,#000_calc(100%-48px),transparent)] sm:[mask-image:linear-gradient(to_right,#000_calc(100%-72px),transparent)] gap-[clamp(8px,0.6vw,22px)] overflow-x-auto px-[var(--kf-gutter)] pb-[clamp(10px,0.6vw,22px)]">
        <div role="tablist" aria-label="카테고리" className="relative flex shrink-0 rounded-full border border-white/[0.10] bg-white/[0.05] p-[3px]">
          {indicator && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-[3px] h-[calc(100%-6px)] rounded-full bg-[var(--kf-text)] transition-transform duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{ width: indicator.w, transform: `translate3d(${indicator.x}px,0,0)` }}
            />
          )}
          {CATEGORY_TABS.map((tab, i) => {
            const active = tab.value === category;
            return (
              <button
                key={tab.value}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onCategoryChange(tab.value)}
                className={`${CHIP_BASE} relative z-[1] h-[calc(var(--kf-chip-h)-6px)] ${
                  active ? "text-[#0B0C0F]" : "text-[var(--kf-text-secondary)] hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <span aria-hidden="true" className="h-[calc(var(--kf-chip-h)*0.55)] w-px shrink-0 bg-white/[0.12]" />

        {techniques.map(({ tag, count }) => {
          const active = tag === activeTechnique;
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => onTechniqueChange(active ? null : tag)}
              className={`${CHIP_BASE} border ${
                active
                  ? "border-[var(--kf-champagne)] bg-[rgba(200,158,82,0.16)] text-[#F0D9A6]"
                  : "border-white/[0.09] bg-transparent text-[var(--kf-text-secondary)] hover:border-white/[0.2] hover:text-white"
              }`}
            >
              {tag}
              <span className={`num text-[0.85em] ${active ? "text-[#F0D9A6]/80" : "text-[var(--kf-text-muted)]"}`}>{count}</span>
            </button>
          );
        })}

        <span className="num ml-auto shrink-0 pl-2 pr-[56px] text-[length:var(--kf-text-chip)] text-[var(--kf-text-muted)]" aria-live="polite">
          {resultCount}컷
        </span>
      </div>
    </nav>
  );
}
