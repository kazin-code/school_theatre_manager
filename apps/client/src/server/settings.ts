import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lookups, settings } from "@stm/core/db/schema";
import type { Branding } from "@stm/core/db/validation";
import { T } from "./tags";
import { dir } from "./paths";
import { exists, stat, pjoin } from "./fsx";

export const PRODUCT = "School Theatre Manager";

export type BrandInfo = Branding & { name: string; logoVersion: string | null };

export function readSetting<V>(key: string, fallback: V): V {
  const row = db().select().from(settings).where(eq(settings.key, key)).get();
  return (row?.value as V) ?? fallback;
}
export function writeSetting(key: string, value: unknown) {
  db().insert(settings).values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date().toISOString() } }).run();
}

export function logoFile(): string | null {
  const d = dir("branding");
  for (const n of ["logo.png", "logo.jpg", "logo.jpeg", "logo.gif", "logo.webp"]) if (exists(pjoin(d, n))) return pjoin(d, n);
  return null;
}

/** The school's branding (cached; expired when Settings → School & branding is saved). */
export async function getBranding(): Promise<BrandInfo> {
  "use cache";
  cacheTag(T.settings);
  cacheLife("max");
  const b = readSetting<Branding>("branding", { school: null, program: null, short: null, tagline: null, accent: null });
  const lf = logoFile();
  return { ...b, name: b.program || (b.school ? `${b.school} Theatre` : PRODUCT), logoVersion: lf ? String(Math.round(stat(lf).mtimeMs)) : null };
}

/** All dropdown lists, plus any values already used on records so filters cover real data. */
export async function getLists(): Promise<Record<string, string[]>> {
  "use cache";
  cacheTag(T.lookups);
  cacheLife("max");
  const out: Record<string, string[]> = {};
  for (const r of db().select().from(lookups).orderBy(lookups.list, lookups.sort, lookups.value).all()) (out[r.list] ||= []).push(r.value);
  return out;
}
