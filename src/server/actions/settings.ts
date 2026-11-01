"use server";
import { writeBrandingIni } from "../branding-ini";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { lookups, sessions, users } from "@/db/schema";
import { brandingSchema, userSchema } from "@/db/validation";
import { DEFAULT_LISTS } from "@/db/seed";
import { passwordProblem } from "@/lib/password";
import { actionUser, hashPassword, ActionError } from "../auth";
import { logActivity } from "../activity";
import { changed, run } from "../action";
import { T } from "../tags";
import { dir } from "../paths";
import { writeSetting } from "../settings";
import { buildIco } from "../ico";
import { list, remove, writeFile, pjoin } from "../fsx";

export async function saveBrandingAction(input: unknown) {
  return run(async () => {
    const me = await actionUser("director");
    const b = brandingSchema.parse(input);
    writeSetting("branding", b);
    writeBrandingIni(b);
    logActivity(me.displayName, "settings", "Updated school branding");
    changed(T.settings);
  });
}

/** Logo from Settings: the browser sends a 512px PNG and a 256px PNG (for the Windows icon). */
export async function saveLogoAction(fd: FormData) {
  return run(async () => {
    const me = await actionUser("director");
    const big = fd.get("logo"), small = fd.get("icon");
    if (!(big instanceof File) || !(small instanceof File) || big.type !== "image/png") throw new ActionError("Choose a PNG, JPG, GIF or WEBP image.");
    if (big.size > 8 << 20) throw new ActionError("That logo is too large.");
    const d = dir("branding");
    for (const n of list(d)) if (/^logo\./.test(n)) remove(pjoin(d, n));
    writeFile(pjoin(d, "logo.png"), Buffer.from(await big.arrayBuffer()));
    writeFile(pjoin(d, "logo.ico"), buildIco(Buffer.from(await small.arrayBuffer())));
    logActivity(me.displayName, "settings", "Changed the school logo");
    changed(T.settings);
  });
}

export async function removeLogoAction() {
  return run(async () => {
    const me = await actionUser("director");
    const d = dir("branding");
    for (const n of list(d)) if (/^logo\./.test(n)) remove(pjoin(d, n));
    logActivity(me.displayName, "settings", "Removed the school logo");
    changed(T.settings);
  });
}

export async function saveListAction(list: string, values: string[]) {
  return run(async () => {
    const me = await actionUser("director");
    if (!(list in DEFAULT_LISTS)) throw new ActionError("Unknown list.");
    const clean = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
    db().transaction((tx) => {
      tx.delete(lookups).where(eq(lookups.list, list)).run();
      if (clean.length) tx.insert(lookups).values(clean.map((value, sort) => ({ list, value, sort }))).run();
    });
    logActivity(me.displayName, "settings", `Edited the ${list.replace(/_/g, " ")} list`);
    changed(T.lookups);
  });
}

export async function createUserAction(input: unknown) {
  return run(async () => {
    const me = await actionUser("director");
    const v = userSchema.parse(input);
    db().insert(users).values({ username: v.username, displayName: v.displayName, role: v.role, passwordHash: hashPassword(v.password), mustChangePassword: true }).run();
    logActivity(me.displayName, "account", `Added user ${v.username} (${v.role})`);
    changed(T.users);
  });
}

export async function updateUserAction(id: number, input: { displayName?: string; role?: "director" | "assistant"; active?: boolean; password?: string }) {
  return run(async () => {
    const me = await actionUser("director");
    if (id === me.id && (input.active === false || (input.role && input.role !== "director"))) throw new ActionError("You can't remove your own director access or turn off your own account.");
    const set: Partial<typeof users.$inferInsert> = {};
    if (input.displayName !== undefined) { if (!input.displayName.trim()) throw new ActionError("Enter the person's name."); set.displayName = input.displayName.trim(); }
    if (input.role) set.role = input.role;
    if (input.active !== undefined) set.active = input.active;
    if (input.password) {
      const p = passwordProblem(input.password);
      if (p) throw new ActionError(p);
      set.passwordHash = hashPassword(input.password); set.mustChangePassword = true;
    }
    if (input.role === "assistant") {
      const otherDirectors = db().select({ id: users.id }).from(users).where(and(eq(users.role, "director"), eq(users.active, true), ne(users.id, id))).all();
      if (!otherDirectors.length) throw new ActionError("There must always be at least one active director.");
    }
    db().update(users).set(set).where(eq(users.id, id)).run();
    if (input.active === false || input.password) db().delete(sessions).where(eq(sessions.userId, id)).run();
    const u = db().select({ username: users.username }).from(users).where(eq(users.id, id)).get();
    logActivity(me.displayName, "account", `Updated user ${u?.username ?? id}`);
    changed(T.users);
  });
}
