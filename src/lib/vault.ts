import type {
  ArchiveItem,
  VaultBookmark,
  VaultFolder,
  VaultState,
} from "@/types/archive";

export const VALID_ARCHIVE_ITEM_ID_REGEX =
  /^KF-(?:\d{3,5}|(?:IA|WM)-[A-Za-z0-9_-]{2,48})$/;

export const CONDUIT_ITEM_ID_REGEX =
  /^KF-(?:IA|WM)-[A-Za-z0-9_-]{2,48}$/;

export const CONDUIT_SAVED_ITEMS_STORAGE_KEY =
  "kinoframe.conduit-saved-items.v1";

export function isValidArchiveItemId(id: string): boolean {
  return VALID_ARCHIVE_ITEM_ID_REGEX.test(id.trim());
}

export function isConduitItemId(id: string): boolean {
  return CONDUIT_ITEM_ID_REGEX.test(id.trim());
}

export function loadConduitSavedItems(): ArchiveItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CONDUIT_SAVED_ITEMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ArchiveItem =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as ArchiveItem).id === "string" &&
            isConduitItemId((item as ArchiveItem).id) &&
            typeof (item as ArchiveItem).thumbnailUrl === "string" &&
            typeof (item as ArchiveItem).sourceUrl === "string"
        )
    );
  } catch {
    return [];
  }
}

export function persistConduitSavedItems(items: ArchiveItem[]): void {
  if (typeof window === "undefined") return;
  try {
    const dedup = new Map<string, ArchiveItem>();
    for (const item of items) {
      if (isConduitItemId(item.id)) {
        dedup.set(item.id, item);
      }
    }
    window.localStorage.setItem(
      CONDUIT_SAVED_ITEMS_STORAGE_KEY,
      JSON.stringify(Array.from(dedup.values()).slice(-240))
    );
  } catch {
    // ignore storage quota errors
  }
}

export function saveConduitSavedItem(item: ArchiveItem): ArchiveItem[] {
  const existing = loadConduitSavedItems();
  if (!isConduitItemId(item.id)) return existing;
  const next = [...existing.filter((x) => x.id !== item.id), item];
  persistConduitSavedItems(next);
  return next;
}

export function removeConduitSavedItem(itemId: string): ArchiveItem[] {
  const existing = loadConduitSavedItems();
  const next = existing.filter((x) => x.id !== itemId);
  persistConduitSavedItems(next);
  return next;
}

export const DEFAULT_VAULT_FOLDERS: VaultFolder[] = [
  { id: "jp-vintage-cf", name: "일본 빈티지 CF" },
  { id: "rock-posters", name: "락 포스터" },
  { id: "tshirt-graphics", name: "티셔츠 그래픽" },
  { id: "classic-cinema", name: "고전영화" },
];

export const DEFAULT_VAULT_STATE: VaultState = {
  folders: DEFAULT_VAULT_FOLDERS,
  bookmarks: [],
};

function getAccountStorageKey(accountKey: string): string {
  return `kinoframe_vault_v4:${accountKey}`;
}

export function loadAccountVault(accountKey: string): VaultState {
  if (typeof window === "undefined" || !accountKey) return DEFAULT_VAULT_STATE;
  try {
    const raw = window.localStorage.getItem(getAccountStorageKey(accountKey));
    if (!raw) return DEFAULT_VAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<VaultState>;
    const folders =
      Array.isArray(parsed.folders) && parsed.folders.length > 0
        ? parsed.folders.filter(
            (f): f is VaultFolder =>
              Boolean(f && typeof f.id === "string" && typeof f.name === "string")
          )
        : DEFAULT_VAULT_FOLDERS;
    const bookmarks = Array.isArray(parsed.bookmarks)
      ? parsed.bookmarks.filter(
          (b): b is VaultBookmark =>
            Boolean(b && typeof b.itemId === "string" && typeof b.folderId === "string")
        )
      : [];
    return { folders, bookmarks };
  } catch {
    return DEFAULT_VAULT_STATE;
  }
}

export function saveAccountVault(accountKey: string, vault: VaultState): void {
  if (typeof window === "undefined" || !accountKey) return;
  try {
    window.localStorage.setItem(
      getAccountStorageKey(accountKey),
      JSON.stringify(vault)
    );
  } catch {
    // ignore storage quota errors
  }
}

export function exportVaultToFile(vault: VaultState, boardIds: string[]): void {
  const payload = {
    schema: "kinoframe.vault.v4",
    exportedAt: new Date().toISOString(),
    boardIds,
    vault,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kinoframe-boards-${new Date().toISOString().slice(0, 10)}.kinoframe.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseImportedVaultJson(
  rawText: string,
  validItemIds: Set<string>
): { vault: VaultState; boardIds: string[] } | null {
  try {
    const parsed = JSON.parse(rawText) as {
      vault?: Partial<VaultState>;
      boardIds?: string[];
    };
    const rawVault = parsed.vault ?? (parsed as Partial<VaultState>);
    const folders =
      Array.isArray(rawVault.folders) && rawVault.folders.length > 0
        ? rawVault.folders.filter(
            (f): f is VaultFolder =>
              Boolean(f && typeof f.id === "string" && typeof f.name === "string")
          )
        : DEFAULT_VAULT_FOLDERS;

    const validFolderSet = new Set(folders.map((f) => f.id));
    const fallbackFolderId = folders[0]?.id ?? DEFAULT_VAULT_FOLDERS[0].id;

    const bookmarks: VaultBookmark[] = Array.isArray(rawVault.bookmarks)
      ? rawVault.bookmarks
          .filter(
            (b): b is VaultBookmark =>
              Boolean(
                b &&
                  typeof b.itemId === "string" &&
                  isValidArchiveItemId(b.itemId) &&
                  (validItemIds.has(b.itemId) || isConduitItemId(b.itemId))
              )
          )
          .map((b) => ({
            itemId: b.itemId,
            folderId: validFolderSet.has(b.folderId)
              ? b.folderId
              : fallbackFolderId,
            timestampSec:
              typeof b.timestampSec === "number" ? b.timestampSec : null,
            memo: typeof b.memo === "string" ? b.memo.slice(0, 240) : "",
            savedAt:
              typeof b.savedAt === "string"
                ? b.savedAt
                : new Date().toISOString(),
          }))
      : [];

    const importedBoardIds = Array.isArray(parsed.boardIds)
      ? parsed.boardIds.filter(
          (id) =>
            isValidArchiveItemId(id) &&
            (validItemIds.has(id) || isConduitItemId(id))
        )
      : Array.from(new Set(bookmarks.map((b) => b.itemId)));

    return {
      vault: { folders, bookmarks },
      boardIds: importedBoardIds,
    };
  } catch {
    return null;
  }
}
