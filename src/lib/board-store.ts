"use client";

import { useSyncExternalStore } from "react";
import { serializeBoardIds } from "@/lib/taxonomy";

/** Zero-login "내 보드": clip IDs kept in this browser (localStorage), synced across tabs. */
const STORAGE_KEY = "kinoframe.board.v1";
const MAX_BOARD_ITEMS = 200;
const EMPTY: string[] = [];

let cache: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cache = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: string[]): void {
  const normalized = serializeBoardIds(next).split(",").filter(Boolean).slice(0, MAX_BOARD_ITEMS);
  cache = normalized;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Private mode / blocked storage: the board still works for this page view.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = null;
    fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useBoardIds(): string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const boardActions = {
  toggle(id: string): boolean {
    const current = read();
    const has = current.includes(id);
    write(has ? current.filter((x) => x !== id) : [id, ...current]);
    return !has;
  },
  remove(id: string): void {
    write(read().filter((x) => x !== id));
  },
  addMany(ids: string[]): void {
    const current = read();
    write([...ids.filter((id) => !current.includes(id)), ...current]);
  },
  clear(): void {
    write([]);
  },
};

export function buildBoardShareUrl(ids: string[]): string {
  const url = new URL(window.location.origin + "/");
  url.searchParams.set("board", serializeBoardIds(ids));
  return url.toString();
}
