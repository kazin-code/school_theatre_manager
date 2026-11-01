import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { setupNeeded } from "@/server/auth";
import { AuthFrame } from "../auth-frame";
import { reachOrExplain } from "../reach";
import { where } from "@/server/api";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Create the director account" };

export default function Page() {
  return <Suspense><Gate /></Suspense>;
}

async function Gate() {
  await connection();
  const down = await reachOrExplain();
  if (down) return down;
  if (!(await setupNeeded())) redirect("/login");
  return <AuthFrame><SetupForm canConnect={where().kind === "local"} /></AuthFrame>;
}
