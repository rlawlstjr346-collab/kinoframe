"use client";

import React, { useEffect, useState } from "react";
import { CloseIcon } from "@/components/Icons";

export type WallSortMode = "shuffle" | "popular" | "recent" | "title";

const TYPED_HINTS = [
  'Search "Wong Kar-wai"',
  'Search "Blade Runner"',
  'Search "Sony Bravia"',
  'Search "Apple 1984"',
  'Search "Wes Anderson"',
  'Search "Oldboy"',
  'Search "Goodfellas"',
  'Search "Stanley Kubrick"',
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
    <div className="mx-auto mt-4 flex w-full max-w-[clamp(780px,54vw,1380px)] flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="relative w-full flex-1"
      >
        <button
          type="submit"
          aria-label="검색"
          className="absolute left-[clamp(16px,1.2vw,24px)] top-1/2 z-10 -translate-y-1/2 text-[#F3A833] transition-colors hover:text-[#FFBE55]"
        >
          <svg
            viewBox="0 0 30 30"
            className="h-[clamp(20px,1.2vw,26px)] w-[clamp(20px,1.2vw,26px)]"
            fill="currentColor"
          >
            <path d="M 13 3 C 7.489 3 3 7.489 3 13 C 3 18.511 7.489 23 13 23 C 15.397 23 17.597 22.149 19.322 20.736 L 25.293 26.707 A 1 1 0 1 0 26.707 25.293 L 20.736 19.322 C 22.149 17.597 23 15.397 23 13 C 23 7.489 18.511 3 13 3 z M 13 5 C 17.43 5 21 8.57 21 13 C 21 17.43 17.43 21 13 21 C 8.57 21 5 17.43 5 13 C 5 8.57 8.57 5 13 5 z" />
          </svg>
        </button>

        {!focused && value.length === 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[clamp(48px,3.1vw,64px)] top-1/2 -translate-y-1/2 truncate text-[clamp(15px,0.95vw,20px)] text-[#FAF7F0]/45"
          >
            {typedHint}
            <span className="ml-0.5 inline-block h-[1.1em] w-[1.5px] animate-pulse bg-[#F3A833] align-middle" />
          </span>
        )}

        <input
          type="text"
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          aria-label="비주얼 아카이브 검색"
          placeholder={focused ? "작품명, 감독, 브랜드, 연도 검색..." : ""}
          className="h-[clamp(48px,3.1vw,66px)] w-full rounded-full border border-[#F3A833] bg-[#111318]/75 pl-[clamp(48px,3.1vw,64px)] pr-12 text-[clamp(15px,0.95vw,20px)] text-[#FAF7F0] placeholder:text-[#7E7B74] transition-colors focus:bg-[#111318] focus:outline-none"
        />

        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="검색어 지우기"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#C8C4BC] hover:text-[#FAF7F0]"
          >
            <CloseIcon className="h-[clamp(16px,1vw,22px)] w-[clamp(16px,1vw,22px)]" />
          </button>
        )}
      </form>

      {/* Right Solid Kodak 500T Amber Sort / Shuffle Capsule (Fluid FHD -> 4K) */}
      <div className="relative shrink-0 sm:min-w-[clamp(180px,11.5vw,248px)]">
        <select
          aria-label="정렬 방식 선택"
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as WallSortMode)}
          className="h-[clamp(48px,3.1vw,66px)] w-full appearance-none rounded-full border border-[#F3A833] bg-[#F3A833] pl-[clamp(22px,1.5vw,32px)] pr-[clamp(42px,2.8vw,56px)] text-[clamp(15px,0.95vw,20px)] font-semibold text-black transition-colors hover:bg-[#FFBE55] focus:outline-none"
        >
          <option value="shuffle">Shuffle</option>
          <option value="popular">Most popular</option>
          <option value="recent">Recently added</option>
          <option value="title">Title</option>
        </select>
        <svg
          viewBox="0 0 12 8"
          aria-hidden="true"
          className="pointer-events-none absolute right-[clamp(16px,1.2vw,24px)] top-1/2 h-[clamp(12px,0.75vw,16px)] w-[clamp(12px,0.75vw,16px)] -translate-y-1/2 text-black"
          fill="currentColor"
        >
          <path d="M1.4 0L6 4.6 10.6 0 12 1.4 6 7.4 0 1.4z" />
        </svg>
      </div>
    </div>
  );
});
