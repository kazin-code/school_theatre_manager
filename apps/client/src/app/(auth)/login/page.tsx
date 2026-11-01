import { Suspense } from "react";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { users } from "@stm/core/db/schema";
import { currentUser } from "@/server/auth";
import { AuthFrame } from "../auth-frame";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function Page() {
  return <Suspense><Gate /></Suspense>;
}

async function Gate() {
  await connection();
  if (db().select({ n: count() }).from(users).get()!.n === 0) redirect("/setup");
  if (await currentUser()) redirect("/");
  return <AuthFrame><LoginForm /></AuthFrame>;
}
