import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { api, where } from "@/server/api";
import { netState } from "@/server/net-state";
import { NetworkPanel } from "@/components/app/network-panel";
import { reachOrExplain } from "../reach";

export const metadata = { title: "Connect to the school's server" };

export default function Page() {
  return <Suspense><Gate /></Suspense>;
}

/** A new computer (no accounts yet) can connect to the school's server before anyone signs in. */
async function Gate() {
  await connection();
  const down = await reachOrExplain();
  if (down) return down;
  if (where().kind !== "local") redirect("/login");
  const fresh = (await api<{ needed: boolean }>("/setup", { token: null })).needed;
  return (
    <div className="mx-auto grid min-h-svh max-w-3xl content-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Connect to the school&apos;s server</h1>
      {fresh ? <NetworkPanel net={await netState()} canCopy={false} /> : (
        <p className="text-muted-foreground">This computer already has its own accounts. <Link href="/login" className="text-link underline">Sign in</Link> as a director, then open <b>Settings → School network</b>.</p>
      )}
      <p className="text-sm"><Link href="/setup" className="text-link underline">Back</Link></p>
    </div>
  );
}
