"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, FileText, ImagePlus, Star, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/app/fields";
import { Empty } from "@/components/app/bits";
import { addShowFilesAction, deleteShowFileAction, photoAsCoverAction, updateShowFileAction } from "@/server/actions/shows";
import { shrinkPhoto } from "@/lib/images";
import { fmtWhen } from "@/lib/format";
import { showFileUrl } from "@/lib/urls";
import type { ShowDetail } from "@/server/queries/shows";

type F = ShowDetail["files"][number];
const size = (n: number | null) => (n == null ? "" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function FilesPanel({ showId, files, categories }: { showId: number; files: F[]; categories: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [cat, setCat] = useState(categories[0] ?? "");
  const upload = (list: FileList | null) => {
    if (!list?.length) return;
    start(async () => {
      const fd = new FormData(); fd.append("category", cat);
      for (const f of Array.from(list)) fd.append("file", f);
      const r = await addShowFilesAction(showId, "material", fd);
      if (!r.ok) toast.error(r.error); else { toast.success(`Uploaded ${list.length} file${list.length === 1 ? "" : "s"}.`); router.refresh(); }
      if (input.current) input.current.value = "";
    });
  };
  const groups = new Map<string, F[]>();
  for (const f of files) { const k = f.category || "Other"; groups.set(k, [...(groups.get(k) ?? []), f]); }
  return (
    <div className="grid gap-4" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
        <span className="text-sm">Add</span>
        <NativeSelect className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Kind of material">{categories.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
        <Button disabled={busy} onClick={() => input.current?.click()}><Upload />{busy ? "Uploading…" : "Choose files"}</Button>
        <span className="text-xs text-muted-foreground">Scripts, scores, tracks, schedules, plots: any file up to 200 MB. You can also drop files here.</span>
        <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} aria-label="Upload materials" />
      </div>
      {!files.length ? <Empty>No materials yet.</Empty> : [...groups].map(([g, fs]) => (
        <section key={g}><h3 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">{g}</h3>
          <ul className="divide-y rounded-xl border bg-card">{fs.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-3">
              <FileText className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1"><a href={showFileUrl(f.file)} target="_blank" className="font-medium break-all hover:underline">{f.originalName ?? f.file}</a>
                <div className="text-xs text-muted-foreground">{[size(f.size), fmtWhen(f.createdAt), f.createdBy].filter(Boolean).join(" · ")}</div></div>
              <NativeSelect className="hidden w-40 sm:block" value={f.category ?? ""} aria-label="Kind" onChange={(e) => start(async () => { await updateShowFileAction(f.id, { category: e.target.value }); router.refresh(); })}>{[...new Set([...categories, f.category ?? ""])].map((c) => <option key={c} value={c}>{c || "Other"}</option>)}</NativeSelect>
              <a href={showFileUrl(f.file, true)} className="rounded-md p-1.5 hover:bg-muted" aria-label={`Download ${f.originalName}`}><Download className="size-4" /></a>
              <Button size="icon-sm" variant="ghost" disabled={busy} aria-label={`Delete ${f.originalName}`} onClick={() => start(async () => { const r = await deleteShowFileAction(f.id); if (!r.ok) toast.error(r.error); router.refresh(); })}><Trash2 /></Button>
            </li>))}</ul></section>))}
    </div>
  );
}

export function PhotosPanel({ showId, photos }: { showId: number; photos: F[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [big, setBig] = useState<F | null>(null);
  const [cap, setCap] = useState("");
  const upload = (list: FileList | null) => {
    if (!list?.length) return;
    start(async () => {
      const fd = new FormData();
      for (const f of Array.from(list)) fd.append("file", await shrinkPhoto(f));
      const r = await addShowFilesAction(showId, "photo", fd);
      if (!r.ok) toast.error(r.error); else { toast.success(`Added ${list.length} photo${list.length === 1 ? "" : "s"}.`); router.refresh(); }
      if (input.current) input.current.value = "";
    });
  };
  return (
    <div className="grid gap-4" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => input.current?.click()}><ImagePlus />{busy ? "Uploading…" : "Add photos"}</Button>
        <span className="text-xs text-muted-foreground">Rehearsals, the cast, the set, opening night. Drop photos anywhere here.</span>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => upload(e.target.files)} aria-label="Add show photos" />
      </div>
      {!photos.length ? <Empty>No photos yet.</Empty> : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">{photos.map((p) => (
          <button type="button" key={p.id} onClick={() => { setBig(p); setCap(p.caption ?? ""); }} className="group overflow-hidden rounded-lg border bg-muted text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={showFileUrl(p.file)} alt={p.caption ?? ""} loading="lazy" className="aspect-[4/3] w-full object-cover" />
            {p.caption && <div className="truncate bg-card px-2 py-1 text-xs">{p.caption}</div>}
          </button>))}</div>)}
      {big && (
        <div className="fixed inset-0 z-50 grid grid-rows-[1fr_auto] bg-black/90 p-4" role="dialog" aria-label="Photo">
          <button type="button" className="grid min-h-0 place-items-center" onClick={() => setBig(null)} aria-label="Close">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={showFileUrl(big.file)} alt={big.caption ?? ""} className="max-h-full max-w-full object-contain" />
          </button>
          <form className="mx-auto flex w-full max-w-2xl flex-wrap gap-2 pt-3" onSubmit={(e) => { e.preventDefault(); start(async () => { await updateShowFileAction(big.id, { caption: cap }); toast.success("Caption saved."); router.refresh(); }); }}>
            <Input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Caption" className="flex-1 bg-white/10 text-white" aria-label="Caption" />
            <Button type="submit" variant="secondary" disabled={busy}>Save caption</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => start(async () => { const r = await photoAsCoverAction(showId, big.id); if (!r.ok) toast.error(r.error); else { toast.success("Set as the cover."); router.refresh(); } })}><Star />Use as cover</Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => start(async () => { const r = await deleteShowFileAction(big.id); if (!r.ok) toast.error(r.error); else { setBig(null); router.refresh(); } })}><Trash2 />Delete</Button>
            <Button type="button" variant="secondary" size="icon" onClick={() => setBig(null)} aria-label="Close"><X /></Button>
          </form>
        </div>
      )}
    </div>
  );
}
