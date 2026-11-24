"use client";

import React, { useState } from "react";
import { KinoframeLogo } from "@/components/KinoframeLogo";

interface EyecandyHeaderProps {
  scrolled: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onLogoClick: () => void;
  onShuffleWall: () => void;
  shuffleTick?: number;
}

export function EyecandyHeader({
  scrolled,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onLogoClick,
  onShuffleWall,
  shuffleTick = 0,
}: EyecandyHeaderProps) {
  const [localSpin, setLocalSpin] = useState(0);
  const totalSpinDeg = (localSpin + shuffleTick) * 360;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-[60] h-[clamp(62px,3.8vw,78px)] px-3 transition-all duration-200 ease-out sm:px-7 xl:px-10 ${
        scrolled
          ? "border-b border-white/[0.08] bg-[#000000]/82 backdrop-blur-2xl"
          : "bg-[#000000]/68 backdrop-blur-2xl"
      }`}
    >
      <div className="mx-auto flex h-full w-full items-center justify-between gap-2.5 sm:gap-5">
        {/* Left: Preserved Champagne Brass KINOFRAME. Pure-Vector Wordmark */}
        <button
          type="button"
          onClick={onLogoClick}
          className="group flex shrink-0 items-center py-1 text-left transition-opacity hover:opacity-85"
          aria-label="KINOFRAME 최상단 이동 및 무작위 재셔플"
        >
          <KinoframeLogo className="h-[clamp(18px,1.2vw,27px)] w-auto" />
        </button>

        {/* Right: Apple Spotlight Search Capsule + Champagne Gold '새로운 컷' Button (Zero Login Chrome) */}
        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit();
            }}
            className="relative flex h-[clamp(40px,2.45vw,50px)] w-[clamp(150px,28vw,540px)] max-w-[calc(100vw-230px)] items-center rounded-full border border-white/[0.10] bg-white/[0.09] backdrop-blur-2xl transition-all duration-200 hover:bg-white/[0.13] focus-within:bg-white/[0.16] focus-within:ring-1 focus-within:ring-white/30 sm:w-[clamp(240px,28vw,540px)] sm:max-w-[calc(100vw-290px)]"
          >
            <button
              type="submit"
              aria-label="검색"
              className="absolute left-[clamp(12px,0.95vw,18px)] top-1/2 -translate-y-1/2 text-[#98989D] transition-colors hover:text-white"
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
              className="h-full w-full rounded-full bg-transparent pl-[clamp(36px,2.5vw,48px)] pr-9 text-[clamp(13.5px,0.88vw,17px)] tracking-[-0.02em] text-white placeholder:text-[#8E8E93] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="검색어 지우기"
                className="absolute right-2.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.12] text-[#98989D] transition-colors hover:bg-white/[0.22] hover:text-white"
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

          {/* High-Visibility Apple HIG Champagne Gold Capsule CTA: ↻ 새로운 컷 */}
          <button
            type="button"
            data-testid="new-cuts-button"
            onClick={() => {
              setLocalSpin((n) => n + 1);
              onShuffleWall();
            }}
            aria-label="새로운 컷으로 교체 (단축키 R)"
            title="새로운 컷으로 교체 (단축키 R)"
            className="flex h-[clamp(40px,2.45vw,50px)] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[#C89E52] px-3.5 text-[clamp(13.5px,0.86vw,16.5px)] font-semibold tracking-[-0.02em] text-[#0B0C0F] shadow-[0_4px_20px_rgba(200,158,82,0.32)] ring-1 ring-[#E7C785]/60 transition-all duration-200 hover:bg-[#D7AF65] active:scale-[0.97] sm:gap-2 sm:px-[clamp(15px,1.2vw,24px)]"
          >
            <svg
              viewBox="0 0 24 24"
              style={{ transform: `rotate(${totalSpinDeg}deg)` }}
              className="h-[clamp(16px,1.0vw,20px)] w-[clamp(16px,1.0vw,20px)] shrink-0 transition-transform duration-500 ease-out"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.35"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5"
              />
            </svg>
            <span>새로운 컷</span>
          </button>
        </div>
      </div>
    </header>
  );
}
