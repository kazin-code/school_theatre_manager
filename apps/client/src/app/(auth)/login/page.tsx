import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { currentUser, setupNeeded } from "@/server/auth";
import { AuthFrame } from "../auth-frame";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function Page() {
  return <Suspense><Gate /></Suspense>;
}

async function Gate() {
  await connection();
  if (await setupNeeded()) redirect("/setup");
  if (await currentUser()) redirect("/");
  return <AuthFrame><LoginForm /></AuthFrame>;
}
