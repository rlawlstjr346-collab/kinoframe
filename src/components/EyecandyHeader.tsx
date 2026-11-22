"use client";

import React, { useEffect, useRef, useState } from "react";
import type { AuthSessionState } from "@/types/archive";
import { VISUAL_TECHNIQUES } from "@/lib/visual-techniques";

interface EyecandyHeaderProps {
  scrolled: boolean;
  showCenterSearch: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  viewMode: "home" | "sidebar" | "technique";
  activeTechniqueSlug: string | null;
  session: AuthSessionState;
  savedCount: number;
  compareCount: number;
  onGoHome: () => void;
  onToggleSidebar: () => void;
  onSelectTechnique: (slug: string) => void;
  onGoBreakdowns: () => void;
  onShuffleWall: () => void;
  onOpenBoard: () => void;
  onOpenAuth: () => void;
  onOpenCompare: () => void;
}

export function EyecandyHeader({
  scrolled,
  showCenterSearch,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  viewMode,
  activeTechniqueSlug,
  session,
  savedCount,
  compareCount,
  onGoHome,
  onToggleSidebar,
  onSelectTechnique,
  onGoBreakdowns,
  onShuffleWall,
  onOpenBoard,
  onOpenAuth,
  onOpenCompare,
}: EyecandyHeaderProps) {
  const [techDropdownOpen, setTechDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pupilOffset, setPupilOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const eyeRef = useRef<HTMLDivElement | null>(null);

  // Subtle mouse-tracking pupil animation matching Eyecandy eye symbol
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const node = eyeRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
      const dist = Math.min(3.2, Math.hypot(e.clientX - cx, e.clientY - cy) / 90);
      setPupilOffset({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
      });
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTechDropdownOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isSolidBg = scrolled || techDropdownOpen || menuOpen || viewMode !== "home";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-[60] h-16 px-4 py-3 transition-colors duration-200 ease-out sm:px-6 ${
          isSolidBg ? "bg-black" : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-full w-full items-center justify-between gap-4">
          {/* Left: Eyecandy Eye Symbol (36x36) + #fc087d KINOFRAME Wordmark */}
          <button
            type="button"
            onClick={() => {
              setTechDropdownOpen(false);
              setMenuOpen(false);
              onGoHome();
            }}
            className="flex shrink-0 items-center gap-2.5 text-left"
            aria-label="KINOFRAME 홈으로 복귀"
          >
            <div
              ref={eyeRef}
              className="relative hidden h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white sm:block"
              aria-hidden="true"
            >
              <svg viewBox="0 0 36 36" className="h-9 w-9">
                <circle cx="18" cy="18" r="18" fill="#ffffff" />
                <g
                  transform={`translate(${pupilOffset.x.toFixed(2)}, ${pupilOffset.y.toFixed(2)})`}
                >
                  <circle
                    cx="19"
                    cy="17"
                    r="10.5"
                    fill="#391d1f"
                    stroke="#53c0f9"
                    strokeWidth="6"
                  />
                  <circle cx="16.5" cy="12" r="3" fill="#ffffff" />
                </g>
              </svg>
            </div>
            <span className="text-[1.4rem] font-semibold leading-none tracking-[-0.02em] text-[#fc087d] sm:text-[2rem]">
              KINOFRAME
            </span>
          </button>

          {/* Center: 60% Slim Pill Search (Visible when scrolled past hero or in technique detail) */}
          <div className="hidden min-w-0 flex-1 justify-center md:flex">
            {showCenterSearch && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSearchSubmit();
                }}
                className="relative w-full max-w-[60%]"
              >
                <button
                  type="submit"
                  aria-label="검색"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#fc047c]"
                >
                  <svg viewBox="0 0 30 30" className="h-[18px] w-[18px]" fill="currentColor">
                    <path d="M 13 3 C 7.489 3 3 7.489 3 13 C 3 18.511 7.489 23 13 23 C 15.397 23 17.597 22.149 19.322 20.736 L 25.293 26.707 A 1 1 0 1 0 26.707 25.293 L 20.736 19.322 C 22.149 17.597 23 15.397 23 13 C 23 7.489 18.511 3 13 3 z M 13 5 C 17.43 5 21 8.57 21 13 C 21 17.43 17.43 21 13 21 C 8.57 21 5 17.43 5 13 C 5 8.57 8.57 5 13 5 z" />
                  </svg>
                </button>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder='Search "Neon Noir", "Symmetry", "도쿄", "TVCF"...'
                  aria-label="아카이브 검색"
                  className="h-[38px] w-full rounded-[32px] border border-[#fc087d] bg-black/90 pl-10 pr-8 text-[0.92rem] text-white placeholder:text-[#747474] focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    aria-label="검색어 지우기"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9b9b] hover:text-white"
                  >
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </button>
                )}
              </form>
            )}
          </div>

          {/* Right: 4 Functional #fc087d Icons (gap: 1.2rem) */}
          <div className="flex shrink-0 items-center gap-[1.2rem]">
            {/* 1. (+) Circular Technique Index Dropdown Toggle (22.4x22.4px) */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setTechDropdownOpen((prev) => !prev);
              }}
              aria-expanded={techDropdownOpen}
              aria-label="시네마 기법 인덱스 열기"
              title="All Visual Techniques"
              className="relative flex h-[22.4px] w-[22.4px] items-center justify-center rounded-full border-2 border-[#fc087d] transition-opacity hover:opacity-85"
            >
              <span
                className={`block h-[2px] w-2.5 bg-[#fc087d] transition-transform duration-200 ${
                  techDropdownOpen ? "rotate-45" : ""
                }`}
              />
              <span
                className={`absolute block h-2.5 w-[2px] bg-[#fc087d] transition-transform duration-200 ${
                  techDropdownOpen ? "rotate-45" : ""
                }`}
              />
            </button>

            {/* 2. Sidebar Filter Explorer Toggle (19.2px) */}
            <button
              type="button"
              onClick={() => {
                setTechDropdownOpen(false);
                setMenuOpen(false);
                onToggleSidebar();
              }}
              aria-pressed={viewMode === "sidebar"}
              aria-label="좌측 아코디언 사이드바 탐색기"
              title="Sidebar Explorer"
              className={`inline-flex items-center justify-center transition-opacity hover:opacity-85 ${
                viewMode === "sidebar" ? "text-white" : "text-[#fc087d]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-[19.2px] w-[19.2px]" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2.5" />
                <line x1="9" y1="4" x2="9" y2="20" />
                <line x1="5.5" y1="9" x2="7" y2="9" />
                <line x1="5.5" y1="13" x2="7" y2="13" />
              </svg>
            </button>

            {/* 3. User / Board Icon (19.2px) -> Saved Board if logged in, AuthModal if guest */}
            <button
              type="button"
              onClick={() => {
                setTechDropdownOpen(false);
                setMenuOpen(false);
                if (session.authenticated && session.user) {
                  onOpenBoard();
                } else {
                  onOpenAuth();
                }
              }}
              aria-label={
                session.authenticated && session.user ? "내 보드 열기" : "로그인"
              }
              title={
                session.authenticated && session.user
                  ? `내 보드 (${savedCount})`
                  : "로그인"
              }
              className="relative inline-flex items-center justify-center text-[#fc087d] transition-opacity hover:opacity-85"
            >
              <svg viewBox="0 0 24 24" className="h-[19.2px] w-[19.2px]" fill="currentColor">
                <path d="M12 12c2.9 0 5.2-2.3 5.2-5.2S14.9 1.6 12 1.6 6.8 3.9 6.8 6.8 9.1 12 12 12zm0 2.2c-4.2 0-8.4 2.1-8.4 5.6v1.4c0 .7.5 1.2 1.2 1.2h14.4c.7 0 1.2-.5 1.2-1.2v-1.4c0-3.5-4.2-5.6-8.4-5.6z" />
              </svg>
              {session.authenticated && savedCount > 0 && (
                <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#fc087d] px-1 font-mono text-[10px] font-bold leading-none text-black">
                  {savedCount}
                </span>
              )}
            </button>

            {/* 4. Hamburger Icon (22.4x18px, 3 pink 2px bars) */}
            <button
              type="button"
              onClick={() => {
                setTechDropdownOpen(false);
                setMenuOpen((prev) => !prev);
              }}
              aria-expanded={menuOpen}
              aria-label="전체 메뉴 열기"
              className="relative flex h-[18px] w-[22.4px] flex-col justify-between"
            >
              <span
                className={`block h-[2px] w-full bg-[#fc087d] transition-transform duration-200 ${
                  menuOpen ? "translate-y-[8px] rotate-45" : ""
                }`}
              />
              <span
                className={`block h-[2px] w-full bg-[#fc087d] transition-opacity duration-200 ${
                  menuOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`block h-[2px] w-full bg-[#fc087d] transition-transform duration-200 ${
                  menuOpen ? "-translate-y-[8px] -rotate-45" : ""
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Technique Index Dropdown Panel (triggered by (+) icon) */}
      {techDropdownOpen && (
        <div className="fixed inset-x-0 top-16 z-[55] border-b border-white/15 bg-black/98 px-6 py-8 shadow-2xl backdrop-blur-md">
          <div className="mx-auto max-w-[1200px]">
            <div className="mb-4 flex items-center justify-between border-b border-white/15 pb-3">
              <span className="text-[0.85rem] font-semibold uppercase tracking-wider text-[#fc087d]">
                ALL VISUAL TECHNIQUES ({VISUAL_TECHNIQUES.length})
              </span>
              <button
                type="button"
                onClick={() => setTechDropdownOpen(false)}
                className="text-[0.85rem] text-[#d0d0d0] hover:text-white"
              >
                CLOSE ×
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2.5">
              {VISUAL_TECHNIQUES.map((tech) => (
                <button
                  key={tech.slug}
                  type="button"
                  data-active={activeTechniqueSlug === tech.slug}
                  onClick={() => {
                    onSelectTechnique(tech.slug);
                    setTechDropdownOpen(false);
                  }}
                  className={`eyecandy-tag-link ${
                    activeTechniqueSlug === tech.slug ? "!text-[#fc087d]" : ""
                  }`}
                >
                  {tech.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen #000 Menu Overlay (triggered by Hamburger icon) */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[58] flex flex-col justify-center bg-black px-8 pt-16 sm:px-16"
          role="dialog"
          aria-modal="true"
          aria-label="KINOFRAME 전체 메뉴"
        >
          <div className="mx-auto grid w-full max-w-[1200px] gap-12 lg:grid-cols-2">
            <nav aria-label="메인 네비게이션">
              <ul className="space-y-4">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onGoHome();
                    }}
                    className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-white transition-colors hover:text-[#fc087d] sm:text-[3.2rem]"
                  >
                    Home Wall
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onToggleSidebar();
                    }}
                    className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-white transition-colors hover:text-[#fc087d] sm:text-[3.2rem]"
                  >
                    Sidebar Explorer
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onGoBreakdowns();
                    }}
                    className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-[#fbea85] transition-colors hover:text-[#fc087d] sm:text-[3.2rem]"
                  >
                    Breakdowns
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onShuffleWall();
                    }}
                    className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-white transition-colors hover:text-[#fc087d] sm:text-[3.2rem]"
                  >
                    Shuffle Wall
                  </button>
                </li>
                {session.authenticated && session.user && (
                  <>
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenBoard();
                        }}
                        className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-[#fc087d] transition-opacity hover:opacity-85 sm:text-[3.2rem]"
                      >
                        Saved Board ({savedCount})
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenCompare();
                        }}
                        className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-white transition-colors hover:text-[#fc087d] sm:text-[3.2rem]"
                      >
                        Compare ({compareCount}/2)
                      </button>
                    </li>
                  </>
                )}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenAuth();
                    }}
                    className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-[#fc087d] transition-opacity hover:opacity-85 sm:text-[3.2rem]"
                  >
                    {session.authenticated && session.user
                      ? `Account (${session.user.name})`
                      : "Login"}
                  </button>
                </li>
              </ul>
            </nav>

            <div className="flex flex-col justify-between border-t border-white/15 pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
              <div>
                <h2 className="border-b border-white pb-2 text-[1.6rem] font-normal text-white">
                  About KINOFRAME
                </h2>
                <p className="mt-5 text-[1rem] leading-[1.6] text-[#d0d0d0]">
                  KINOFRAME is a live moving-image visual library built for directors,
                  editors, cinematographers, and art directors.
                </p>
                <p className="mt-4 text-[0.95rem] leading-[1.6] text-[#9b9b9b]">
                  Public-domain direct streams from Internet Archive, Wikimedia Commons,
                  and NASA Images — stateless real-time discovery with 1-click frame
                  capture and private reference boards.
                </p>
              </div>
              <p className="mt-8 font-mono text-[12px] uppercase tracking-widest text-[#747474]">
                KINOFRAME · VISUAL TECHNIQUE ARCHIVE
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
