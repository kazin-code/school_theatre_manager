import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { Me, Session } from "@stm/server/types";
import { api, ApiFail, COOKIE, sessionToken } from "./api";

export { COOKIE };
export type SessionUser = Me;

/** Keep the session token from sign-in in an httpOnly cookie. */
export async function setSessionCookie(s: Session) {
  (await cookies()).set(COOKIE, s.token, { httpOnly: true, sameSite: "strict", path: "/", ...(s.remember ? { expires: new Date(s.expiresAt) } : {}) });
}

export async function endSession() {
  const jar = await cookies();
  if (jar.get(COOKIE)) await api("/auth/logout", { method: "POST" }).catch(() => {});
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Asked of the server once per request; never cached. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = await sessionToken();
  if (!token) return null;
  await connection();
  try {
    return await api<Me>("/auth/me", { token });
  } catch (e) {
    if (e instanceof ApiFail && e.status === 401) return null;
    throw e;
  }
});

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

/** True until the first director account has been made. */
export async function setupNeeded(): Promise<boolean> {
  return (await api<{ needed: boolean }>("/setup", { token: null })).needed;
}
