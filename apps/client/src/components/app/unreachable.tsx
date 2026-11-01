"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw, Unplug, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { workOfflineAction } from "@/server/actions/network";

/** Shown instead of a screen when the server can't be reached. */
export function Unreachable({ school, name, url }: { school: boolean; name: string | null; url: string | null }) {
  const [busy, start] = useTransition();
  const offline = () => start(async () => {
    const r = await workOfflineAction();
    if (!r.ok) return void toast.error(r.error);
    window.location.assign(new URL("/login", window.location.href));
  });
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="grid max-w-lg gap-4 text-center">
        <WifiOff className="mx-auto size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{school ? "Can't reach the school's server" : "The app isn't answering"}</h1>
        {school ? (
          <p className="text-muted-foreground">This computer uses <b>{name ?? "the school's server"}</b> <span className="font-mono text-xs">{url}</span>, and it isn&apos;t answering. Check that this computer is connected to the school network. If the server is down, your IT team can help.</p>
        ) : (
          <p className="text-muted-foreground">The part of the app that keeps your records didn&apos;t answer. Close the app (Start menu → School Theatre Manager → Stop) and open it again.</p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.location.reload()}><RotateCcw />Try again</Button>
          {school && <Button variant="outline" disabled={busy} onClick={offline}><Unplug />Work offline on this computer</Button>}
        </div>
        {school && <p className="text-xs text-muted-foreground">Working offline shows the records kept on this computer, which are separate from the school&apos;s.</p>}
      </div>
    </div>
  );
}
