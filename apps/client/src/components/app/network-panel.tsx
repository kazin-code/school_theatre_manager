"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Laptop, Search, Server, Unplug, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill } from "@/components/app/bits";
import { checkAddressAction, connectAction, copyToServerAction, findServersAction, workOfflineAction, type Found } from "@/server/actions/network";

export type NetState = { kind: "fixed" | "school" | "local"; url: string | null; name: string | null; reachable: boolean };

/** Settings → School network (also the /connect page on a new computer). */
export function NetworkPanel({ net, canCopy }: { net: NetState; canCopy: boolean }) {
  const [busy, start] = useTransition();
  const [found, setFound] = useState<Found[] | null>(null);
  const [address, setAddress] = useState("");
  const [offline, setOffline] = useState(false);
  const [copyTo, setCopyTo] = useState<Found | null>(null);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [copying, setCopying] = useState(false);

  const search = () => start(async () => {
    const r = await findServersAction();
    if (!r.ok) return void toast.error(r.error);
    setFound(r.data);
    if (!r.data.length) toast.info("No server answered. Ask your IT team for the server's address and type it below.");
  });
  const check = () => start(async () => {
    const r = await checkAddressAction(address);
    if (!r.ok) return void toast.error(r.error);
    setFound((f) => [r.data, ...(f ?? []).filter((x) => x.url !== r.data.url)]);
  });
  const connect = (s: Found) => start(async () => {
    const r = await connectAction(s.url);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Connected to ${r.data.name}. Sign in with your account on the school's server.`);
    window.location.assign(new URL("/login", window.location.href));
  });
  const goOffline = () => start(async () => {
    const r = await workOfflineAction();
    if (!r.ok) return void toast.error(r.error);
    toast.success("Working offline on this computer's own records. Sign in with your account on this computer.");
    window.location.assign(new URL("/login", window.location.href));
  });
  const copy = async () => {
    if (!copyTo) return;
    setCopying(true);
    const r = await copyToServerAction(copyTo.url, user, pass);
    setCopying(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Copied to ${r.data.name}. Sign in there with the same username and password you use on this computer.`);
    window.location.assign(new URL("/login", window.location.href));
  };

  if (net.kind === "fixed") {
    return (
      <Card><CardHeader><CardTitle>School network</CardTitle>
        <CardDescription>This copy of the app is run by your school and always uses the school&apos;s server. Nothing to set up here.</CardDescription></CardHeader></Card>
    );
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader><CardTitle>Where your records are</CardTitle>
          <CardDescription>Every computer can keep its own records, with no network needed. If your school runs a School Theatre Manager server, computers that connect to it share one set of records. This never uses the internet.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {net.kind === "local" ? (
            <div className="flex flex-wrap items-center gap-2"><Pill><Laptop className="mr-1 inline size-3.5" />This computer only</Pill><span className="text-muted-foreground">Records are kept on this computer.</span></div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {net.reachable ? <Pill tone="green"><Server className="mr-1 inline size-3.5" />School server</Pill> : <Pill tone="red">School server not answering</Pill>}
              <span>Connected to <b>{net.name ?? "the school's server"}</b> <span className="font-mono text-xs text-muted-foreground">{net.url}</span></span>
            </div>
          )}
          {net.kind === "school" && (
            <div><Button variant="outline" disabled={busy} onClick={() => setOffline(true)}><Unplug />Work offline on this computer</Button></div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{net.kind === "school" ? "Use a different school server" : "Connect to the school's server"}</CardTitle>
          <CardDescription>Search the school network, or type the address your IT team gave you (for example <span className="font-mono">school-theatre</span> or <span className="font-mono">10.0.4.20</span>).</CardDescription></CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={search}><Search />Search the school network</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && address.trim() && check()} placeholder="Server name or address" aria-label="Server address" className="max-w-xs" />
            <Button variant="outline" disabled={busy || !address.trim()} onClick={check}>Check</Button>
          </div>
          {found && found.length > 0 && (
            <ul className="grid gap-2">
              {found.map((s) => (
                <li key={s.url} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <Server className="size-5 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{s.name}{s.school && s.school !== s.name ? <span className="font-normal text-muted-foreground"> · {s.school}</span> : null}</div>
                    <div className="font-mono text-xs text-muted-foreground">{s.url} · version {s.version}</div>
                    {!s.compatible && <div className="text-xs text-destructive">This server&apos;s version doesn&apos;t match this computer&apos;s. Ask your IT team to update one of them.</div>}
                  </div>
                  {net.url === s.url && net.kind === "school" ? <Pill tone="green">In use</Pill> : (
                    <div className="flex flex-wrap gap-2">
                      {canCopy && <Button size="sm" variant="outline" disabled={busy || !s.compatible} onClick={() => { setCopyTo(s); setUser(""); setPass(""); }}><UploadCloud />Copy this computer&apos;s records there</Button>}
                      <Button size="sm" disabled={busy || !s.compatible} onClick={() => connect(s)}>Connect</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">After connecting, everyone signs in with their account on the school&apos;s server. This computer&apos;s own records stay here, untouched, for when you work offline. <Link href="/help/school-network" className="text-link underline">How to set up a school server</Link></p>
        </CardContent>
      </Card>

      <Dialog open={offline} onOpenChange={(o) => !busy && setOffline(o)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Work offline on this computer?</DialogTitle>
            <DialogDescription>You&apos;ll see the records kept on this computer, not the school&apos;s. Changes you make offline stay on this computer; they are not sent to the school&apos;s server later.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setOffline(false)}>Cancel</Button><Button disabled={busy} onClick={goOffline}>Work offline</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!copyTo} onOpenChange={(o) => !copying && !o && setCopyTo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Copy this computer&apos;s records to {copyTo?.name}</DialogTitle>
            <DialogDescription>For a new school server with nothing on it yet. Everything here (inventory, shows, rentals, programs, sponsors, photos, files and accounts) is copied, then this computer connects to the server. Type a director&apos;s username and password on the school&apos;s server. If it has no accounts yet, type a new username and password for its first director. Afterwards everyone signs in with the accounts from this computer.</DialogDescription></DialogHeader>
          <div className="grid gap-2">
            <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Director username on the school's server" aria-label="School server username" autoComplete="off" />
            <Input value={pass} onChange={(e) => setPass(e.target.value)} type="password" placeholder="Password" aria-label="School server password" autoComplete="off" />
            {copying && <p className="text-sm text-muted-foreground">Copying… this can take a few minutes with many photos.</p>}
          </div>
          <DialogFooter><Button variant="outline" disabled={copying} onClick={() => setCopyTo(null)}>Cancel</Button><Button disabled={copying || !user.trim() || !pass} onClick={copy}>Copy and connect</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
