import { Suspense } from "react";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AuthFrame } from "../auth-frame";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Create the director account" };

export default function Page() {
  return <Suspense><Gate /></Suspense>;
}

async function Gate() {
  await connection();
  if (db().select({ n: count() }).from(users).get()!.n > 0) redirect("/login");
  return <AuthFrame><SetupForm /></AuthFrame>;
}
