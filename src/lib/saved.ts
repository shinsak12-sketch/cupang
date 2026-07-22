"use client";

import { useSyncExternalStore } from "react";

/** 상품찾기에서 "아이템 저장"한 후보 리스트 (기기 로컬 저장). */
export type SavedItem = {
  keyword: string;
  verdict?: string;
  margin?: string | null;
  reason?: string;
  caution?: string;
  monthlyVolume?: number | null;
  comp?: string | null;
  savedAt: number;
};

const KEY = "cupang.saved.v1";
const EMPTY: SavedItem[] = [];
const listeners = new Set<() => void>();

let cache: SavedItem[] = EMPTY;
let cacheRaw = "";

function read(): SavedItem[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = localStorage.getItem(KEY) || "[]";
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      const parsed = JSON.parse(raw);
      cache = Array.isArray(parsed) ? parsed : EMPTY;
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}

function write(items: SavedItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  cacheRaw = ""; // 다음 read에서 갱신
  listeners.forEach((l) => l());
}

export function addSaved(item: Omit<SavedItem, "savedAt">): boolean {
  const items = read();
  if (items.some((x) => x.keyword === item.keyword)) return false;
  write([{ ...item, savedAt: Date.now() }, ...items]);
  return true;
}

export function removeSaved(keyword: string) {
  write(read().filter((x) => x.keyword !== keyword));
}

export function toggleSaved(item: Omit<SavedItem, "savedAt">): boolean {
  const items = read();
  if (items.some((x) => x.keyword === item.keyword)) {
    removeSaved(item.keyword);
    return false;
  }
  addSaved(item);
  return true;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useSaved(): SavedItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
