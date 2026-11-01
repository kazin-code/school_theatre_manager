"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, GripVertical, ImagePlus, MoreHorizontal, Plus, Printer, Redo2, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/app/fields";
import { cn } from "@/lib/utils";
import { B, BLOCK_LABEL, BORDERS, defaultProgram, PAGE_TEMPLATES, PAPERS, PEOPLE_LABEL, PSIZES, PSTYLES, pageTemplate, sanitizeHtml, uid, type Block, type Ctx, type Doc, type Template } from "@/lib/program/model";
import { BlockView, PageView, PrintSheets } from "@/lib/program/render";
import { programToCopyAction, saveProgramAction } from "@/server/actions/programs";
import { addShowFilesAction } from "@/server/actions/shows";
import { shrinkPhoto } from "@/lib/images";
import { showFileUrl, sponsorUrl } from "@/lib/urls";
import type { Sponsor } from "@/db/schema";
import { SponsorDialog } from "../../../sponsors/sponsor-dialog";

type Pic = { id: number; file: string; kind: string; caption: string | null; originalName: string | null };
type Sel = { pi: number; bi: number } | null;
type Panel = "add" | "edit" | "style" | "pictures" | "sponsors";
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function ProgramEditor({ showId, ctx, saved, pictures, others, allSponsors, tiers, adSizes, canDelete }: {
  showId: number; ctx: Ctx; saved: Doc | null; pictures: Pic[]; others: { id: number; title: string; year: number | null; season: string | null }[];
  allSponsors: Sponsor[]; tiers: string[]; adSizes: string[]; canDelete: boolean;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<Doc>(() => saved ?? defaultProgram(ctx));
  const [rev, setRev] = useState(0); // bumps when blocks change from outside the page (undo, panel…) so editable text refreshes
  const [sel, setSel] = useState<Sel>(null);
  const [cur, setCur] = useState(0);
  const [panel, setPanel] = useState<Panel>("add");
  const [status, setStatus] = useState(saved ? "Saved" : "");
  const [over, setOver] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [print, setPrint] = useState<null | "single" | "booklet">(null);
  const [printing, setPrinting] = useState<null | "single" | "booklet">(null);
  const [more, setMore] = useState(false);
  const [addAt, setAddAt] = useState<number | null>(null);
  const [rename, setRename] = useState<{ i: number; name: string } | null>(null);
  const [sponsor, setSponsor] = useState<{ s: Sponsor | null } | null>(null);
  const undo = useRef<string[]>([]), redo = useRef<string[]>([]);
  const docRef = useRef(doc); // always the latest document; every update below sets it before calling setDoc
  const [hist, setHist] = useState({ u: 0, r: 0 });
  const syncHist = () => setHist({ u: undo.current.length, r: redo.current.length });
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typing = useRef<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pi: number; bi: number } | null>(null);
  const [, startUpload] = useTransition();

  // ---- saving ----
  const saveRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    saveRef.current = async () => {
      if (saveT.current) { clearTimeout(saveT.current); saveT.current = null; }
      const r = await saveProgramAction(showId, docRef.current);
      if (r.ok) setStatus("Saved");
      else { setStatus("Not saved: will retry"); toast.error(r.error); saveT.current = setTimeout(() => void saveRef.current(), 5000); }
    };
  }, [showId]);
  const scheduleSave = useCallback(() => { setStatus("Saving…"); if (saveT.current) clearTimeout(saveT.current); saveT.current = setTimeout(() => void saveRef.current(), 700); }, []);
  useEffect(() => { if (!saved) void saveRef.current(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const flush = () => { if (saveT.current) void saveRef.current(); }; window.addEventListener("beforeunload", flush); return () => { window.removeEventListener("beforeunload", flush); flush(); }; }, []);

  // ---- changes, undo & redo ----
  const snapshot = () => { undo.current.push(JSON.stringify(docRef.current)); if (undo.current.length > 80) undo.current.shift(); redo.current = []; syncHist(); };
  const change = (fn: (d: Doc) => void, opts: { refresh?: boolean } = {}) => {
    snapshot(); typing.current = null;
    const next = clone(docRef.current); fn(next); docRef.current = next; setDoc(next);
    if (opts.refresh !== false) setRev((r) => r + 1);
    scheduleSave();
  };
  const restore = (from: React.RefObject<string[]>, to: React.RefObject<string[]>) => {
    const s = from.current.pop(); if (!s) return;
    to.current.push(JSON.stringify(docRef.current)); const d = JSON.parse(s) as Doc;
    docRef.current = d; setDoc(d); setSel(null); setRev((r) => r + 1); syncHist(); scheduleSave();
  };
  const doUndo = () => restore(undo, redo), doRedo = () => restore(redo, undo);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("[data-edit],input,textarea,select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); doRedo(); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  /** Typing on the page: one undo step per block, no re-render of the text being typed. */
  const onText = (pi: number, bi: number) => (v: string) => {
    const key = `${pi}:${bi}`; if (typing.current !== key) { snapshot(); typing.current = key; }
    const next = clone(docRef.current), b = next.pages[pi].blocks[bi];
    if (b.type === "heading") b.text = v; else if (b.type === "text") b.html = sanitizeHtml(v);
    docRef.current = next; setDoc(next); scheduleSave();
  };
  const selBlock = sel ? doc.pages[sel.pi]?.blocks[sel.bi] : undefined;
  const setB = (patch: Partial<Block>) => change((d) => { if (sel) Object.assign(d.pages[sel.pi].blocks[sel.bi], patch); });

  // ---- layout: zoom to fit, find pages that are too full ----
  useLayoutEffect(() => {
    const el = canvas.current; if (!el) return;
    const fit = () => { const sz = PSIZES[docRef.current.size]; setZoom(Math.max(0.4, Math.min(1.1, (el.clientWidth - 24) / (sz.w * 96), (window.innerHeight - 250) / (sz.h * 96)))); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [doc.size]);
  useLayoutEffect(() => {
    const t = setTimeout(() => {
      const s = new Set<number>();
      canvas.current?.querySelectorAll<HTMLElement>(".pcontent").forEach((c) => { if (c.scrollHeight > c.clientHeight + 2) s.add(Number(c.dataset.pi)); });
      setOver((o) => (o.size === s.size && [...s].every((x) => o.has(x)) ? o : s));
    }, 120);
    return () => clearTimeout(t);
  }, [doc, zoom]);

  // ---- blocks & pages ----
  const insert = (b: Block) => {
    const at = sel ? { pi: sel.pi, bi: sel.bi + 1 } : { pi: Math.min(cur, doc.pages.length - 1), bi: doc.pages[Math.min(cur, doc.pages.length - 1)]?.blocks.length ?? 0 };
    change((d) => { if (!d.pages.length) d.pages.push({ id: uid(), name: "Page", blocks: [] }); d.pages[at.pi].blocks.splice(at.bi, 0, b); });
    setSel(at); setCur(at.pi); setPanel(b.type === "image" && b.src === "upload" ? "pictures" : "edit");
    setTimeout(() => { const el = canvas.current?.querySelector<HTMLElement>(`[data-block="${b.id}"]`); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.querySelector<HTMLElement>("[data-edit]")?.focus(); }, 80);
  };
  const blockAct = (pi: number, bi: number, a: "up" | "down" | "dup" | "del") => {
    let next: Sel = sel;
    change((d) => {
      const arr = d.pages[pi].blocks;
      if (a === "up") { if (bi > 0) { [arr[bi - 1], arr[bi]] = [arr[bi], arr[bi - 1]]; next = { pi, bi: bi - 1 }; } else if (pi > 0) { d.pages[pi - 1].blocks.push(arr.splice(bi, 1)[0]); next = { pi: pi - 1, bi: d.pages[pi - 1].blocks.length - 1 }; } }
      if (a === "down") { if (bi < arr.length - 1) { [arr[bi + 1], arr[bi]] = [arr[bi], arr[bi + 1]]; next = { pi, bi: bi + 1 }; } else if (pi < d.pages.length - 1) { d.pages[pi + 1].blocks.unshift(arr.splice(bi, 1)[0]); next = { pi: pi + 1, bi: 0 }; } }
      if (a === "dup") { arr.splice(bi + 1, 0, { ...clone(arr[bi]), id: uid() }); next = { pi, bi: bi + 1 }; }
      if (a === "del") { arr.splice(bi, 1); next = null; }
    });
    setSel(next);
  };
  const moveBlock = (from: { pi: number; bi: number }, toPi: number, toBi: number) => {
    change((d) => { const b = d.pages[from.pi].blocks.splice(from.bi, 1)[0]; if (from.pi === toPi && from.bi < toBi) toBi--; d.pages[toPi].blocks.splice(toBi, 0, b); });
    setSel({ pi: toPi, bi: toBi }); setCur(toPi);
  };
  const addPage = (kind: Template, after: number) => {
    change((d) => d.pages.splice(after + 1, 0, kind === "blank" ? { id: uid(), name: "Blank page", blocks: [] } : pageTemplate(kind, ctx)));
    setCur(after + 1); setSel(null); setAddAt(null);
    setTimeout(() => canvas.current?.querySelector(`[data-page="${after + 1}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  const pageAct = (i: number, a: "up" | "down" | "dup" | "del") => {
    change((d) => {
      const p = d.pages;
      if (a === "up" && i > 0) [p[i - 1], p[i]] = [p[i], p[i - 1]];
      if (a === "down" && i < p.length - 1) [p[i + 1], p[i]] = [p[i], p[i + 1]];
      if (a === "dup") { const c = clone(p[i]); c.id = uid(); c.name = `${c.name || "Page"} (copy)`; c.blocks.forEach((b) => (b.id = uid())); p.splice(i + 1, 0, c); }
      if (a === "del" && p.length > 1) p.splice(i, 1);
    });
    setSel(null); setCur(a === "up" ? Math.max(0, i - 1) : a === "down" || a === "dup" ? i + 1 : Math.max(0, i - 1));
    if (a === "del") toast("Page deleted.", { action: { label: "Undo", onClick: doUndo } });
  };
  const goPage = (i: number) => { setCur(i); canvas.current?.querySelector(`[data-page="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  // ---- printing ----
  useEffect(() => {
    if (!printing) return;
    document.body.classList.add("printing-program");
    const done = () => { document.body.classList.remove("printing-program"); setPrinting(null); };
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 400);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); document.body.classList.remove("printing-program"); };
  }, [printing]);

  const uploadPics = (files: FileList | null) => {
    if (!files?.length) return;
    startUpload(async () => {
      const fd = new FormData(); for (const f of Array.from(files)) fd.append("file", await shrinkPhoto(f));
      const r = await addShowFilesAction(showId, "program", fd);
      if (!r.ok) toast.error(r.error); else { toast.success(`Uploaded ${files.length} picture${files.length === 1 ? "" : "s"}.`); router.refresh(); }
    });
  };

  const n = doc.pages.length, pad = (4 - (n % 4)) % 4;
  return (
    <div className="grid gap-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        {!saved && <p className="mr-auto max-w-2xl text-sm text-muted-foreground">A standard program filled in from the show. Click any text to change it, add or move blocks and pages, and pick a style. It saves as you go.</p>}
        <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">{status}</span>
        <Button variant="outline" size="sm" onClick={doUndo} disabled={!hist.u} title="Undo (Ctrl+Z)"><Undo2 />Undo</Button>
        <Button variant="outline" size="sm" onClick={doRedo} disabled={!hist.r} title="Redo (Ctrl+Y)"><Redo2 />Redo</Button>
        <Button variant="outline" size="sm" onClick={() => setMore(true)}><MoreHorizontal />More</Button>
        <Button variant="outline" size="sm" onClick={() => setPrint("single")}><Printer />Print pages</Button>
        <Button size="sm" onClick={() => setPrint("booklet")}><Printer />Print as booklet</Button>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[170px_minmax(0,1fr)_300px]">
        {/* page list */}
        <nav className="no-print hidden gap-1 text-sm lg:sticky lg:top-4 lg:grid" aria-label="Pages">
          <div className="mb-1 text-xs text-muted-foreground">{n} page{n === 1 ? "" : "s"}{doc.size === "half" && pad ? ` (+${pad} blank when printed as a booklet)` : ""}</div>
          {doc.pages.map((p, i) => (
            <button key={p.id} type="button" onClick={() => goPage(i)} className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted", cur === i && "bg-muted font-medium", over.has(i) && "text-destructive")}>
              <span className="w-4 text-xs text-muted-foreground tabular">{i + 1}</span><span className="truncate">{p.name || "Page"}</span>{over.has(i) && <span className="ml-auto text-[10px] font-semibold uppercase">Too full</span>}
            </button>))}
          <NativeSelect className="mt-2" aria-label="Add a page" value="" onChange={(e) => e.target.value && addPage(e.target.value as Template, n - 1)}><option value="">+ Add a page…</option>{PAGE_TEMPLATES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</NativeSelect>
        </nav>

        {/* pages */}
        <div ref={canvas} className="grid min-w-0 justify-items-center gap-2 rounded-xl bg-muted/50 p-3" style={{ "--pz": zoom.toFixed(3) } as React.CSSProperties}>
          {doc.pages.map((p, pi) => (
            <div key={p.id} data-page={pi} className={cn("pwrap grid justify-items-center gap-1.5 pb-2", cur === pi && "cur", over.has(pi) && "over")} onMouseDown={(e) => { if (!(e.target as HTMLElement).closest(".pblock")) setCur(pi); }}>
              <div className="no-print flex w-full flex-wrap items-center gap-1 text-sm" style={{ maxWidth: `${PSIZES[doc.size].w * 96 * zoom}px` }}>
                <b className="tabular">{pi + 1}</b><span className="truncate text-muted-foreground">{p.name}</span>
                <span className="ml-auto flex">
                  <Button size="xs" variant="ghost" onClick={() => setRename({ i: pi, name: p.name })}>Rename</Button>
                  <Button size="icon-xs" variant="ghost" disabled={pi === 0} onClick={() => pageAct(pi, "up")} aria-label={`Move page ${pi + 1} up`}><ArrowUp /></Button>
                  <Button size="icon-xs" variant="ghost" disabled={pi === n - 1} onClick={() => pageAct(pi, "down")} aria-label={`Move page ${pi + 1} down`}><ArrowDown /></Button>
                  <Button size="icon-xs" variant="ghost" onClick={() => pageAct(pi, "dup")} aria-label={`Duplicate page ${pi + 1}`}><Copy /></Button>
                  <Button size="icon-xs" variant="ghost" disabled={n === 1} onClick={() => pageAct(pi, "del")} aria-label={`Delete page ${pi + 1}`}><Trash2 /></Button>
                </span>
              </div>
              <PageView doc={doc} ctx={ctx} page={p} index={pi}>
                {p.blocks.map((b, bi) => (
                  <div key={b.id} data-block={b.id} className={cn("pblock", sel?.pi === pi && sel.bi === bi && "sel")}
                    onMouseDown={(e) => { if ((e.target as HTMLElement).closest(".pbar")) return; if (sel?.pi !== pi || sel.bi !== bi) { setSel({ pi, bi }); setCur(pi); setPanel("edit"); } }}
                    onDragStart={(e) => { drag.current = { pi, bi }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "block"); e.currentTarget.classList.add("dragging"); }}
                    onDragEnd={(e) => { e.currentTarget.draggable = false; e.currentTarget.classList.remove("dragging"); canvas.current?.querySelectorAll(".drop-a,.drop-b").forEach((x) => x.classList.remove("drop-a", "drop-b")); drag.current = null; }}
                    onDragOver={(e) => { if (!drag.current) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); canvas.current?.querySelectorAll(".drop-a,.drop-b").forEach((x) => x.classList.remove("drop-a", "drop-b")); e.currentTarget.classList.add(e.clientY > r.top + r.height / 2 ? "drop-a" : "drop-b"); }}
                    onDrop={(e) => { if (!drag.current) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); moveBlock(drag.current, pi, bi + (e.clientY > r.top + r.height / 2 ? 1 : 0)); }}>
                    <div className="pbar">
                      <button type="button" className="pdrag" title="Drag to move" aria-label="Drag to move" onMouseDown={(e) => { (e.currentTarget.closest(".pblock") as HTMLElement).draggable = true; }}><GripVertical className="size-3" /></button>
                      <button type="button" title="Move up" aria-label="Move up" onClick={() => blockAct(pi, bi, "up")}>↑</button>
                      <button type="button" title="Move down" aria-label="Move down" onClick={() => blockAct(pi, bi, "down")}>↓</button>
                      <button type="button" title="Duplicate" aria-label="Duplicate block" onClick={() => blockAct(pi, bi, "dup")}>⧉</button>
                      <button type="button" title="Delete" aria-label="Delete block" onClick={() => blockAct(pi, bi, "del")}>✕</button>
                    </div>
                    <BlockView b={b} ctx={ctx} edit={{ rev, onText: onText(pi, bi) }} />
                  </div>))}
                {!p.blocks.length && <div className="pb-hint" style={{ marginTop: "1in" }} onDragOver={(e) => drag.current && e.preventDefault()} onDrop={(e) => { if (drag.current) { e.preventDefault(); moveBlock(drag.current, pi, 0); } }}>Empty page. Add blocks from the panel, or drag blocks here.</div>}
              </PageView>
              {over.has(pi) && <p className="no-print text-sm text-destructive">This page is too full and will be cut off. Move a block to another page, make text smaller, or use two columns.</p>}
              <Button size="xs" variant="ghost" className="no-print" onClick={() => setAddAt(pi)}><Plus />Add a page here</Button>
            </div>))}
        </div>

        {/* side panel */}
        <aside className="no-print grid gap-3 rounded-xl border bg-card p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div role="tablist" aria-label="Panel" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {(["add", "edit", "style", "pictures", "sponsors"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={panel === k} onClick={() => setPanel(k)}
                className={cn("flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize", panel === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>{k}</button>))}
          </div>
          {panel === "add" && <AddPanel where={sel ? "below the selected block" : `to the end of page ${cur + 1}`} onAdd={insert} />}
          {panel === "edit" && (selBlock && sel ? <EditPanel b={selBlock} pageNo={sel.pi + 1} ctx={ctx} doc={doc} pictures={pictures} tiers={[...new Set([...tiers, ...ctx.sponsors.map((s) => s.tier ?? "").filter(Boolean)])]} showId={showId} set={setB}
              quiet={(fn) => { const next = clone(docRef.current); fn(next.pages[sel.pi].blocks[sel.bi]); docRef.current = next; setDoc(next); scheduleSave(); }}
              onDup={() => blockAct(sel.pi, sel.bi, "dup")} onDel={() => blockAct(sel.pi, sel.bi, "del")} />
            : <p className="text-sm text-muted-foreground">Click a block on a page to change it. Text can be edited right on the page.</p>)}
          {panel === "style" && <StylePanel doc={doc} ctx={ctx} change={change} quiet={(fn) => { const next = clone(docRef.current); fn(next); docRef.current = next; setDoc(next); scheduleSave(); }} />}
          {panel === "pictures" && (
            <div className="grid gap-3">
              <label className="grid cursor-pointer justify-items-center gap-1 rounded-lg border border-dashed p-4 text-center text-sm hover:border-foreground/30"
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); uploadPics(e.dataTransfer.files); }}>
                <ImagePlus className="size-5" />Upload pictures<span className="text-xs text-muted-foreground">For this program only. Cast photos, artwork, an ad.</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => uploadPics(e.target.files)} aria-label="Upload program pictures" />
              </label>
              <p className="text-xs text-muted-foreground">{selBlock?.type === "image" ? "Click a picture to put it in the selected picture block." : "Click a picture to add it to the page."} Show photos from the Photos tab are here too.</p>
              <div className="grid grid-cols-3 gap-2">{pictures.map((x) => (
                <button key={x.id} type="button" title={x.caption ?? x.originalName ?? ""} className="overflow-hidden rounded-md border hover:ring-2 hover:ring-primary"
                  onClick={() => (selBlock?.type === "image" ? setB({ src: "upload", file: x.file }) : insert(B.image({ file: x.file })))}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={showFileUrl(x.file)} alt="" loading="lazy" className="aspect-square w-full object-cover" /><span className="block truncate px-1 text-[10px] text-muted-foreground">{x.kind === "photo" ? "Show photo" : "Uploaded"}</span>
                </button>))}</div>
            </div>)}
          {panel === "sponsors" && (
            <div className="grid gap-3">
              <p className="text-xs text-muted-foreground">Sponsors are shared by every show&apos;s program. Inactive sponsors don&apos;t appear.</p>
              <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setSponsor({ s: null })}><Plus />Add a sponsor</Button><Button size="sm" variant="outline" onClick={() => insert(B.sponsors())}>Add sponsors to the page</Button></div>
              <ul className="grid gap-1">{allSponsors.map((s) => (
                <li key={s.id}><button type="button" onClick={() => setSponsor({ s })} className={cn("flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-muted", !s.active && "opacity-50")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.logo ? <img src={sponsorUrl(s.logo)} alt="" className="size-9 rounded border bg-white object-contain" /> : <span className="grid size-9 place-items-center rounded bg-muted text-sm font-semibold">{s.name.slice(0, 1)}</span>}
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{s.name}</span><span className="block truncate text-xs text-muted-foreground">{[s.tier, s.adSize, !s.active && "off"].filter(Boolean).join(" · ")}</span></span>
                </button></li>))}</ul>
              <Link href="/sponsors" className="text-sm text-link hover:underline">All sponsors</Link>
            </div>)}
        </aside>
      </div>

      {/* dialogs */}
      <Dialog open={addAt !== null} onOpenChange={(o) => !o && setAddAt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add a page</DialogTitle><DialogDescription>Pick a ready-made page. It&apos;s filled in from the show, and you can change anything on it.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-2">{PAGE_TEMPLATES.map(([k, t]) => <Button key={k} variant="outline" onClick={() => addPage(k, addAt!)}>{t}</Button>)}</div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rename page</DialogTitle></DialogHeader>
          <Input value={rename?.name ?? ""} onChange={(e) => setRename((r) => r && { ...r, name: e.target.value })} autoFocus aria-label="Page name" maxLength={80} />
          <DialogFooter><Button onClick={() => { const r = rename!; change((d) => (d.pages[r.i].name = r.name.trim() || "Page")); setRename(null); }}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <MoreDialog open={more} onClose={() => setMore(false)} others={others} title={ctx.show.title}
        onCopy={async (from) => { const r = await programToCopyAction(from); if (!r.ok) { toast.error(r.error); return; } change((d) => Object.assign(d, r.data)); setSel(null); setMore(false); toast.success("Program copied. Undo brings the old one back."); }}
        onReset={() => { change((d) => Object.assign(d, defaultProgram(ctx))); setSel(null); setMore(false); toast.success("Started over. Undo brings the old version back."); }} />
      <Dialog open={!!print} onOpenChange={(o) => !o && setPrint(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{print === "booklet" ? "Print as a booklet" : "Print single pages"}</DialogTitle></DialogHeader>
          {over.size > 0 && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{over.size} page{over.size === 1 ? " is" : "s are"} too full and will be cut off. Fix {over.size === 1 ? "it" : "them"} first, or print anyway.</div>}
          {print === "booklet" ? (
            <div className="grid gap-2 text-sm">
              <p>Pages are arranged two to a side so the printed stack folds straight into a booklet: <b>{(n + pad) / 4} sheet{(n + pad) / 4 === 1 ? "" : "s"}</b> of {doc.size === "half" ? "letter paper (8.5 × 11 in)" : "tabloid paper (11 × 17 in)"} per program.{pad > 0 && <> <b>{pad} blank page{pad === 1 ? "" : "s"}</b> will be added before the back cover, because booklets need a multiple of 4 pages.</>}</p>
              <ol className="list-decimal space-y-1 pl-5"><li>Choose <b>{doc.size === "half" ? "Letter" : "Tabloid / 11 × 17"}</b> paper, <b>Landscape</b>.</li><li>Turn on <b>Print on both sides</b> and choose <b>Flip on short edge</b>.</li><li>Under <b>More settings</b>, set Scale to <b>100%</b> and tick <b>Background graphics</b>.</li><li>Print one copy first, fold it, and check the page order.</li></ol>
            </div>
          ) : <p className="text-sm">Each page prints on its own {PSIZES[doc.size].w} × {PSIZES[doc.size].h} in sheet. To make a PDF to email or post online, choose <b>Save as PDF</b> as the printer. Under <b>More settings</b>, tick <b>Background graphics</b> and keep Scale at <b>100%</b>.</p>}
          <DialogFooter><Button onClick={() => { setPrinting(print); setPrint(null); }}><Printer />Print</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <SponsorDialog open={!!sponsor} sponsor={sponsor?.s} tiers={tiers} adSizes={adSizes} canDelete={canDelete} onClose={() => setSponsor(null)} />
      {printing && createPortal(<div id="progprint"><PrintSheets doc={doc} ctx={ctx} mode={printing} /></div>, document.body)}
    </div>
  );
}

// ---------- panels ----------
function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1"><span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap rounded-lg border p-0.5" role="radiogroup" aria-label={label}>{options.map(([v, t]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cn("min-w-8 flex-1 rounded-md px-2 py-1 text-xs", value === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{t}</button>))}</div>
    </div>
  );
}
const SIZES: [number, string][] = [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]];
const ALIGN: [string, string][] = [["left", "Left"], ["center", "Center"], ["right", "Right"]];
const COLORS: [string, string][] = [["ink", "Text"], ["muted", "Soft"], ["accent", "Accent"]];

function AddPanel({ where, onAdd }: { where: string; onAdd: (b: Block) => void }) {
  const items: [string, string, () => Block][] = [
    ["Heading", "Big title text", () => B.heading("New heading")], ["Text", "Paragraphs, notes, thanks", () => B.text("Click to type…", { size: 3 })],
    ["Picture", "Photo, artwork or ad", () => B.image()], ["Show cover", "The show's cover picture", () => B.image({ src: "cover" })], ["School logo", "Your logo", () => B.image({ src: "logo", width: 25, maxh: 1.2 })],
    ["Show details", "Dates, venue, director", () => B.info()], ["Cast list", "Character … actor", () => B.people("cast")], ["Production team", "Director, TD, MD…", () => B.people("team")],
    ["Crew list", "Positions and names", () => B.people("crew")], ["Pit orchestra", "Instruments and players", () => B.people("pit")], ["Musical numbers", "Song list by act", () => B.songs()],
    ["Author credits", "Book, music, lyrics, based on", () => B.credits("authors")], ["Licensing notice", "Required rights wording", () => B.credits("license")], ["Sponsors", "Logos, ads and names", () => B.sponsors()],
    ["Divider", "Line or ornament", () => B.divider()], ["Space", "Breathing room", () => B.spacer()],
  ];
  return (
    <div className="grid gap-2"><p className="text-xs text-muted-foreground">Adds {where}.</p>
      <div className="grid grid-cols-2 gap-1.5">{items.map(([t, d, mk]) => (
        <button key={t} type="button" onClick={() => onAdd(mk())} className="rounded-lg border p-2 text-left hover:border-primary hover:bg-primary/5"><b className="block text-sm">{t}</b><span className="text-[11px] leading-tight text-muted-foreground">{d}</span></button>))}</div>
    </div>
  );
}

function EditPanel({ b, pageNo, ctx, doc, pictures, tiers, showId, set, quiet, onDup, onDel }: {
  b: Block; pageNo: number; ctx: Ctx; doc: Doc; pictures: Pic[]; tiers: string[]; showId: number; set: (p: Partial<Block>) => void; quiet: (fn: (b: Block) => void) => void; onDup: () => void; onDel: () => void;
}) {
  const check = (label: string, key: string, on: boolean) => <Label key={key} className="text-sm font-normal"><Checkbox checked={on} onCheckedChange={(v) => set({ [key]: !!v } as Partial<Block>)} />{label}</Label>;
  const format = (cmd: "bold" | "italic" | "underline") => (e: React.MouseEvent) => { e.preventDefault(); document.execCommand(cmd); (document.activeElement as HTMLElement | null)?.closest("[data-edit]")?.dispatchEvent(new Event("input", { bubbles: true })); };
  return (
    <div className="grid gap-3">
      <div className="text-sm"><b>{BLOCK_LABEL[b.type]}</b>{b.type === "people" && ` · ${PEOPLE_LABEL[b.kind]}`}<span className="text-muted-foreground"> on page {pageNo}</span></div>
      {b.type === "heading" && <><Seg label="Size" value={b.size} options={SIZES} onChange={(v) => set({ size: v })} /><Seg label="Line up" value={b.align} options={ALIGN as [typeof b.align, string][]} onChange={(v) => set({ align: v })} />
        <Seg label="Color" value={b.color} options={COLORS as [typeof b.color, string][]} onChange={(v) => set({ color: v })} /><Seg label="Font" value={b.font} options={[["display", "Headline"], ["body", "Body"]]} onChange={(v) => set({ font: v })} /></>}
      {b.type === "text" && <>
        <div className="grid gap-1"><span className="text-xs font-medium text-muted-foreground">Style the selected words</span><div className="flex gap-1">
          <Button size="sm" variant="outline" onMouseDown={format("bold")} aria-label="Bold"><b>B</b></Button><Button size="sm" variant="outline" onMouseDown={format("italic")} aria-label="Italic"><i>I</i></Button><Button size="sm" variant="outline" onMouseDown={format("underline")} aria-label="Underline"><u>U</u></Button></div>
          <span className="text-[11px] text-muted-foreground">Select words on the page, then click.</span></div>
        <Seg label="Size" value={b.size} options={SIZES} onChange={(v) => set({ size: v })} /><Seg label="Line up" value={b.align} options={ALIGN as [typeof b.align, string][]} onChange={(v) => set({ align: v })} /><Seg label="Color" value={b.color} options={COLORS as [typeof b.color, string][]} onChange={(v) => set({ color: v })} /></>}
      {b.type === "image" && <>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">Picture
          <NativeSelect value={b.src === "upload" ? `f:${b.file}` : b.src} onChange={(e) => { const v = e.target.value; set(v.startsWith("f:") ? { src: "upload", file: v.slice(2) } : { src: v as "logo" | "cover", file: "" }); }}>
            <option value="cover">The show&apos;s cover picture</option><option value="logo">School logo</option>{b.src === "upload" && !b.file && <option value="f:">Choose…</option>}
            {pictures.map((x) => <option key={x.id} value={`f:${x.file}`}>{x.kind === "photo" ? "Photo: " : ""}{x.caption || x.originalName || x.file}</option>)}
          </NativeSelect></label>
        <Range label={`Width (${b.width}%)`} min={10} max={100} step={5} value={b.width} onChange={(v, first) => (first ? set({ width: v }) : quiet((x) => ((x as typeof b).width = v)))} />
        <Range label={`Tallest (${b.maxh} in)`} min={0.5} max={PSIZES[doc.size].h - 1} step={0.25} value={b.maxh} onChange={(v, first) => (first ? set({ maxh: v }) : quiet((x) => ((x as typeof b).maxh = v)))} />
        <Seg label="Line up" value={b.align} options={ALIGN as [typeof b.align, string][]} onChange={(v) => set({ align: v })} />
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">Caption<Input defaultValue={b.caption} key={b.id} placeholder="Optional" onBlur={(e) => e.target.value !== b.caption && set({ caption: e.target.value.slice(0, 300) })} /></label></>}
      {b.type === "info" && <><div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">Show</span>{check("Dates", "dates", b.dates)}{check("Venue", "venue", b.venue)}{check("Director", "director", b.director)}<span className="text-[11px] text-muted-foreground">Taken from Edit show.</span></div>
        <Seg label="Size" value={b.size} options={SIZES} onChange={(v) => set({ size: v })} /><Seg label="Line up" value={b.align} options={ALIGN as [typeof b.align, string][]} onChange={(v) => set({ align: v })} /></>}
      {b.type === "people" && <>
        <Seg label="Who" value={b.kind} options={Object.entries(PEOPLE_LABEL) as [typeof b.kind, string][]} onChange={(v) => set({ kind: v })} />
        <Seg label="Layout" value={b.style} options={[["leaders", "Dotted line"], ["stacked", "Stacked"]]} onChange={(v) => set({ style: v })} />
        <Seg label="Order" value={b.order} options={[["role", b.kind === "cast" ? "Character first" : "Role first"], ["name", "Name first"]]} onChange={(v) => set({ order: v })} />
        <Seg label="Columns" value={b.cols} options={[[1, "1"], [2, "2"], [3, "3"]]} onChange={(v) => set({ cols: v })} />
        <div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">Also show</span>{b.kind === "cast" && check("Voice part", "voice", b.voice)}{check("Grade", "grade", b.grade)}</div>
        <Seg label="Size" value={b.size} options={SIZES} onChange={(v) => set({ size: v })} />
        <p className="text-[11px] text-muted-foreground">Names come from the show&apos;s Cast &amp; crew tab. People without a role are listed together at the end. <Link className="text-link underline" href={`/shows/${showId}?tab=people`}>Edit the list</Link></p></>}
      {b.type === "songs" && <><div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">Also show</span>{check("Who sings", "singers", b.singers)}</div><Seg label="Size" value={b.size} options={SIZES} onChange={(v) => set({ size: v })} />
        <p className="text-[11px] text-muted-foreground">Songs come from the show&apos;s Musical numbers tab. <Link className="text-link underline" href={`/shows/${showId}?tab=numbers`}>Edit the list</Link></p></>}
      {b.type === "sponsors" && <>
        <Seg label="Layout" value={b.layout} options={[["tiers", "Logos & ads"], ["names", "Names only"]]} onChange={(v) => set({ layout: v })} />
        <div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">Which tiers</span>{tiers.map((t) => (
          <Label key={t} className="text-sm font-normal"><Checkbox checked={!b.tiers.length || b.tiers.includes(t)} onCheckedChange={(v) => { const on = new Set(b.tiers.length ? b.tiers : tiers); if (v) on.add(t); else on.delete(t); set({ tiers: on.size === tiers.length ? [] : [...on] }); }} />{t}</Label>))}
          <span className="text-[11px] text-muted-foreground">Split tiers across pages by adding two Sponsors blocks.</span></div>
        {b.layout === "tiers" && <><div className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">Also show</span>{check("Names under logos", "names", b.names)}{check("Messages", "messages", b.messages)}</div>
          <Seg label="Logo size" value={b.scale} options={[[1, "S"], [2, "M"], [3, "L"], [4, "XL"]]} onChange={(v) => set({ scale: v })} /></>}
        <p className="text-[11px] text-muted-foreground">{ctx.sponsors.length} active sponsor{ctx.sponsors.length === 1 ? "" : "s"}.</p></>}
      {b.type === "credits" && <><Seg label="Show" value={b.part} options={[["authors", "Author credits"], ["license", "Licensing notice"]]} onChange={(v) => set({ part: v })} />
        <Seg label="Size" value={b.size} options={SIZES} onChange={(v) => set({ size: v })} /><Seg label="Line up" value={b.align} options={ALIGN as [typeof b.align, string][]} onChange={(v) => set({ align: v })} />
        <p className="text-[11px] text-muted-foreground">From the show&apos;s Authors &amp; rights. Only filled-in lines print. <Link className="text-link underline" href={`/shows/${showId}/edit`}>Edit authors &amp; rights</Link></p></>}
      {b.type === "divider" && <Seg label="Style" value={b.style} options={[["ornament", "✦ ✦ ✦"], ["line", "Line"], ["double", "Double"], ["dots", "Dots"]]} onChange={(v) => set({ style: v })} />}
      {b.type === "spacer" && <Seg label="Height" value={b.size} options={[[1, "XS"], [2, "S"], [3, "M"], [4, "L"], [6, "XL"]]} onChange={(v) => set({ size: v })} />}
      <div className="flex gap-2 border-t pt-3"><Button size="sm" variant="outline" onClick={onDup}><Copy />Duplicate</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={onDel}><X />Delete block</Button></div>
    </div>
  );
}

/** A slider that records one undo step per drag. */
function Range({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number, first: boolean) => void }) {
  const dragging = useRef(false);
  return <label className="grid gap-1 text-xs font-medium text-muted-foreground">{label}<input type="range" min={min} max={max} step={step} value={value} className="accent-primary"
    onChange={(e) => { onChange(Number(e.target.value), !dragging.current); dragging.current = true; }} onPointerUp={() => (dragging.current = false)} onKeyUp={() => (dragging.current = false)} onBlur={() => (dragging.current = false)} /></label>;
}

function StylePanel({ doc, ctx, change, quiet }: { doc: Doc; ctx: Ctx; change: (fn: (d: Doc) => void) => void; quiet: (fn: (d: Doc) => void) => void }) {
  const picking = useRef(false);
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Page size
        <NativeSelect value={doc.size} onChange={(e) => change((d) => (d.size = e.target.value as Doc["size"]))}>{Object.entries(PSIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</NativeSelect>
        <span className="text-[11px] font-normal">{doc.size === "half" ? "Prints two to a sheet of letter paper; fold in half for a booklet." : "Booklet printing uses 11 × 17 in (tabloid) paper."}</span></label>
      <div className="grid gap-1"><span className="text-xs font-medium text-muted-foreground">Style</span>
        <div className="grid grid-cols-2 gap-1.5">{Object.entries(PSTYLES).map(([k, v]) => (
          <button key={k} type="button" onClick={() => change((d) => (d.style = k as Doc["style"]))} className={cn("grid rounded-lg border p-2 text-left", doc.style === k ? "border-primary ring-2 ring-primary/30" : "hover:border-foreground/30")}
            style={{ fontFamily: v.display, textTransform: v.hcase as React.CSSProperties["textTransform"], letterSpacing: v.hls, fontStretch: v.stretch }}>
            <span className="truncate" style={{ fontSize: 16 * v.hscale }}>{ctx.show.title.slice(0, 18)}</span><small className="text-[11px] text-muted-foreground" style={{ fontFamily: v.body, textTransform: "none", letterSpacing: 0 }}>{v.label}</small>
          </button>))}</div></div>
      <Seg label="Paper" value={doc.paper} options={Object.entries(PAPERS).map(([k, v]) => [k as Doc["paper"], v.label])} onChange={(v) => change((d) => (d.paper = v))} />
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Border<NativeSelect value={doc.border} onChange={(e) => change((d) => (d.border = e.target.value as Doc["border"]))}>{Object.entries(BORDERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></label>
      <div className="grid gap-1"><span className="text-xs font-medium text-muted-foreground">Accent color</span>
        <div className="flex items-center gap-2"><input type="color" aria-label="Accent color" value={doc.accent || ctx.brand.accent || "#9d1420"} className="h-8 w-12 cursor-pointer rounded border"
          onChange={(e) => { const v = e.target.value; if (!picking.current) { picking.current = true; change((d) => (d.accent = v)); } else quiet((d) => (d.accent = v)); }} onBlur={() => (picking.current = false)} />
          <Button size="sm" variant="ghost" onClick={() => change((d) => (d.accent = ""))}>Use school color</Button></div></div>
      <Label className="text-sm font-normal"><Checkbox checked={doc.pageNumbers} onCheckedChange={(v) => change((d) => (d.pageNumbers = !!v))} />Page numbers (not on the covers)</Label>
    </div>
  );
}

function MoreDialog({ open, onClose, others, title, onCopy, onReset }: { open: boolean; onClose: () => void; others: { id: number; title: string; year: number | null; season: string | null }[]; title: string; onCopy: (id: number) => void; onReset: () => void }) {
  const [from, setFrom] = useState<number>(others[0]?.id ?? 0);
  const [sure, setSure] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSure(false); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>More program options</DialogTitle></DialogHeader>
        <section className="grid gap-2"><h3 className="font-medium">Start from another show&apos;s program</h3>
          {others.length ? <><p className="text-sm text-muted-foreground">Copies its pages, text, style and pictures. Lists like the cast fill in from <b>{title}</b>. You can undo it.</p>
            <div className="flex gap-2"><NativeSelect value={from} onChange={(e) => setFrom(Number(e.target.value))} aria-label="Show to copy from">{others.map((o) => <option key={o.id} value={o.id}>{o.title}{o.year ? ` (${[o.season, o.year].filter(Boolean).join(" ")})` : ""}</option>)}</NativeSelect><Button variant="outline" onClick={() => onCopy(from)}>Copy it</Button></div></>
            : <p className="text-sm text-muted-foreground">No other show has a program yet. Once you&apos;ve made one, you can reuse its layout and text here.</p>}
        </section>
        <section className="grid gap-2 border-t pt-3"><h3 className="font-medium">Start over</h3><p className="text-sm text-muted-foreground">Replace this program with a fresh standard layout filled in from the show. Uploaded pictures are kept, and you can undo it.</p>
          {sure ? <div className="flex gap-2"><Button variant="destructive" onClick={() => { setSure(false); onReset(); }}>Yes, start over</Button><Button variant="ghost" onClick={() => setSure(false)}>Cancel</Button></div> : <Button variant="outline" className="justify-self-start" onClick={() => setSure(true)}>Start over with the standard layout</Button>}
        </section>
      </DialogContent>
    </Dialog>
  );
}
