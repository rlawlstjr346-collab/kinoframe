"use client";

import React from "react";
import type { ArchiveItem } from "@/types/archive";
import { BREAKDOWN_SHOWCASE_CARDS, matchesTechnique } from "@/lib/visual-techniques";

interface BreakdownShowcaseProps {
  items: ArchiveItem[];
  onExploreTechnique: (slug: string) => void;
}

export function BreakdownShowcase({
  items,
  onExploreTechnique,
}: BreakdownShowcaseProps) {
  return (
    <section
      id="breakdowns-showcase"
      aria-label="시네마 시퀀스 브레이크다운 쇼케이스"
      className="mt-16 flex w-full flex-col"
    >
      {BREAKDOWN_SHOWCASE_CARDS.map((card, idx) => {
        const heroItem =
          items.find((i) => i.id === card.fallbackItemId) ||
          items.find((i) => matchesTechnique(i, card.techniqueSlug)) ||
          items[idx % Math.max(1, items.length)];

        return (
          <article
            key={card.id}
            className={`relative h-[80vh] w-full overflow-hidden rounded-t-[2.4rem] bg-black sm:rounded-t-[3rem] lg:h-[85vh] lg:rounded-t-[5rem] ${
              idx === 0 ? "mt-0" : "-mt-[2.9rem] sm:-mt-[3.5rem] lg:-mt-[5.5rem]"
            }`}
          >
            {heroItem && (
              <img
                src={heroItem.thumbnailUrl}
                alt={card.headline}
                loading="lazy"
                className="h-full w-full object-cover opacity-55"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/80" />

            <div className="absolute left-1/2 top-1/2 flex w-full max-w-[1160px] -translate-x-1/2 -translate-y-1/2 flex-col items-center px-6 text-center">
              <p className="text-[0.9rem] font-medium uppercase tracking-[0.18em] text-[#C8C4BC]">
                {card.eyebrow}
              </p>
              <h2 className="mt-3 text-[2.4rem] font-normal uppercase leading-[1.08] tracking-[-0.02em] text-[#F3A833] sm:text-[3.8rem] lg:text-[5.2rem]">
                {card.headline}
              </h2>
              <p className="mt-4 max-w-[36rem] text-[0.95rem] leading-[1.5] text-[#FAF7F0]/90">
                {card.subtitleKo}
              </p>
              <button
                type="button"
                onClick={() => onExploreTechnique(card.techniqueSlug)}
                className="mt-7 inline-flex items-center justify-center rounded-[2rem] border border-[#F3A833] bg-black/40 px-10 py-2 text-[0.9rem] font-semibold uppercase tracking-wider text-[#FAF7F0] transition-colors duration-200 hover:bg-[#F3A833] hover:text-black"
              >
                {card.ctaLabel}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
