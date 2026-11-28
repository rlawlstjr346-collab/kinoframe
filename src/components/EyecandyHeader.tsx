"use client";

import React, { useState } from "react";
import { KinoframeLogo } from "@/components/KinoframeLogo";
import { BoardBookmarkIcon } from "@/components/Icons";

interface EyecandyHeaderProps {
  scrolled: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onLogoClick: () => void;
  onShuffleWall: () => void;
  shuffleTick?: number;
  boardCount: number;
  onOpenBoard: () => void;
  children?: React.ReactNode;
}

const PRESS = "active:scale-[0.97] active:duration-[120ms]";

export function EyecandyHeader({
  scrolled,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onLogoClick,
  onShuffleWall,
  shuffleTick = 0,
  boardCount,
  onOpenBoard,
  children,
}: EyecandyHeaderProps) {
  const [localSpin, setLocalSpin] = useState(0);
  const totalSpinDeg = (localSpin + shuffleTick) * 360;

  const searchField = (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearchSubmit();
      }}
      className="relative flex h-[var(--kf-control-h)] w-full items-center rounded-full border border-white/[0.10] bg-white/[0.08] transition-[background-color,box-shadow] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus-within:bg-white/[0.14] focus-within:ring-1 focus-within:ring-white/30 hover:bg-white/[0.12]"
    >
      <button
        type="submit"
        aria-label="검색"
        className="absolute left-[clamp(12px,0.9vw,32px)] top-1/2 -translate-y-1/2 text-[var(--kf-text-secondary)] transition-colors hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-[var(--kf-icon)] w-[var(--kf-icon)]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
        </svg>
      </button>
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="영화, 브랜드, 감독 검색"
        aria-label="아카이브 검색"
        className="h-full w-full min-w-0 rounded-full bg-transparent pl-[calc(var(--kf-icon)+clamp(20px,1.5vw,52px))] pr-[clamp(36px,2.2vw,76px)] text-[length:var(--kf-text-ui)] tracking-[-0.015em] text-white placeholder:text-[var(--kf-text-muted)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {searchQuery && (
        <button
          type="button"
          onClick={() => onSearchChange("")}
          aria-label="검색어 지우기"
          className="absolute right-[clamp(8px,0.6vw,22px)] top-1/2 inline-flex h-[calc(var(--kf-control-h)*0.6)] w-[calc(var(--kf-control-h)*0.6)] -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.12] text-[var(--kf-text-secondary)] transition-colors hover:bg-white/[0.22] hover:text-white"
        >
          <svg viewBox="0 0 20 20" className="h-[45%] w-[45%]" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      )}
    </form>
  );

  return (
    <header
      className={`sticky top-0 z-[60] w-full transition-[background-color,border-color] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        scrolled ? "border-b border-white/[0.08] bg-[#08080A]/88 backdrop-blur-2xl" : "border-b border-transparent bg-[#08080A]/72 backdrop-blur-2xl"
      }`}
    >
      <div className="flex w-full items-center justify-between gap-[clamp(8px,0.8vw,28px)] px-[var(--kf-gutter)] py-[clamp(10px,0.6vw,22px)]">
        <button
          type="button"
          onClick={onLogoClick}
          className="flex shrink-0 items-center py-1 text-left transition-opacity duration-[160ms] hover:opacity-85"
          aria-label="KINOFRAME 맨 위로 이동 및 새로운 컷"
        >
          <KinoframeLogo className="h-[clamp(18px,1.15vw,42px)] w-auto" />
        </button>

        {/* Desktop / tablet: search sits in the top row */}
        <div className="hidden min-w-0 flex-1 justify-end sm:flex">
          <div className="w-[clamp(240px,30vw,1180px)] min-w-0">{searchField}</div>
        </div>

        <div className="flex shrink-0 items-center gap-[clamp(6px,0.5vw,18px)]">
          <button
            type="button"
            onClick={onOpenBoard}
            aria-label={boardCount > 0 ? `내 보드 열기 (${boardCount}개 담김)` : "내 보드 열기"}
            className={`flex h-[var(--kf-control-h)] items-center gap-[clamp(6px,0.4vw,14px)] whitespace-nowrap rounded-full border border-white/[0.12] bg-white/[0.06] px-[clamp(12px,0.9vw,32px)] text-[length:var(--kf-text-ui)] font-medium tracking-[-0.015em] text-white transition-[background-color,transform] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/[0.14] ${PRESS}`}
          >
            <BoardBookmarkIcon filled={boardCount > 0} className={`h-[var(--kf-icon)] w-[var(--kf-icon)] ${boardCount > 0 ? "text-[var(--kf-champagne)]" : ""}`} />
            <span>내 보드</span>
            {boardCount > 0 && (
              <span className="num text-[var(--kf-champagne)]" data-testid="board-count">
                · {boardCount}
              </span>
            )}
          </button>

          <button
            type="button"
            data-testid="new-cuts-button"
            onClick={() => {
              setLocalSpin((n) => n + 1);
              onShuffleWall();
            }}
            aria-label="새로운 컷으로 교체 (단축키 R)"
            title="새로운 컷으로 교체 (단축키 R)"
            className={`flex h-[var(--kf-control-h)] shrink-0 cursor-pointer items-center gap-[clamp(6px,0.4vw,14px)] whitespace-nowrap rounded-full bg-[#C89E52] px-[clamp(14px,1.1vw,40px)] text-[length:var(--kf-text-ui)] font-semibold tracking-[-0.02em] text-[#0B0C0F] shadow-[0_4px_20px_rgba(200,158,82,0.28)] ring-1 ring-[#E7C785]/60 transition-[background-color,transform] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--kf-champagne-hover)] ${PRESS}`}
          >
            <svg
              viewBox="0 0 24 24"
              style={{ transform: `rotate(${totalSpinDeg}deg)` }}
              className="h-[var(--kf-icon)] w-[var(--kf-icon)] shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" />
            </svg>
            <span>새로운 컷</span>
          </button>
        </div>
      </div>

      {/* Phone: full-width search on its own row so the placeholder is never clipped */}
      <div className="px-[var(--kf-gutter)] pb-2 sm:hidden">{searchField}</div>

      {children}
    </header>
  );
}
