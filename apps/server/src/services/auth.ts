import crypto from "node:crypto";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { changePasswordSchema, loginSchema, setupSchema } from "@stm/core/db/validation";
import { checkPassword, hashPassword } from "@stm/core/auth/hash";
import { db, nowIso, one, t, write } from "../db";
import { ApiError, bad } from "../errors";
import { logActivity } from "../activity";
import type { Me } from "../me";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** A new session. The raw token goes back to the client once; only its hash is stored. */
async function startSession(userId: number, remember: boolean) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + (remember ? 30 * 864e5 : 12 * 36e5));
  await db().delete(t.sessions).where(lt(t.sessions.expiresAt, nowIso()));
  await db().insert(t.sessions).values({ token: sha(token), userId, expiresAt: expires.toISOString() });
  return { token, expiresAt: expires.toISOString(), remember };
}

/** The person a session token belongs to, if it is still valid. */
export async function userFromToken(token: string | undefined | null): Promise<Me | null> {
  if (!token) return null;
  const row = await one(db()
    .select({ id: t.users.id, username: t.users.username, displayName: t.users.displayName, role: t.users.role, mustChangePassword: t.users.mustChangePassword })
    .from(t.sessions).innerJoin(t.users, eq(t.users.id, t.sessions.userId))
    .where(and(eq(t.sessions.token, sha(token)), gt(t.sessions.expiresAt, nowIso()), eq(t.users.active, true))).limit(1));
  return row ?? null;
}

export async function needsSetup() {
  return ((await one(db().select({ n: count() }).from(t.users)))?.n ?? 0) === 0;
}

export function setup(input: unknown) {
  return write(async () => {
    const v = setupSchema.parse(input);
    if (!(await needsSetup())) throw new ApiError(409, "A director account already exists. Please sign in.");
    const u = (await one(db().insert(t.users).values({ username: v.username, displayName: v.displayName, role: "director", passwordHash: hashPassword(v.password) }).returning({ id: t.users.id })))!;
    await logActivity(v.displayName, "account", "Created the director account");
    return startSession(u.id, false);
  });
}

// sign-in throttling: 5 wrong passwords in 5 minutes locks that name for a minute
const fails = new Map<string, number[]>();
function throttled(name: string): number {
  const list = (fails.get(name) || []).filter((x) => x > Date.now() - 5 * 60e3);
  fails.set(name, list);
  return list.length >= 5 ? Math.max(0, list[list.length - 1] + 60e3 - Date.now()) : 0;
}

export function login(input: unknown) {
  return write(async () => {
    const v = loginSchema.parse(input);
    const wait = throttled(v.username);
    if (wait) throw new ApiError(429, `Too many wrong passwords. Try again in ${Math.ceil(wait / 1000)} seconds.`);
    const u = await one(db().select().from(t.users).where(eq(t.users.username, v.username)).limit(1));
    if (!u || !u.active || !checkPassword(v.password, u.passwordHash)) {
      fails.set(v.username, [...(fails.get(v.username) || []), Date.now()]);
      throw new ApiError(401, "That username and password don't match.");
    }
    fails.delete(v.username);
    await db().update(t.users).set({ lastLoginAt: nowIso() }).where(eq(t.users.id, u.id));
    const s = await startSession(u.id, v.remember);
    await logActivity(u.displayName, "sign-in", "Signed in");
    return { ...s, mustChange: u.mustChangePassword };
  });
}

export function logout(token: string | undefined) {
  return write(async () => { if (token) await db().delete(t.sessions).where(eq(t.sessions.token, sha(token))); });
}

export function changePassword(me: Me, input: unknown) {
  return write(async () => {
    const v = changePasswordSchema.parse(input);
    const row = (await one(db().select().from(t.users).where(eq(t.users.id, me.id)).limit(1)))!;
    if (!checkPassword(v.current, row.passwordHash)) throw bad("Your current password is not correct.", { current: "Not correct" });
    await db().update(t.users).set({ passwordHash: hashPassword(v.next), mustChangePassword: false }).where(eq(t.users.id, me.id));
    await logActivity(me.displayName, "account", "Changed own password");
  });
}
