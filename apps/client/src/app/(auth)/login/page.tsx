import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { currentUser, setupNeeded } from "@/server/auth";
import { AuthFrame } from "../auth-frame";
import { reachOrExplain } from "../reach";
import { where } from "@/server/api";
import { readNetConfig } from "@/server/network";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function Page() {
  return <Suspense><Gate /></Suspense>;
}

async function Gate() {
  await connection();
  const down = await reachOrExplain();
  if (down) return down;
  if (await setupNeeded()) redirect("/setup");
  if (await currentUser()) redirect("/");
  const w = where();
  return <AuthFrame><LoginForm school={w.kind === "school" ? readNetConfig().serverName ?? "the school's server" : null} /></AuthFrame>;
}
