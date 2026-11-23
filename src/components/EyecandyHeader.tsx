"use client";

import React, { useState } from "react";
import type { AuthSessionState } from "@/types/archive";
import { KinoframeLogo } from "@/components/KinoframeLogo";

interface EyecandyHeaderProps {
  scrolled: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  session: AuthSessionState;
  savedCount: number;
  onLogoClick: () => void;
  onShuffleWall: () => void;
  onOpenBoard: () => void;
  onOpenAuth: () => void;
  onLogout: () => Promise<void>;
}

export function EyecandyHeader({
  scrolled,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  session,
  savedCount,
  onLogoClick,
  onShuffleWall,
  onOpenBoard,
  onOpenAuth,
  onLogout,
}: EyecandyHeaderProps) {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogoutClick = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-[60] h-[clamp(60px,3.8vw,80px)] px-4 transition-colors duration-200 ease-out sm:px-7 xl:px-10 ${
        scrolled
          ? "border-b border-white/[0.08] bg-[#0A0B0E]/95 backdrop-blur-md"
          : "bg-[#0A0B0E]/85 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex h-full w-full items-center justify-between gap-3 sm:gap-5">
        {/* 1. Left: Anodized Champagne Brass KINOFRAME. Pure-Vector Wordmark */}
        <button
          type="button"
          onClick={onLogoClick}
          className="group flex shrink-0 items-center py-1 text-left transition-opacity hover:opacity-90"
          aria-label="KINOFRAME 최상단 이동 및 무작위 재셔플"
        >
          <KinoframeLogo className="h-[clamp(19px,1.2vw,27px)] w-auto" />
        </button>

        {/* 2. Center: Slim Search Bar + Instant Random Shuffle (↻) Button */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit();
            }}
            className="relative w-full max-w-[clamp(240px,34vw,680px)]"
          >
            <button
              type="submit"
              aria-label="검색"
              className="absolute left-[clamp(12px,1vw,18px)] top-1/2 -translate-y-1/2 text-[#C89E52] transition-colors hover:text-[#D9B36A]"
            >
              <svg
                viewBox="0 0 30 30"
                className="h-[clamp(16px,1.05vw,21px)] w-[clamp(16px,1.05vw,21px)]"
                fill="currentColor"
              >
                <path d="M 13 3 C 7.489 3 3 7.489 3 13 C 3 18.511 7.489 23 13 23 C 15.397 23 17.597 22.149 19.322 20.736 L 25.293 26.707 A 1 1 0 1 0 26.707 25.293 L 20.736 19.322 C 22.149 17.597 23 15.397 23 13 C 23 7.489 18.511 3 13 3 z M 13 5 C 17.43 5 21 8.57 21 13 C 21 17.43 17.43 21 13 21 C 8.57 21 5 17.43 5 13 C 5 8.57 8.57 5 13 5 z" />
              </svg>
            </button>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder='Search "Blade Runner", "Wong Kar-wai", "Sony Bravia"...'
              aria-label="아카이브 검색"
              className="h-[clamp(38px,2.45vw,50px)] w-full rounded-full border border-white/[0.14] bg-[#111318]/95 pl-[clamp(36px,2.5vw,48px)] pr-9 text-[clamp(13px,0.85vw,16px)] text-[#F2EFE9] placeholder:text-[#7E7B74] transition-colors focus:border-[#C89E52] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="검색어 지우기"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#C8C4BC] hover:text-[#F2EFE9]"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            )}
          </form>

          {/* Random Shuffle Button (↻) */}
          <button
            type="button"
            onClick={onShuffleWall}
            aria-label="무작위 셔플"
            title="무작위 셔플"
            className="inline-flex h-[clamp(38px,2.45vw,50px)] w-[clamp(38px,2.45vw,50px)] shrink-0 items-center justify-center rounded-full border border-white/[0.14] bg-[#111318] text-[#F2EFE9] transition-colors hover:border-[#C89E52] hover:bg-[#C89E52] hover:text-[#0A0B0E]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[clamp(17px,1.1vw,22px)] w-[clamp(17px,1.1vw,22px)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5"
              />
            </svg>
          </button>
        </div>

        {/* 3. Right: Strictly 1 button when logged out ('로그인'), strictly 2 buttons when logged in ('내 보드' + '로그아웃') */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {session.authenticated && session.user ? (
            <>
              <button
                type="button"
                onClick={onOpenBoard}
                aria-label="내 보드 열기"
                className="inline-flex h-[clamp(38px,2.45vw,50px)] items-center justify-center gap-2 rounded-full bg-[#C89E52] px-[clamp(14px,1.15vw,24px)] text-[clamp(13px,0.85vw,16px)] font-semibold text-[#0A0B0E] transition-colors hover:bg-[#D9B36A]"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[clamp(16px,1.05vw,21px)] w-[clamp(16px,1.05vw,21px)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 4h14a1 1 0 0 1 1 1v16l-8-4.5L4 21V5a1 1 0 0 1 1-1z"
                  />
                </svg>
                <span>내 보드</span>
                {savedCount > 0 && (
                  <span className="inline-flex h-[clamp(19px,1.15vw,24px)] min-w-[clamp(19px,1.15vw,24px)] items-center justify-center rounded-full bg-[#0A0B0E]/20 px-1.5 font-mono text-[clamp(11px,0.7vw,13px)] font-bold leading-none text-[#0A0B0E]">
                    {savedCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={handleLogoutClick}
                disabled={loggingOut}
                aria-label="로그아웃"
                className="inline-flex h-[clamp(38px,2.45vw,50px)] items-center justify-center rounded-full border border-white/[0.16] bg-[#111318] px-[clamp(14px,1.1vw,22px)] text-[clamp(13px,0.85vw,16px)] font-medium text-[#F2EFE9] transition-colors hover:border-[#C89E52] hover:text-[#C89E52] disabled:opacity-50"
              >
                {loggingOut ? "로그아웃..." : "로그아웃"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              aria-label="로그인"
              className="inline-flex h-[clamp(38px,2.45vw,50px)] items-center justify-center gap-2 rounded-full bg-[#C89E52] px-[clamp(16px,1.25vw,26px)] text-[clamp(13px,0.85vw,16px)] font-semibold text-[#0A0B0E] transition-colors hover:bg-[#D9B36A]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[clamp(16px,1.05vw,21px)] w-[clamp(16px,1.05vw,21px)]"
                fill="currentColor"
              >
                <path d="M12 12c2.9 0 5.2-2.3 5.2-5.2S14.9 1.6 12 1.6 6.8 3.9 6.8 6.8 9.1 12 12 12zm0 2.2c-4.2 0-8.4 2.1-8.4 5.6v1.4c0 .7.5 1.2 1.2 1.2h14.4c.7 0 1.2-.5 1.2-1.2v-1.4c0-3.5-4.2-5.6-8.4-5.6z" />
              </svg>
              <span>로그인</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
