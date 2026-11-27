import type { ArchiveItem } from "@/types/archive";

/** Accepts a bare array or `{ items: [...] }` and keeps only well-formed clips (shared by server and browser). */
export function normalizeCatalogPayload(raw: unknown): ArchiveItem[] {
  const list = Array.isArray(raw)
    ? raw
    : raw &&
      typeof raw === "object" &&
      Array.isArray((raw as { items?: unknown }).items)
    ? (raw as { items: unknown[] }).items
    : [];

  return list.filter(
    (entry): entry is ArchiveItem =>
      Boolean(
        entry &&
          typeof entry === "object" &&
          typeof (entry as ArchiveItem).id === "string" &&
          typeof (entry as ArchiveItem).thumbnailUrl === "string" &&
          typeof (entry as ArchiveItem).sourceUrl === "string"
      )
  );
}
