"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CloudUpload, Download, FolderSync, HardDriveDownload, RotateCcw, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill } from "@/components/app/bits";
import { backupInfoAction, backupNowAction, restoreCloudAction, setCloudFolderAction, syncCloudAction } from "@/server/actions/backup";
import { fmtWhen } from "@/lib/format";

type Info = Extract<Awaited<ReturnType<typeof backupInfoAction>>, { ok: true }>["data"];
const size = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const EXPORTS: [string, string][] = [["items", "Inventory"], ["show-items", "What each show used"], ["shows", "Shows with cast & crew"], ["rentals", "Rentals"], ["renters", "Renters"], ["sponsors", "Sponsors"], ["activity", "Activity log"]];

export function SystemPanels({ director }: { director: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, start] = useTransition();
  const [folder, setFolder] = useState("");
  const [restore, setRestore] = useState<null | "file" | "cloud">(null);
  const [typed, setTyped] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const load = () => start(async () => { const r = await backupInfoAction(); if (r.ok) { setInfo(r.data); setFolder(r.data.cloudFolder ?? ""); } });
  useEffect(() => { if (director) load(); }, [director]);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => start(async () => { const r = await fn(); if (!r.ok) toast.error((r as { error: string }).error); else { toast.success(done); load(); } });

  const exports = (
    <Card>
      <CardHeader><CardTitle>Spreadsheets</CardTitle><CardDescription>Download your records as CSV files that open in Excel or Google Sheets.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap gap-2">{EXPORTS.map(([k, t]) => <a key={k} href={`/api/export/${k}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download />{t}</a>)}</CardContent>
    </Card>
  );
  if (!director) return <div className="grid gap-5">{exports}<p className="text-sm text-muted-foreground">Ask a director to manage backups.</p></div>;

  async function doRestore() {
    if (restore === "cloud") {
      const r = await restoreCloudAction(typed);
      if (!r.ok) { toast.error(r.error); return; }
      // a full reload, so nothing from before the restore stays in the browser
      toast.success(`Restored, with ${r.data.files} files.`); window.location.assign(new URL("/", window.location.href)); return;
    }
    if (!file) return;
    setProgress("Uploading and restoring… don't close this window.");
    const res = await fetch("/api/backup/restore", { method: "POST", headers: { "x-confirm": typed.trim().toUpperCase() }, body: file });
    const j = await res.json().catch(() => ({ ok: false, error: "The restore didn't finish." }));
    setProgress("");
    if (!j.ok) { toast.error(j.error); return; }
    toast.success(`Restored, with ${j.files} files.`); window.location.assign(new URL("/", window.location.href));
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader><CardTitle>Cloud backup</CardTitle>
          <CardDescription>If this computer is lost or breaks, your records are safe in a folder that OneDrive, Google Drive or Dropbox keeps synced to the cloud. The app copies the database and any new photos and files there a minute or two after each change, and keeps 60 days of daily copies.</CardDescription></CardHeader>
        <CardContent className="grid gap-3">
          {info?.cloudFolder ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {info.lastCloudError ? <Pill tone="red">Not working</Pill> : <Pill tone="green">On</Pill>}
              <span>Copying to <b className="break-all">{info.mirror}</b></span>
              <span className="text-muted-foreground">{info.lastCloud ? `Last copy ${fmtWhen(info.lastCloud)}` : "No copy yet"}</span>
              {info.lastCloudError && <p className="w-full text-destructive">{info.lastCloudError}</p>}
            </div>) : <div className="text-sm"><Pill>Off</Pill> <span className="text-muted-foreground">Choose a cloud-synced folder to turn it on.</span></div>}
          {info && info.candidates.length > 0 && <div className="flex flex-wrap gap-2 text-sm"><span className="self-center text-muted-foreground">Found on this computer:</span>{info.candidates.map((c) => <Button key={c.path} size="sm" variant="outline" onClick={() => setFolder(c.path)}>{c.label}</Button>)}</div>}
          <div className="flex flex-wrap gap-2">
            <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. C:\Users\rivera\OneDrive" className="max-w-md flex-1" aria-label="Cloud folder" />
            <Button disabled={busy || !folder.trim()} onClick={() => act(() => setCloudFolderAction(folder), "Cloud backup is on. First copy made.")}><CloudUpload />{info?.cloudFolder ? "Change folder" : "Turn on"}</Button>
            {info?.cloudFolder && <><Button variant="outline" disabled={busy} onClick={() => act(() => syncCloudAction(), "Copied to the cloud folder.")}><FolderSync />Copy now</Button>
              <Button variant="ghost" disabled={busy} onClick={() => act(() => setCloudFolderAction(null), "Cloud backup turned off.")}>Turn off</Button></>}
          </div>
          {info?.cloudFolder && <Button variant="outline" className="justify-self-start" onClick={() => { setTyped(""); setRestore("cloud"); }}><RotateCcw />Restore from cloud folder…</Button>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Backups on this computer</CardTitle>
          <CardDescription>A copy of the database is made automatically every day (the last 30 are kept), and before risky changes like deleting a show. A <b>full backup</b> also includes every photo and file, in one zip you can keep on a USB drive.</CardDescription></CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => act(() => backupNowAction(true), "Full backup made. Download it below.")}><HardDriveDownload />{busy ? "Working…" : "Make a full backup"}</Button>
            <Button variant="outline" disabled={busy} onClick={() => act(() => backupNowAction(false), "Database backup made.")}>Back up the database now</Button>
            <Button variant="outline" onClick={() => { setTyped(""); setFile(null); setRestore("file"); }}><Upload />Restore from a backup file…</Button>
          </div>
          {info && (info.backups.length ? (
            <ul className="divide-y rounded-lg border text-sm">{info.backups.slice(0, 15).map((b) => (
              <li key={b.name} className="flex items-center gap-3 px-3 py-2"><span className="min-w-0 flex-1 truncate font-mono text-xs">{b.name}</span><span className="text-muted-foreground tabular">{size(b.size)}</span><span className="w-28 text-right text-muted-foreground">{fmtWhen(b.at)}</span>
                <a href={`/api/backup/download?name=${encodeURIComponent(b.name)}`} className="rounded p-1 hover:bg-muted" aria-label={`Download ${b.name}`}><Download className="size-4" /></a></li>))}</ul>)
            : <p className="text-sm text-muted-foreground">No backups yet.</p>)}
          {info && <p className="text-xs text-muted-foreground">Data folder: <span className="font-mono">{info.dataDir}</span></p>}
        </CardContent>
      </Card>

      {exports}

      <Dialog open={!!restore} onOpenChange={(o) => !o && !progress && setRestore(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{restore === "cloud" ? "Restore from the cloud folder" : "Restore from a backup file"}</DialogTitle>
            <DialogDescription>Everything in the app is replaced by the backup: inventory, shows, rentals, users and passwords. A safety copy of what&apos;s here now is saved first. You may need to sign in again.</DialogDescription></DialogHeader>
          {restore === "file" && <div className="grid gap-2"><input ref={fileInput} type="file" accept=".zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Backup file" className="text-sm" /><span className="text-xs text-muted-foreground">Choose a <b>full-backup-….zip</b> made by this app.</span></div>}
          <label className="grid gap-1.5 text-sm">Type <b>RESTORE</b> to confirm<Input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Confirm restore" /></label>
          {progress && <p className="text-sm font-medium">{progress}</p>}
          <DialogFooter><Button variant="destructive" disabled={!!progress || typed.trim().toUpperCase() !== "RESTORE" || (restore === "file" && !file)} onClick={doRestore}>Restore</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
