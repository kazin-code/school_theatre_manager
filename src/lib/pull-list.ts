"use client";
import { useSyncExternalStore } from "react";

/** Items set aside while browsing the inventory. Kept on this computer only. */
export type PullItem = { id: number; tag: string; name: string; category: string | null; size: string | null; photo: string | null; qty: number; max: number };
const KEY = "stm-pull-list";
let cache: PullItem[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: PullItem[] = [];

function read(): PullItem[] {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { cache = []; }
  return cache!;
}
function write(items: PullItem[]) {
  cache = items;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  listeners.forEach((l) => l());
}

export const pullList = {
  add(it: PullItem) { const cur = read(); if (cur.some((p) => p.id === it.id)) return false; write([...cur, it]); return true; },
  remove(id: number) { write(read().filter((p) => p.id !== id)); },
  setQty(id: number, qty: number) { write(read().map((p) => (p.id === id ? { ...p, qty: Math.max(1, Math.min(qty, p.max || 999)) } : p))); },
  removeMany(ids: number[]) { const s = new Set(ids); write(read().filter((p) => !s.has(p.id))); },
  clear() { write([]); },
};

export function usePullList() {
  const items = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, read, () => EMPTY);
  return { items, ...pullList };
}
