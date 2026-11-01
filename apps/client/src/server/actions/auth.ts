"use server";
import { redirect } from "next/navigation";
import type { Session } from "@stm/server/types";
import { actionUser, endSession, setSessionCookie } from "../auth";
import { api } from "../api";
import { changed, run } from "../action";
import { T } from "../tags";

export async function setupAction(input: unknown) {
  return run(async () => {
    await setSessionCookie(await api<Session>("/auth/setup", { json: input, token: null }));
    changed(T.users);
  });
}

export async function loginAction(input: unknown) {
  return run(async () => {
    const s = await api<Session & { mustChange: boolean }>("/auth/login", { json: input, token: null });
    await setSessionCookie(s);
    return { mustChange: s.mustChange };
  });
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function changePasswordAction(input: unknown) {
  return run(async () => {
    await api("/auth/password", { json: input });
    changed(T.users);
  });
}

export async function whoAmI() {
  return actionUser();
}
