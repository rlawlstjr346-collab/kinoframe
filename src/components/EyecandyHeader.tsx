"use client";

import React from "react";
import { KinoframeLogo } from "@/components/KinoframeLogo";

interface EyecandyHeaderProps {
  scrolled: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onLogoClick: () => void;
  onShuffleWall: () => void;
}

export function EyecandyHeader({
  scrolled,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onLogoClick,
  onShuffleWall,
}: EyecandyHeaderProps) {
  return (
    <header
      className={`fixed inset-x-0 top-0 z-[60] h-[clamp(62px,3.8vw,78px)] px-4 transition-all duration-200 ease-out sm:px-7 xl:px-10 ${
        scrolled
          ? "border-b border-white/[0.08] bg-[#000000]/82 backdrop-blur-2xl"
          : "bg-[#000000]/68 backdrop-blur-2xl"
      }`}
    >
      <div className="mx-auto flex h-full w-full items-center justify-between gap-3 sm:gap-5">
        {/* Left: Preserved Champagne Brass KINOFRAME. Pure-Vector Wordmark */}
        <button
          type="button"
          onClick={onLogoClick}
          className="group flex shrink-0 items-center py-1 text-left transition-opacity hover:opacity-85"
          aria-label="KINOFRAME 최상단 이동 및 무작위 재셔플"
        >
          <KinoframeLogo className="h-[clamp(19px,1.2vw,27px)] w-auto" />
        </button>

        {/* Right: Apple Spotlight Search Capsule + Circular Shuffle Button (Zero Login Chrome) */}
        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit();
            }}
            className="relative flex h-[clamp(40px,2.4vw,50px)] w-[clamp(260px,28vw,560px)] max-w-[calc(100vw-180px)] items-center rounded-full border border-white/[0.10] bg-white/[0.09] backdrop-blur-2xl transition-all duration-200 hover:bg-white/[0.13] focus-within:bg-white/[0.16] focus-within:ring-1 focus-within:ring-white/30"
          >
            <button
              type="submit"
              aria-label="검색"
              className="absolute left-[clamp(13px,0.95vw,18px)] top-1/2 -translate-y-1/2 text-[#98989D] transition-colors hover:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[clamp(16px,1.0vw,20px)] w-[clamp(16px,1.0vw,20px)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
              >
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
              </svg>
            </button>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="영화, 브랜드, 감독 검색"
              aria-label="아카이브 검색"
              className="h-full w-full rounded-full bg-transparent pl-[clamp(38px,2.5vw,48px)] pr-10 text-[clamp(14px,0.88vw,17px)] tracking-[-0.02em] text-white placeholder:text-[#8E8E93] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="검색어 지우기"
                className="absolute right-3 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.12] text-[#98989D] transition-colors hover:bg-white/[0.22] hover:text-white"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            )}
          </form>

          {/* Circular Random Shuffle Button (↻) */}
          <button
            type="button"
            onClick={onShuffleWall}
            aria-label="무작위 셔플"
            title="무작위 셔플"
            className="inline-flex h-[clamp(40px,2.4vw,50px)] w-[clamp(40px,2.4vw,50px)] shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.09] text-white backdrop-blur-2xl transition-colors duration-200 hover:bg-white/[0.16]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[clamp(17px,1.05vw,21px)] w-[clamp(17px,1.05vw,21px)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
