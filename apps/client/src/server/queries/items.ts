import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Dashboard, ItemDetail, ItemRow } from "@stm/server/types";
import { api, ApiFail, cacheKey } from "../api";
import { T } from "../tags";

export type { ItemDetail, ItemRow };

async function itemsAt(token: string, rev: string) {
  "use cache";
  cacheTag(T.items, T.rentals, T.shows);
  cacheLife("max");
  void rev;
  return api<ItemRow[]>("/items", { token });
}
export async function listItems() { const k = await cacheKey(); return itemsAt(k.token, k.rev); }

async function itemAt(id: number, token: string, rev: string) {
  "use cache";
  cacheTag(T.items, T.rentals, T.shows);
  cacheLife("max");
  void rev;
  try { return await api<ItemDetail>(`/items/${id}`, { token }); } catch (e) { if (e instanceof ApiFail && e.status === 404) return null; throw e; }
}
export async function getItem(id: number) { const k = await cacheKey(); return itemAt(id, k.token, k.rev); }

async function dashboardAt(token: string, rev: string) {
  "use cache";
  cacheTag(T.items, T.rentals, T.shows);
  cacheLife("max");
  void rev;
  return api<Dashboard>("/dashboard", { token });
}
export async function dashboardStats() { const k = await cacheKey(); return (await dashboardAt(k.token, k.rev)).stats; }
export async function repairList() { const k = await cacheKey(); return (await dashboardAt(k.token, k.rev)).repairs; }
