"use client";

import React, { useState } from "react";
import type { ArchiveItem, CountryCode, Era } from "@/types/archive";
import {
  COUNTRIES,
  ERAS,
  resolveItemCategory,
  resolveItemCountry,
} from "@/lib/taxonomy";

export type SidebarFormatFilter = "CLASSIC_FILM" | "TVCF";

export interface SidebarFilterSelection {
  formats: SidebarFormatFilter[];
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

type MetaAccordionKey = "format" | "decade" | "region";

const FORMAT_OPTIONS: Array<{ value: SidebarFormatFilter; label: string }> = [
  { value: "CLASSIC_FILM", label: "Cinema" },
  { value: "TVCF", label: "TVCF" },
];

export function SidebarExplorer({
  allItems,
  searchQuery,
  onSearchChange,
  selection,
  onChangeSelection,
  onResetAll,
}: SidebarExplorerProps) {
  const [openMeta, setOpenMeta] = useState<Record<MetaAccordionKey, boolean>>({
    format: true,
    decade: true,
    region: false,
  });

  const toggleMeta = (key: MetaAccordionKey) => {
    setOpenMeta((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleValue = <T extends string>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  const hasAnySelection =
    searchQuery.trim().length > 0 ||
    selection.formats.length > 0 ||
    selection.decades.length > 0 ||
    selection.regions.length > 0;

  return (
    <aside
      aria-label="좌측 아카이브 필터 사이드바"
      className="w-full shrink-0 select-none md:w-[21%] md:min-w-[236px]"
    >
      {/* Top Kodak 500T Amber Pill Search Input */}
      <div className="relative w-full">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search films, brands, directors..."
          aria-label="사이드바 아카이브 검색"
          className="h-9 w-full rounded-[2rem] border border-[#F3A833] bg-[#111318] pl-4 pr-9 text-[0.9rem] text-[#FAF7F0] placeholder:text-[#7E7B74] focus:outline-none"
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#F3A833]"
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
          className="mt-2.5 text-[0.8rem] font-medium text-[#F3A833] hover:text-[#FFBE55] hover:underline"
        >
          Clear all filters
        </button>
      )}

      {/* Clean Archive Filters: Format / Decade / Region */}
      <div className="mt-4 text-[#FAF7F0]">
        {/* Format (Cinema / TVCF) */}
        <div className="border-t border-white/20">
          <button
            type="button"
            onClick={() => toggleMeta("format")}
            aria-expanded={openMeta.format}
            className="flex w-full items-center justify-between py-2.5 text-left text-[0.92rem] font-medium text-[#FAF7F0] hover:text-[#F3A833]"
          >
            <span>Format</span>
            <span className="relative block h-[14px] w-[14px]" aria-hidden="true">
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#C8C4BC]" />
              <span
                className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#C8C4BC] transition-transform duration-200 ease-linear ${
                  openMeta.format ? "rotate-90" : ""
                }`}
              />
            </span>
          </button>
          <div
            className={`overflow-hidden transition-[max-height] duration-300 ease-out ${
              openMeta.format ? "max-h-[180px]" : "max-h-0"
            }`}
          >
            <ul className="space-y-1.5 pb-3 pl-2">
              {FORMAT_OPTIONS.map((fmt) => {
                const count = allItems.filter(
                  (i) => resolveItemCategory(i) === fmt.value
                ).length;
                const checked = selection.formats.includes(fmt.value);
                return (
                  <li key={fmt.value}>
                    <label className="flex cursor-pointer items-start text-[0.88rem] leading-[1.35] text-[#FAF7F0]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onChangeSelection({
                            ...selection,
                            formats: toggleValue(selection.formats, fmt.value),
                          })
                        }
                        className="mr-2 mt-[3px] accent-[#F3A833]"
                      />
                      <span>
                        {fmt.label}
                        <span className="ml-1.5 text-[#7E7B74]">({count})</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Decade */}
        <div className="border-t border-white/20">
          <button
            type="button"
            onClick={() => toggleMeta("decade")}
            aria-expanded={openMeta.decade}
            className="flex w-full items-center justify-between py-2.5 text-left text-[0.92rem] font-medium text-[#FAF7F0] hover:text-[#F3A833]"
          >
            <span>Decade</span>
            <span className="relative block h-[14px] w-[14px]" aria-hidden="true">
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#C8C4BC]" />
              <span
                className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#C8C4BC] transition-transform duration-200 ease-linear ${
                  openMeta.decade ? "rotate-90" : ""
                }`}
              />
            </span>
          </button>
          <div
            className={`overflow-hidden transition-[max-height] duration-300 ease-out ${
              openMeta.decade ? "max-h-[240px]" : "max-h-0"
            }`}
          >
            <ul className="space-y-1.5 pb-3 pl-2">
              {ERAS.filter((e) => e.value !== "ALL").map((era) => {
                const eraVal = era.value as Era;
                const count = allItems.filter((i) => i.era === eraVal).length;
                const checked = selection.decades.includes(eraVal);
                return (
                  <li key={eraVal}>
                    <label className="flex cursor-pointer items-start text-[0.88rem] leading-[1.35] text-[#FAF7F0]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onChangeSelection({
                            ...selection,
                            decades: toggleValue(selection.decades, eraVal),
                          })
                        }
                        className="mr-2 mt-[3px] accent-[#F3A833]"
                      />
                      <span>
                        {era.label}
                        <span className="ml-1.5 text-[#7E7B74]">({count})</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Region */}
        <div className="border-b border-t border-white/20">
          <button
            type="button"
            onClick={() => toggleMeta("region")}
            aria-expanded={openMeta.region}
            className="flex w-full items-center justify-between py-2.5 text-left text-[0.92rem] font-medium text-[#FAF7F0] hover:text-[#F3A833]"
          >
            <span>Region</span>
            <span className="relative block h-[14px] w-[14px]" aria-hidden="true">
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#C8C4BC]" />
              <span
                className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#C8C4BC] transition-transform duration-200 ease-linear ${
                  openMeta.region ? "rotate-90" : ""
                }`}
              />
            </span>
          </button>
          <div
            className={`overflow-hidden transition-[max-height] duration-300 ease-out ${
              openMeta.region ? "max-h-[260px]" : "max-h-0"
            }`}
          >
            <ul className="max-h-[240px] space-y-1.5 overflow-y-auto pb-3 pl-2">
              {COUNTRIES.filter((c) => c.value !== "ALL").map((c) => {
                const cVal = c.value as CountryCode;
                const count = allItems.filter(
                  (i) => resolveItemCountry(i) === cVal
                ).length;
                const checked = selection.regions.includes(cVal);
                return (
                  <li key={cVal}>
                    <label className="flex cursor-pointer items-start text-[0.88rem] leading-[1.35] text-[#FAF7F0]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onChangeSelection({
                            ...selection,
                            regions: toggleValue(selection.regions, cVal),
                          })
                        }
                        className="mr-2 mt-[3px] accent-[#F3A833]"
                      />
                      <span>
                        {c.label}
                        <span className="ml-1.5 text-[#7E7B74]">({count})</span>
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
