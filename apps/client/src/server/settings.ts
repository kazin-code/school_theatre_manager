import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { BrandInfo, Lists } from "@stm/server/types";
import { T } from "./tags";
import { api, cacheKey, revision } from "./api";

export const PRODUCT = "School Theatre Manager";
export type { BrandInfo };

async function brandingAt(rev: string): Promise<BrandInfo> {
  "use cache";
  cacheTag(T.settings);
  cacheLife("max");
  void rev;
  return api<BrandInfo>("/branding", { token: null });
}

/** The school's branding. Shown on the sign-in page too, so it needs no session. */
export async function getBranding(): Promise<BrandInfo> {
  return brandingAt(await revision());
}

async function listsAt(token: string, rev: string): Promise<Lists> {
  "use cache";
  cacheTag(T.lookups);
  cacheLife("max");
  void rev;
  return api<Lists>("/lists", { token });
}

/** All dropdown lists. */
export async function getLists(): Promise<Lists> {
  const k = await cacheKey();
  return listsAt(k.token, k.rev);
}
