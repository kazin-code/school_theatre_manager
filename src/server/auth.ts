import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";

const ITER = 310_000;
export const COOKIE = "stm_session";

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(pw, salt, ITER, 32, "sha256");
  return `pbkdf2-sha256$${ITER}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export function checkPassword(pw: string, stored: string): boolean {
  const [alg, iter, salt, key] = stored.split("$");
  if (alg !== "pbkdf2-sha256" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = crypto.pbkdf2Sync(pw, Buffer.from(salt, "base64"), Number(iter), want.length, "sha256");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const nowIso = () => new Date().toISOString();

export async function startSession(userId: number, remember: boolean) {
  const token = crypto.randomBytes(32).toString("hex");
  const ms = remember ? 30 * 864e5 : 12 * 36e5;
  const expires = new Date(Date.now() + ms);
  db().delete(sessions).where(lt(sessions.expiresAt, nowIso())).run();
  db().insert(sessions).values({ token: sha(token), userId, expiresAt: expires.toISOString() }).run();
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "strict", path: "/", ...(remember ? { expires } : {}) });
}

export async function endSession() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) db().delete(sessions).where(eq(sessions.token, sha(t))).run();
  jar.delete(COOKIE);
}

export type SessionUser = Pick<User, "id" | "username" | "displayName" | "role" | "mustChangePassword">;

/** The signed-in user, or null. Reads the request cookie, so it is never cached. */
export async function currentUser(): Promise<SessionUser | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  await connection(); // the expiry check reads the clock, so this always runs per request
  const row = db()
    .select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, mustChangePassword: users.mustChangePassword })
    .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, sha(t)), gt(sessions.expiresAt, nowIso()), eq(users.active, true)))
    .get();
  return row ?? null;
}

/** For pages: send people to sign in, or to choose a new password, when needed. */
export async function requireUser(role?: "director"): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.mustChangePassword) redirect("/change-password");
  if (role === "director" && u.role !== "director") redirect("/?denied=1");
  return u;
}

/** For server actions: throws a friendly error instead of redirecting. */
export async function actionUser(role?: "director"): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new ActionError("Your session ended. Sign in again.");
  if (u.mustChangePassword) throw new ActionError("Choose a new password first.");
  if (role === "director" && u.role !== "director") throw new ActionError("Only a director account can do that.");
  return u;
}

export class ActionError extends Error {}

// ---------- sign-in throttling: 5 wrong passwords in 5 minutes locks that name for a minute ----------
const fails = new Map<string, number[]>();
export function throttled(name: string): number {
  const cut = Date.now() - 5 * 60e3;
  const list = (fails.get(name) || []).filter((t) => t > cut);
  fails.set(name, list);
  if (list.length >= 5) return Math.max(0, list[list.length - 1] + 60e3 - Date.now());
  return 0;
}
export const recordFailure = (name: string) => fails.set(name, [...(fails.get(name) || []), Date.now()]);
export const clearFailures = (name: string) => fails.delete(name);
