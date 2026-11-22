"use client";

import React, { useEffect, useState } from "react";
import { CloseIcon } from "@/components/Icons";

export type WallSortMode = "shuffle" | "popular" | "recent" | "title";

const TYPED_HINTS = [
  'Search "Motion Blur"',
  'Search "One-Point Symmetry"',
  'Search "Chiaroscuro Noir"',
  'Search "Neon Tungsten"',
  'Search "Product Hero Shot"',
  'Search "Fast-Cut Montage"',
  'Search "Technicolor Warm"',
  'Search "Dolly & Tracking"',
];

interface HeroSearchBarProps {
  value: string;
  onChange: (next: string) => void;
  onClear: () => void;
  onSubmit: () => void;
  sortMode: WallSortMode;
  onSortChange: (next: WallSortMode) => void;
}

export const HeroSearchBar = React.memo(function HeroSearchBar({
  value,
  onChange,
  onClear,
  onSubmit,
  sortMode,
  onSortChange,
}: HeroSearchBarProps) {
  const [focused, setFocused] = useState(false);
  const [typedHint, setTypedHint] = useState<string>(TYPED_HINTS[0]);

  useEffect(() => {
    if (focused || value.length > 0) return;
    let phraseIdx = 0;
    let charIdx = 0;
    let deleting = false;
    let timerId = 0;

    const tick = () => {
      const target = TYPED_HINTS[phraseIdx];
      if (!deleting) {
        charIdx += 1;
        setTypedHint(target.slice(0, charIdx));
        if (charIdx >= target.length) {
          deleting = true;
          timerId = window.setTimeout(tick, 1500);
          return;
        }
        timerId = window.setTimeout(tick, 55);
      } else {
        charIdx -= 1;
        setTypedHint(target.slice(0, charIdx));
        if (charIdx <= 0) {
          deleting = false;
          phraseIdx = (phraseIdx + 1) % TYPED_HINTS.length;
          timerId = window.setTimeout(tick, 320);
          return;
        }
        timerId = window.setTimeout(tick, 30);
      }
    };

    timerId = window.setTimeout(tick, 800);
    return () => window.clearTimeout(timerId);
  }, [focused, value]);

  return (
    <div className="mx-auto mt-4 flex w-[94%] max-w-[75rem] flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-0 lg:w-[60%]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="relative flex-1"
      >
        <button
          type="submit"
          aria-label="검색"
          className="absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-[#F3A833] transition-colors hover:text-[#FFBE55]"
        >
          <svg viewBox="0 0 30 30" className="h-[19px] w-[19px]" fill="currentColor">
            <path d="M 13 3 C 7.489 3 3 7.489 3 13 C 3 18.511 7.489 23 13 23 C 15.397 23 17.597 22.149 19.322 20.736 L 25.293 26.707 A 1 1 0 1 0 26.707 25.293 L 20.736 19.322 C 22.149 17.597 23 15.397 23 13 C 23 7.489 18.511 3 13 3 z M 13 5 C 17.43 5 21 8.57 21 13 C 21 17.43 17.43 21 13 21 C 8.57 21 5 17.43 5 13 C 5 8.57 8.57 5 13 5 z" />
          </svg>
        </button>

        {!focused && value.length === 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 truncate text-[0.95rem] text-[#FAF7F0]/45"
          >
            {typedHint}
            <span className="ml-0.5 inline-block h-3.5 w-[1px] animate-pulse bg-[#F3A833] align-middle" />
          </span>
        )}

        <input
          type="text"
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          aria-label="비주얼 아카이브 검색"
          placeholder={focused ? "광학 기법, 영화, TVCF, 도시, 연도 검색..." : ""}
          className="w-full rounded-[2rem] border border-[#F3A833] bg-transparent py-[0.45rem] pl-10 pr-8 text-[0.95rem] text-[#FAF7F0] placeholder:text-[#7E7B74] focus:bg-[#111318] focus:outline-none"
        />

        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="검색어 지우기"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#C8C4BC] hover:text-[#FAF7F0]"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </form>

      {/* Right Solid Kodak 500T Amber Sort Capsule */}
      <div className="relative sm:ml-4 sm:min-w-[165px]">
        <select
          aria-label="정렬 방식 선택"
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as WallSortMode)}
          className="w-full appearance-none rounded-[2rem] border border-[#F3A833] bg-[#F3A833] py-[0.5rem] pl-4 pr-9 text-[0.92rem] font-semibold text-black transition-colors hover:bg-[#FFBE55] focus:outline-none"
        >
          <option value="shuffle">Shuffle</option>
          <option value="popular">Most popular</option>
          <option value="recent">Recently added</option>
          <option value="title">Title</option>
        </select>
        <svg
          viewBox="0 0 12 8"
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-black"
          fill="currentColor"
        >
          <path d="M1.4 0L6 4.6 10.6 0 12 1.4 6 7.4 0 1.4z" />
        </svg>
      </div>
    </div>
  );
});
