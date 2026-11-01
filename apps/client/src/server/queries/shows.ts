import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ShowDetail, ShowRow } from "@stm/server/types";
import { api, ApiFail, cacheKey } from "../api";
import { T } from "../tags";

export type { ShowDetail, ShowRow };

async function showsAt(token: string, rev: string) {
  "use cache";
  cacheTag(T.shows);
  cacheLife("max");
  void rev;
  return api<ShowRow[]>("/shows", { token });
}
export async function listShows() { const k = await cacheKey(); return showsAt(k.token, k.rev); }

async function showAt(id: number, token: string, rev: string) {
  "use cache";
  cacheTag(T.shows, T.items);
  cacheLife("max");
  void rev;
  try { return await api<ShowDetail>(`/shows/${id}`, { token }); } catch (e) { if (e instanceof ApiFail && e.status === 404) return null; throw e; }
}
export async function getShow(id: number) { const k = await cacheKey(); return showAt(id, k.token, k.rev); }
