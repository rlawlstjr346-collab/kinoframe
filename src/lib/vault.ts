import type { VaultBookmark, VaultFolder, VaultState } from "@/types/archive";

export const DEFAULT_VAULT_FOLDERS: VaultFolder[] = [
  { id: "hook-3s", name: "초반 3초 훅" },
  { id: "perspective", name: "1점 투시 구도" },
  { id: "vintage-color", name: "빈티지 색감" },
  { id: "campaign-ref", name: "캠페인 레퍼런스" },
];

export const DEFAULT_VAULT_STATE: VaultState = {
  folders: DEFAULT_VAULT_FOLDERS,
  bookmarks: [],
};

const STORAGE_KEY = "kinoframe_vault_v3";

export function loadLocalVault(): VaultState {
  if (typeof window === "undefined") return DEFAULT_VAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

export function saveLocalVault(vault: VaultState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
  } catch {
    // ignore quota error
  }
}

export function exportVaultToFile(vault: VaultState, boardIds: string[]): void {
  const payload = {
    schema: "kinoframe.vault.v3",
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
  a.download = `kinoframe-vault-${new Date().toISOString().slice(0, 10)}.kinoframe.json`;
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
                  validItemIds.has(b.itemId)
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
      ? parsed.boardIds.filter((id) => validItemIds.has(id))
      : Array.from(new Set(bookmarks.map((b) => b.itemId)));

    return {
      vault: { folders, bookmarks },
      boardIds: importedBoardIds,
    };
  } catch {
    return null;
  }
}
