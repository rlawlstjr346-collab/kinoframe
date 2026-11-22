"use client";

import React, { useEffect, useState } from "react";
import type { AuthSessionState } from "@/types/archive";
import {
  OPTICAL_BRANCHES,
  VISUAL_TECHNIQUES,
  getTechniquesByBranch,
  type OpticalBranchSlug,
} from "@/lib/visual-techniques";

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
  onSelectBranch?: (branchSlug: OpticalBranchSlug) => void;
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
  onSelectBranch,
  onGoBreakdowns,
  onShuffleWall,
  onOpenBoard,
  onOpenAuth,
  onOpenCompare,
}: EyecandyHeaderProps) {
  const [techDropdownOpen, setTechDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openBranches, setOpenBranches] = useState<
    Record<OpticalBranchSlug, boolean>
  >({
    "optics-lens": true,
    "camera-movement": true,
    "framing-angles": true,
    "lighting-color": true,
    "editing-cf-hook": true,
  });

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

  const toggleBranch = (slug: OpticalBranchSlug) => {
    setOpenBranches((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  const isSolidBg =
    scrolled || techDropdownOpen || menuOpen || viewMode !== "home";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-[60] h-16 px-4 py-3 transition-colors duration-200 ease-out sm:px-6 ${
          isSolidBg ? "bg-black/95 backdrop-blur-md" : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-full w-full items-center justify-between gap-4">
          {/* Left: Custom 2.39:1 Anamorphic Viewfinder Symbol (34x24) + Kodak 500T Amber KINOFRAME Wordmark */}
          <button
            type="button"
            onClick={() => {
              setTechDropdownOpen(false);
              setMenuOpen(false);
              onGoHome();
            }}
            className="group flex shrink-0 items-center gap-2.5 text-left"
            aria-label="KINOFRAME 홈으로 복귀"
          >
            <svg
              viewBox="0 0 34 24"
              width="34"
              height="24"
              className="h-6 w-[34px] shrink-0"
              fill="none"
              aria-hidden="true"
            >
              {/* Outer 2.39:1 Cinemascope Frame Guide */}
              <rect
                x="1"
                y="4.5"
                width="32"
                height="15"
                rx="1.5"
                stroke="#FAF7F0"
                strokeOpacity="0.28"
                strokeWidth="1"
              />
              {/* Four-Corner Kodak 500T Amber Focus Brackets */}
              <path
                d="M1.5 9V3.5C1.5 2.4 2.4 1.5 3.5 1.5H9"
                stroke="#F3A833"
                strokeWidth="2"
                strokeLinecap="square"
              />
              <path
                d="M25 1.5H30.5C31.6 1.5 32.5 2.4 32.5 3.5V9"
                stroke="#F3A833"
                strokeWidth="2"
                strokeLinecap="square"
              />
              <path
                d="M1.5 15V20.5C1.5 21.6 2.4 22.5 3.5 22.5H9"
                stroke="#F3A833"
                strokeWidth="2"
                strokeLinecap="square"
              />
              <path
                d="M25 22.5H30.5C31.6 22.5 32.5 21.6 32.5 20.5V15"
                stroke="#F3A833"
                strokeWidth="2"
                strokeLinecap="square"
              />
              {/* Precision Center Crosshair (#FAF7F0) */}
              <line
                x1="13"
                y1="12"
                x2="21"
                y2="12"
                stroke="#FAF7F0"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <line
                x1="17"
                y1="8.5"
                x2="17"
                y2="15.5"
                stroke="#FAF7F0"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <circle cx="17" cy="12" r="1.4" fill="#F3A833" />
            </svg>
            <span className="text-[1.35rem] font-semibold leading-none tracking-[-0.02em] text-[#F3A833] transition-colors group-hover:text-[#FFBE55] sm:text-[1.85rem]">
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
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#F3A833]"
                >
                  <svg viewBox="0 0 30 30" className="h-[18px] w-[18px]" fill="currentColor">
                    <path d="M 13 3 C 7.489 3 3 7.489 3 13 C 3 18.511 7.489 23 13 23 C 15.397 23 17.597 22.149 19.322 20.736 L 25.293 26.707 A 1 1 0 1 0 26.707 25.293 L 20.736 19.322 C 22.149 17.597 23 15.397 23 13 C 23 7.489 18.511 3 13 3 z M 13 5 C 17.43 5 21 8.57 21 13 C 21 17.43 17.43 21 13 21 C 8.57 21 5 17.43 5 13 C 5 8.57 8.57 5 13 5 z" />
                  </svg>
                </button>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder='Search "Motion Blur", "Chiaroscuro", "TVCF"...'
                  aria-label="아카이브 검색"
                  className="h-[38px] w-full rounded-[32px] border border-[#F3A833] bg-[#111318]/90 pl-10 pr-8 text-[0.92rem] text-[#FAF7F0] placeholder:text-[#7E7B74] focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    aria-label="검색어 지우기"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C8C4BC] hover:text-[#FAF7F0]"
                  >
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </button>
                )}
              </form>
            )}
          </div>

          {/* Right: 4 Functional Kodak 500T Amber Icons */}
          <div className="flex shrink-0 items-center gap-[1.2rem]">
            {/* 1. (+) Circular Optical Taxonomy Tree Dropdown Toggle */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setTechDropdownOpen((prev) => !prev);
              }}
              aria-expanded={techDropdownOpen}
              aria-label="광학 기법 트리 인덱스 열기"
              title="Optical Taxonomy Tree"
              className="relative flex h-[22.4px] w-[22.4px] items-center justify-center rounded-full border-2 border-[#F3A833] transition-opacity hover:opacity-85"
            >
              <span
                className={`block h-[2px] w-2.5 bg-[#F3A833] transition-transform duration-200 ${
                  techDropdownOpen ? "rotate-45" : ""
                }`}
              />
              <span
                className={`absolute block h-2.5 w-[2px] bg-[#F3A833] transition-transform duration-200 ${
                  techDropdownOpen ? "rotate-45" : ""
                }`}
              />
            </button>

            {/* 2. Sidebar Filter Explorer Toggle */}
            <button
              type="button"
              onClick={() => {
                setTechDropdownOpen(false);
                setMenuOpen(false);
                onToggleSidebar();
              }}
              aria-pressed={viewMode === "sidebar"}
              aria-label="좌측 광학 트리 사이드바 탐색기"
              title="Sidebar Explorer"
              className={`inline-flex items-center justify-center transition-colors hover:text-[#FFBE55] ${
                viewMode === "sidebar" ? "text-[#FAF7F0]" : "text-[#F3A833]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-[19.2px] w-[19.2px]" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2.5" />
                <line x1="9" y1="4" x2="9" y2="20" />
                <line x1="5.5" y1="9" x2="7" y2="9" />
                <line x1="5.5" y1="13" x2="7" y2="13" />
              </svg>
            </button>

            {/* 3. User / Board Icon -> Saved Board if logged in, AuthModal if guest */}
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
              className="relative inline-flex items-center justify-center text-[#F3A833] transition-colors hover:text-[#FFBE55]"
            >
              <svg viewBox="0 0 24 24" className="h-[19.2px] w-[19.2px]" fill="currentColor">
                <path d="M12 12c2.9 0 5.2-2.3 5.2-5.2S14.9 1.6 12 1.6 6.8 3.9 6.8 6.8 9.1 12 12 12zm0 2.2c-4.2 0-8.4 2.1-8.4 5.6v1.4c0 .7.5 1.2 1.2 1.2h14.4c.7 0 1.2-.5 1.2-1.2v-1.4c0-3.5-4.2-5.6-8.4-5.6z" />
              </svg>
              {session.authenticated && savedCount > 0 && (
                <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F3A833] px-1 font-mono text-[10px] font-bold leading-none text-black">
                  {savedCount}
                </span>
              )}
            </button>

            {/* 4. Hamburger Icon (3 Amber 2px bars) */}
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
                className={`block h-[2px] w-full bg-[#F3A833] transition-transform duration-200 ${
                  menuOpen ? "translate-y-[8px] rotate-45" : ""
                }`}
              />
              <span
                className={`block h-[2px] w-full bg-[#F3A833] transition-opacity duration-200 ${
                  menuOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`block h-[2px] w-full bg-[#F3A833] transition-transform duration-200 ${
                  menuOpen ? "-translate-y-[8px] -rotate-45" : ""
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* 5-Branch Optical Taxonomy Tree Dropdown Panel (triggered by (+) icon) */}
      {techDropdownOpen && (
        <div className="fixed inset-x-0 top-16 z-[55] max-h-[82vh] overflow-y-auto border-b border-white/[0.12] bg-[#111318]/98 px-6 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-md">
          <div className="mx-auto max-w-[1320px]">
            <div className="mb-5 flex items-center justify-between border-b border-white/[0.12] pb-3">
              <div className="flex items-center gap-3">
                <span className="text-[0.85rem] font-semibold uppercase tracking-wider text-[#F3A833]">
                  OPTICAL TAXONOMY TREE ({OPTICAL_BRANCHES.length} BRANCHES ·{" "}
                  {VISUAL_TECHNIQUES.length} TECHNIQUES)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTechDropdownOpen(false)}
                className="text-[0.85rem] text-[#C8C4BC] transition-colors hover:text-[#FAF7F0]"
              >
                CLOSE ×
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {OPTICAL_BRANCHES.map((branch) => {
                const branchTechs = getTechniquesByBranch(branch.slug);
                const isOpen = openBranches[branch.slug];
                return (
                  <div
                    key={branch.slug}
                    className="rounded-[14px] border border-white/[0.08] bg-black/55 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (onSelectBranch) {
                            onSelectBranch(branch.slug);
                            setTechDropdownOpen(false);
                          } else {
                            toggleBranch(branch.slug);
                          }
                        }}
                        className="text-left"
                      >
                        <div className="text-[0.82rem] font-semibold uppercase tracking-wider text-[#F3A833] hover:text-[#FFBE55]">
                          {branch.label}
                        </div>
                        <div className="text-[0.75rem] text-[#7E7B74]">
                          {branch.labelKo}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleBranch(branch.slug)}
                        aria-expanded={isOpen}
                        aria-label={`${branch.label} 트리 토글`}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 font-mono text-[13px] text-[#C8C4BC] hover:border-[#F3A833] hover:text-[#F3A833]"
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                    </div>

                    {isOpen && (
                      <ul className="mt-3 space-y-1.5 border-t border-white/[0.08] pt-2.5">
                        {branchTechs.map((tech) => (
                          <li key={tech.slug}>
                            <button
                              type="button"
                              data-active={activeTechniqueSlug === tech.slug}
                              onClick={() => {
                                onSelectTechnique(tech.slug);
                                setTechDropdownOpen(false);
                              }}
                              className={`flex w-full items-baseline justify-between gap-2 rounded-[8px] px-2 py-1 text-left transition-colors hover:bg-white/[0.05] ${
                                activeTechniqueSlug === tech.slug
                                  ? "bg-[#F3A833]/15 text-[#F3A833]"
                                  : "text-[#FAF7F0]"
                              }`}
                            >
                              <span className="text-[0.83rem] font-medium">
                                {tech.label}
                              </span>
                              <span className="shrink-0 text-[0.72rem] text-[#7E7B74]">
                                {tech.labelKo}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Darkroom Menu Overlay (triggered by Hamburger icon) */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[58] flex flex-col justify-center bg-black/98 px-8 pt-16 backdrop-blur-md sm:px-16"
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
                    className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-[#FAF7F0] transition-colors hover:text-[#F3A833] sm:text-[3.2rem]"
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
                    className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-[#FAF7F0] transition-colors hover:text-[#F3A833] sm:text-[3.2rem]"
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
                    className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-[#F3A833] transition-colors hover:text-[#FFBE55] sm:text-[3.2rem]"
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
                    className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-[#FAF7F0] transition-colors hover:text-[#F3A833] sm:text-[3.2rem]"
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
                        className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-[#F3A833] transition-colors hover:text-[#FFBE55] sm:text-[3.2rem]"
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
                        className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-[#FAF7F0] transition-colors hover:text-[#F3A833] sm:text-[3.2rem]"
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
                    className="text-left text-[2.2rem] font-semibold uppercase tracking-tight text-[#F3A833] transition-colors hover:text-[#FFBE55] sm:text-[3.2rem]"
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
                <h2 className="border-b border-white/30 pb-2 text-[1.6rem] font-normal text-[#FAF7F0]">
                  About KINOFRAME
                </h2>
                <p className="mt-5 text-[1rem] leading-[1.6] text-[#C8C4BC]">
                  KINOFRAME is an optical cinema &amp; vintage TVCF moving-image
                  library built for directors, cinematographers, editors, and
                  creative directors.
                </p>
                <p className="mt-4 text-[0.95rem] leading-[1.6] text-[#7E7B74]">
                  Public-domain direct streams from Internet Archive, Wikimedia
                  Commons, and NASA Images — structured as a 5-branch optical
                  taxonomy tree with 1-click frame capture and private reference
                  boards.
                </p>
              </div>
              <p className="mt-8 font-mono text-[12px] uppercase tracking-widest text-[#7E7B74]">
                KINOFRAME · 2.39:1 OPTICAL CINEMA ARCHIVE
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
