"use client";

import React, { useState } from "react";
import type { ArchiveItem, CountryCode, Era, MediaMode } from "@/types/archive";
import { COUNTRIES, ERAS, resolveItemCountry } from "@/lib/taxonomy";
import { VISUAL_TECHNIQUES, matchesTechnique } from "@/lib/visual-techniques";

export interface SidebarFilterSelection {
  techniques: string[];
  formats: MediaMode[];
  decades: Era[];
  regions: CountryCode[];
}

interface SidebarExplorerProps {
  allItems: ArchiveItem[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selection: SidebarFilterSelection;
  onChangeSelection: (next: SidebarFilterSelection) => void;
  onResetAll: () => void;
}

type AccordionKey = "techniques" | "format" | "decade" | "region";

const FORMAT_OPTIONS: Array<{ value: MediaMode; label: string }> = [
  { value: "MOTION", label: "Moving Video Loop" },
  { value: "STILL", label: "Archival Still" },
];

export function SidebarExplorer({
  allItems,
  searchQuery,
  onSearchChange,
  selection,
  onChangeSelection,
  onResetAll,
}: SidebarExplorerProps) {
  const [openSections, setOpenSections] = useState<Record<AccordionKey, boolean>>({
    techniques: true,
    format: false,
    decade: false,
    region: false,
  });

  const toggleSection = (key: AccordionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleValue = <T extends string>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  const hasAnySelection =
    searchQuery.trim().length > 0 ||
    selection.techniques.length > 0 ||
    selection.formats.length > 0 ||
    selection.decades.length > 0 ||
    selection.regions.length > 0;

  return (
    <aside
      aria-label="좌측 아코디언 필터 사이드바"
      className="w-full shrink-0 select-none md:w-[20%] md:min-w-[240px]"
    >
      {/* Top #fc087d Pill Search Input (.search-container.searchPage) */}
      <div className="relative w-full">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search techniques, cities, years..."
          aria-label="사이드바 아카이브 검색"
          className="h-9 w-full rounded-[2rem] border border-[#fc087d] bg-black pl-4 pr-9 text-[0.9rem] text-white placeholder:text-[#747474] focus:outline-none"
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#fc047c]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 30 30" className="h-4 w-4" fill="currentColor">
            <path d="M 13 3 C 7.489 3 3 7.489 3 13 C 3 18.511 7.489 23 13 23 C 15.397 23 17.597 22.149 19.322 20.736 L 25.293 26.707 A 1 1 0 1 0 26.707 25.293 L 20.736 19.322 C 22.149 17.597 23 15.397 23 13 C 23 7.489 18.511 3 13 3 z M 13 5 C 17.43 5 21 8.57 21 13 C 21 17.43 17.43 21 13 21 C 8.57 21 5 17.43 5 13 C 5 8.57 8.57 5 13 5 z" />
          </svg>
        </span>
      </div>

      {hasAnySelection && (
        <button
          type="button"
          onClick={onResetAll}
          className="mt-2.5 text-[0.8rem] font-medium text-[#fc087d] hover:underline"
        >
          Clear all filters
        </button>
      )}

      {/* 4 Eyecandy White-Hairline Accordions (.categories-w-cont) */}
      <div className="mt-4 text-white">
        {/* 1. Techniques */}
        <div className="border-t border-white">
          <button
            type="button"
            onClick={() => toggleSection("techniques")}
            aria-expanded={openSections.techniques}
            className="flex w-full items-center justify-between py-2 text-left text-[0.95rem] font-normal text-white"
          >
            <span>Techniques</span>
            <span className="relative block h-[15px] w-[15px]" aria-hidden="true">
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white" />
              <span
                className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white transition-transform duration-200 ease-linear ${
                  openSections.techniques ? "rotate-90" : ""
                }`}
              />
            </span>
          </button>
          <div
            className={`overflow-hidden transition-[max-height] duration-300 ease-out ${
              openSections.techniques ? "max-h-[290px]" : "max-h-0"
            }`}
          >
            <ul className="max-h-[280px] space-y-1.5 overflow-y-auto pb-2.5 pl-2">
              {VISUAL_TECHNIQUES.map((tech) => {
                const count = allItems.filter((i) => matchesTechnique(i, tech.slug)).length;
                const checked = selection.techniques.includes(tech.slug);
                return (
                  <li key={tech.slug}>
                    <label className="flex cursor-pointer items-start text-[0.9rem] leading-[1.3] text-white">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onChangeSelection({
                            ...selection,
                            techniques: toggleValue(selection.techniques, tech.slug),
                          })
                        }
                        className="mr-2 mt-[3px] accent-[#fc087d]"
                      />
                      <span>
                        {tech.label}
                        <span className="ml-1.5 text-[#d0d0d0]">({count})</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* 2. Format */}
        <div className="border-t border-white">
          <button
            type="button"
            onClick={() => toggleSection("format")}
            aria-expanded={openSections.format}
            className="flex w-full items-center justify-between py-2 text-left text-[0.95rem] font-normal text-white"
          >
            <span>Format</span>
            <span className="relative block h-[15px] w-[15px]" aria-hidden="true">
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white" />
              <span
                className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white transition-transform duration-200 ease-linear ${
                  openSections.format ? "rotate-90" : ""
                }`}
              />
            </span>
          </button>
          <div
            className={`overflow-hidden transition-[max-height] duration-300 ease-out ${
              openSections.format ? "max-h-[280px]" : "max-h-0"
            }`}
          >
            <ul className="space-y-1.5 pb-2.5 pl-2">
              {FORMAT_OPTIONS.map((fmt) => {
                const count = allItems.filter((i) =>
                  fmt.value === "MOTION"
                    ? i.mediaSource === "archive_mp4"
                    : i.mediaSource === "still_image"
                ).length;
                const checked = selection.formats.includes(fmt.value);
                return (
                  <li key={fmt.value}>
                    <label className="flex cursor-pointer items-start text-[0.9rem] leading-[1.3] text-white">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onChangeSelection({
                            ...selection,
                            formats: toggleValue(selection.formats, fmt.value),
                          })
                        }
                        className="mr-2 mt-[3px] accent-[#fc087d]"
                      />
                      <span>
                        {fmt.label}
                        <span className="ml-1.5 text-[#d0d0d0]">({count})</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* 3. Decade */}
        <div className="border-t border-white">
          <button
            type="button"
            onClick={() => toggleSection("decade")}
            aria-expanded={openSections.decade}
            className="flex w-full items-center justify-between py-2 text-left text-[0.95rem] font-normal text-white"
          >
            <span>Decade</span>
            <span className="relative block h-[15px] w-[15px]" aria-hidden="true">
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white" />
              <span
                className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white transition-transform duration-200 ease-linear ${
                  openSections.decade ? "rotate-90" : ""
                }`}
              />
            </span>
          </button>
          <div
            className={`overflow-hidden transition-[max-height] duration-300 ease-out ${
              openSections.decade ? "max-h-[280px]" : "max-h-0"
            }`}
          >
            <ul className="space-y-1.5 pb-2.5 pl-2">
              {ERAS.filter((e) => e.value !== "ALL").map((era) => {
                const eraVal = era.value as Era;
                const count = allItems.filter((i) => i.era === eraVal).length;
                const checked = selection.decades.includes(eraVal);
                return (
                  <li key={eraVal}>
                    <label className="flex cursor-pointer items-start text-[0.9rem] leading-[1.3] text-white">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onChangeSelection({
                            ...selection,
                            decades: toggleValue(selection.decades, eraVal),
                          })
                        }
                        className="mr-2 mt-[3px] accent-[#fc087d]"
                      />
                      <span>
                        {era.label}
                        <span className="ml-1.5 text-[#d0d0d0]">({count})</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* 4. Region & Tone */}
        <div className="border-b border-t border-white">
          <button
            type="button"
            onClick={() => toggleSection("region")}
            aria-expanded={openSections.region}
            className="flex w-full items-center justify-between py-2 text-left text-[0.95rem] font-normal text-white"
          >
            <span>Region &amp; Tone</span>
            <span className="relative block h-[15px] w-[15px]" aria-hidden="true">
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white" />
              <span
                className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white transition-transform duration-200 ease-linear ${
                  openSections.region ? "rotate-90" : ""
                }`}
              />
            </span>
          </button>
          <div
            className={`overflow-hidden transition-[max-height] duration-300 ease-out ${
              openSections.region ? "max-h-[280px]" : "max-h-0"
            }`}
          >
            <ul className="max-h-[260px] space-y-1.5 overflow-y-auto pb-2.5 pl-2">
              {COUNTRIES.filter((c) => c.value !== "ALL").map((c) => {
                const cVal = c.value as CountryCode;
                const count = allItems.filter(
                  (i) => resolveItemCountry(i) === cVal
                ).length;
                const checked = selection.regions.includes(cVal);
                return (
                  <li key={cVal}>
                    <label className="flex cursor-pointer items-start text-[0.9rem] leading-[1.3] text-white">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onChangeSelection({
                            ...selection,
                            regions: toggleValue(selection.regions, cVal),
                          })
                        }
                        className="mr-2 mt-[3px] accent-[#fc087d]"
                      />
                      <span>
                        {c.label}
                        <span className="ml-1.5 text-[#d0d0d0]">({count})</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </aside>
  );
}
