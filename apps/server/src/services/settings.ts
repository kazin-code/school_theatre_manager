import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, ne } from "drizzle-orm";
import { brandingSchema, userSchema, type Branding } from "@stm/core/db/validation";
import { DEFAULT_LISTS } from "@stm/core/db/seed";
import { passwordProblem } from "@stm/core/auth/password";
import { hashPassword } from "@stm/core/auth/hash";
import { db, one, t, tx, write } from "../db";
import { bad, gone } from "../errors";
import { dir } from "../files";
import { logActivity } from "../activity";
import type { Me } from "../me";

export const PRODUCT = "School Theatre Manager";

export async function readSetting<V>(key: string, fallback: V): Promise<V> {
  const row = await one(db().select().from(t.settings).where(eq(t.settings.key, key)).limit(1));
  return (row?.value as V) ?? fallback;
}
export async function writeSetting(key: string, value: unknown) {
  const at = new Date().toISOString();
  await db().insert(t.settings).values({ key, value, updatedAt: at }).onConflictDoUpdate({ target: t.settings.key, set: { value, updatedAt: at } });
}

// ---------- branding ----------
export function logoFile(): string | null {
  const d = dir("branding");
  for (const n of ["logo.png", "logo.jpg", "logo.jpeg", "logo.gif", "logo.webp"]) if (fs.existsSync(path.join(d, n))) return path.join(d, n);
  return null;
}
export type BrandInfo = Branding & { name: string; logoVersion: string | null };
export async function branding(): Promise<BrandInfo> {
  const b = await readSetting<Branding>("branding", { school: null, program: null, short: null, tagline: null, accent: null });
  const lf = logoFile();
  return { ...b, name: b.program || (b.school ? `${b.school} Theatre` : PRODUCT), logoVersion: lf ? String(Math.round(fs.statSync(lf).mtimeMs)) : null };
}
/** The Windows installer reads the school details from this file when it runs again (Keep). UTF-16 so any name works. */
export function writeBrandingIni(b: Branding) {
  const clean = (v?: string | null) => (v ?? "").replace(/[\r\n]+/g, " ").trim();
  const text = `[branding]\r\nschool=${clean(b.school)}\r\nprogram=${clean(b.program)}\r\nshort=${clean(b.short)}\r\ntagline=${clean(b.tagline)}\r\n`;
  fs.writeFileSync(path.join(dir("branding"), "branding.ini"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
}
export function saveBranding(me: Me, input: unknown) {
  return write(async () => {
    const b = brandingSchema.parse(input);
    await writeSetting("branding", b);
    writeBrandingIni(b);
    await logActivity(me.displayName, "settings", "Updated school branding");
  });
}
/** Wrap a PNG in an ICO file (Windows uses it for shortcuts). */
function buildIco(png: Buffer) {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(w >= 256 ? 0 : w, 6); head.writeUInt8(h >= 256 ? 0 : h, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}
/** Logo from Settings: the browser sends a 512px PNG ("logo") and a 256px PNG ("icon"). */
export function saveLogo(me: Me, big: unknown, small: unknown) {
  return write(async () => {
    if (!(big instanceof File) || !(small instanceof File) || big.type !== "image/png") throw bad("Choose a PNG, JPG, GIF or WEBP image.");
    if (big.size > 8 << 20) throw bad("That logo is too large.");
    const d = dir("branding");
    for (const n of fs.readdirSync(d)) if (/^logo\./.test(n)) fs.rmSync(path.join(d, n), { force: true });
    fs.writeFileSync(path.join(d, "logo.png"), Buffer.from(await big.arrayBuffer()));
    fs.writeFileSync(path.join(d, "logo.ico"), buildIco(Buffer.from(await small.arrayBuffer())));
    await logActivity(me.displayName, "settings", "Changed the school logo");
  });
}
export function removeLogo(me: Me) {
  return write(async () => {
    const d = dir("branding");
    for (const n of fs.readdirSync(d)) if (/^logo\./.test(n)) fs.rmSync(path.join(d, n), { force: true });
    await logActivity(me.displayName, "settings", "Removed the school logo");
  });
}

// ---------- dropdown lists ----------
export async function lists(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const r of await db().select().from(t.lookups).orderBy(t.lookups.list, t.lookups.sort, t.lookups.value)) (out[r.list] ||= []).push(r.value);
  return out;
}
export function saveList(me: Me, list: string, values: unknown) {
  return write(async () => {
    if (!(list in DEFAULT_LISTS)) throw bad("Unknown list.");
    if (!Array.isArray(values)) throw bad("Send the list's values.");
    const clean = [...new Set(values.map((v) => String(v).trim()).filter(Boolean))].slice(0, 500);
    await tx(async (d) => {
      await d.delete(t.lookups).where(eq(t.lookups.list, list));
      if (clean.length) await d.insert(t.lookups).values(clean.map((value, sort) => ({ list, value, sort })));
    });
    await logActivity(me.displayName, "settings", `Edited the ${list.replace(/_/g, " ")} list`);
  });
}

// ---------- user accounts ----------
export async function listUsers() {
  return db().select({ id: t.users.id, username: t.users.username, displayName: t.users.displayName, role: t.users.role, active: t.users.active, mustChangePassword: t.users.mustChangePassword, lastLoginAt: t.users.lastLoginAt })
    .from(t.users).orderBy(t.users.role, t.users.username);
}
export function createUser(me: Me, input: unknown) {
  return write(async () => {
    const v = userSchema.parse(input);
    await db().insert(t.users).values({ username: v.username, displayName: v.displayName, role: v.role, passwordHash: hashPassword(v.password), mustChangePassword: true });
    await logActivity(me.displayName, "account", `Added user ${v.username} (${v.role})`);
  });
}
export function updateUser(me: Me, id: number, input: { displayName?: string; role?: "director" | "assistant"; active?: boolean; password?: string }) {
  return write(async () => {
    if (id === me.id && (input.active === false || (input.role && input.role !== "director"))) throw bad("You can't remove your own director access or turn off your own account.");
    const set: Partial<typeof t.users.$inferInsert> = {};
    if (input.displayName !== undefined) { if (!String(input.displayName).trim()) throw bad("Enter the person's name.", { displayName: "Required" }); set.displayName = String(input.displayName).trim(); }
    if (input.role) { if (input.role !== "director" && input.role !== "assistant") throw bad("Unknown role."); set.role = input.role; }
    if (input.active !== undefined) set.active = !!input.active;
    if (input.password) {
      const p = passwordProblem(String(input.password));
      if (p) throw bad(p, { password: p });
      set.passwordHash = hashPassword(String(input.password)); set.mustChangePassword = true;
    }
    if (input.role === "assistant" || input.active === false) {
      const others = await db().select({ id: t.users.id }).from(t.users).where(and(eq(t.users.role, "director"), eq(t.users.active, true), ne(t.users.id, id)));
      const target = await one(db().select({ role: t.users.role }).from(t.users).where(eq(t.users.id, id)).limit(1));
      if (target?.role === "director" && !others.length) throw bad("There must always be at least one active director.");
    }
    const u = await one(db().update(t.users).set(set).where(eq(t.users.id, id)).returning({ username: t.users.username }));
    if (!u) throw gone("That account");
    if (input.active === false || input.password) await db().delete(t.sessions).where(eq(t.sessions.userId, id));
    await logActivity(me.displayName, "account", `Updated user ${u.username}`);
  });
}

export async function activityLog(limit = 300) {
  return db().select().from(t.activity).orderBy(desc(t.activity.id)).limit(Math.min(Math.max(1, limit), 5000));
}
