"use server";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { changePasswordSchema, loginSchema, setupSchema } from "@/db/validation";
import { actionUser, checkPassword, clearFailures, currentUser, endSession, hashPassword, recordFailure, startSession, throttled, ActionError } from "../auth";
import { logActivity } from "../activity";
import { changed, nowIso, run } from "../action";
import { T } from "../tags";

export async function setupAction(input: unknown) {
  return run(async () => {
    const v = setupSchema.parse(input);
    if (db().select({ n: count() }).from(users).get()!.n > 0) throw new ActionError("A director account already exists. Please sign in.");
    const u = db().insert(users).values({ username: v.username, displayName: v.displayName, role: "director", passwordHash: hashPassword(v.password) }).returning({ id: users.id }).get();
    logActivity(v.displayName, "account", "Created the director account");
    await startSession(u.id, false);
    changed(T.users);
  });
}

export async function loginAction(input: unknown) {
  return run(async () => {
    const v = loginSchema.parse(input);
    const wait = throttled(v.username);
    if (wait) throw new ActionError(`Too many wrong passwords. Try again in ${Math.ceil(wait / 1000)} seconds.`);
    const u = db().select().from(users).where(eq(users.username, v.username)).get();
    if (!u || !u.active || !checkPassword(v.password, u.passwordHash)) {
      recordFailure(v.username);
      throw new ActionError("That username and password don't match.");
    }
    clearFailures(v.username);
    db().update(users).set({ lastLoginAt: nowIso() }).where(eq(users.id, u.id)).run();
    await startSession(u.id, v.remember);
    logActivity(u.displayName, "sign-in", "Signed in");
    return { mustChange: u.mustChangePassword };
  });
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function changePasswordAction(input: unknown) {
  return run(async () => {
    const me = await currentUser();
    if (!me) throw new ActionError("Your session ended. Sign in again.");
    const v = changePasswordSchema.parse(input);
    const row = db().select().from(users).where(eq(users.id, me.id)).get()!;
    if (!checkPassword(v.current, row.passwordHash)) throw new ActionError("Your current password is not correct.");
    db().update(users).set({ passwordHash: hashPassword(v.next), mustChangePassword: false }).where(eq(users.id, me.id)).run();
    logActivity(me.displayName, "account", "Changed own password");
    changed(T.users);
  });
}

export async function whoAmI() {
  return actionUser();
}
