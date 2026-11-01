"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Printer, ShoppingBag, Undo2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/app/fields";
import { Empty, Pill, TagChip, Thumb } from "@/components/app/bits";
import { removeLineAction, returnLinesAction, updateLineAction } from "@/server/actions/shows";
import { COND, fmtDate, todayISO } from "@/lib/format";
import type { ShowDetail } from "@/server/queries/shows";

type Line = ShowDetail["lines"][number];
type Ret = { id: number; conditionIn: number; notesIn: string; sendToRepair: boolean };

export function LinesPanel({ showId, title, past, lines }: { showId: number; title: string; past: boolean; lines: Line[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [ret, setRet] = useState<Ret[] | null>(null);
  const [retDate, setRetDate] = useState(todayISO());
  const [edit, setEdit] = useState<Line | null>(null);
  const out = lines.filter((l) => !l.line.dateReturned);
  const shown = useMemo(() => lines.filter(({ line: l, item: i }) => !q || [i.tag, i.name, i.category, l.character, l.actor, l.scene].join(" ").toLowerCase().includes(q.toLowerCase())), [lines, q]);
  const toggle = (id: number, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const openReturn = (ids: number[]) => { setRetDate(todayISO()); setRet(lines.filter((l) => ids.includes(l.line.id)).map((l) => ({ id: l.line.id, conditionIn: l.item.condition, notesIn: "", sendToRepair: false }))); };
  const doReturn = () => start(async () => {
    const r = await returnLinesAction(showId, { dateReturned: retDate, lines: ret });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Returned ${ret!.length} line${ret!.length === 1 ? "" : "s"}.`); setRet(null); setSel(new Set()); router.refresh();
  });

  if (!lines.length) return <Empty>Nothing checked out to {title} yet. {!past && <><Link href={`/shows/${showId}/checkout`} className="font-medium text-link underline">Check out costumes, props and set pieces</Link>, or build a pull list while browsing the inventory.</>}</Empty>;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by item, character, actor or scene…" className="max-w-sm" aria-label="Filter items" />
        <span className="text-sm text-muted-foreground tabular">{out.length} of {lines.length} line{lines.length === 1 ? "" : "s"} still out</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {sel.size > 0 && <Button onClick={() => openReturn([...sel])}><Undo2 />Return {sel.size} selected</Button>}
          {out.length > 0 && sel.size === 0 && <Button variant="outline" onClick={() => openReturn(out.map((l) => l.line.id))}><Undo2 />Return everything</Button>}
          {!past && <Link href={`/shows/${showId}/checkout`} className={buttonVariants({ variant: "outline" })}><ShoppingBag />Check out more</Link>}
          <a href={`/shows/${showId}/pull-sheet`} target="_blank" className={buttonVariants({ variant: "outline" })}><Printer />Print list</a>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/40"><TableRow>
            <TableHead className="w-8"><Checkbox aria-label="Select all still out" checked={out.length > 0 && out.every((l) => sel.has(l.line.id))} onCheckedChange={(v) => setSel(v ? new Set(out.map((l) => l.line.id)) : new Set())} /></TableHead>
            <TableHead>Item</TableHead><TableHead>Character · actor · scene</TableHead><TableHead>Out</TableHead><TableHead>Back</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{shown.map(({ line: l, item: i }) => (
            <TableRow key={l.id}>
              <TableCell>{!l.dateReturned && <Checkbox aria-label={`Select ${i.name}`} checked={sel.has(l.id)} onCheckedChange={(v) => toggle(l.id, !!v)} />}</TableCell>
              <TableCell><div className="flex items-center gap-3"><Thumb file={i.mainPhoto} className="size-10" /><div><Link href={`/items/${i.id}`} className="font-medium hover:underline">{i.name}</Link>{l.qty > 1 && <span className="text-muted-foreground"> × {l.qty}</span>}<div className="flex items-center gap-2 text-xs text-muted-foreground"><TagChip tag={i.tag} />{[i.size && `Size ${i.size}`, i.location].filter(Boolean).join(" · ")}</div></div></div></TableCell>
              <TableCell className="whitespace-normal"><span className="font-medium">{l.character ?? ""}</span>{[l.actor && `${l.character ? " · " : ""}${l.actor}`, l.scene && ` · ${l.scene}`].filter(Boolean).join("")}
                {(l.usageNotes || l.alterations) && <div className="text-xs text-muted-foreground">{[l.usageNotes, l.alterations && `Alterations: ${l.alterations}`].filter(Boolean).join(" · ")}</div>}</TableCell>
              <TableCell className="whitespace-nowrap">{fmtDate(l.dateOut)}<div className="text-xs text-muted-foreground">{COND[l.conditionOut]}</div></TableCell>
              <TableCell className="whitespace-nowrap">{l.dateReturned ? <>{fmtDate(l.dateReturned)}<div className="text-xs text-muted-foreground">{l.conditionIn ? COND[l.conditionIn] : ""}</div></> : <Pill tone="amber">Out</Pill>}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <Button size="icon-sm" variant="ghost" onClick={() => setEdit({ line: l, item: i })} aria-label={`Edit ${i.name} details`}><Pencil /></Button>
                {!l.dateReturned && <Button size="icon-sm" variant="ghost" onClick={() => openReturn([l.id])} aria-label={`Return ${i.name}`}><Undo2 /></Button>}
                {!l.dateReturned && <Button size="icon-sm" variant="ghost" disabled={busy} aria-label={`Remove ${i.name}: checked out by mistake`} title="Checked out by mistake" onClick={() => start(async () => { const r = await removeLineAction(l.id); if (!r.ok) toast.error(r.error); else { toast.success("Removed."); router.refresh(); } })}><X /></Button>}
              </TableCell>
            </TableRow>))}</TableBody>
        </Table>
      </div>

      <Dialog open={!!ret} onOpenChange={(o) => !o && setRet(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Return to stock</DialogTitle><DialogDescription>Check each piece as it comes back. A change in condition is added to the item&apos;s history.</DialogDescription></DialogHeader>
          <label className="flex items-center gap-2 text-sm">Returned on<Input type="date" value={retDate} onChange={(e) => setRetDate(e.target.value)} className="w-auto" /></label>
          <div className="grid max-h-[50vh] gap-3 overflow-y-auto pr-1">
            {ret?.map((r, k) => { const l = lines.find((x) => x.line.id === r.id)!; const set = (p: Partial<Ret>) => setRet((cur) => cur!.map((x, j) => (j === k ? { ...x, ...p } : x)));
              return (
                <div key={r.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_170px]">
                  <div className="flex items-center gap-2"><Thumb file={l.item.mainPhoto} className="size-9" /><div><div className="font-medium">{l.item.name}{l.line.qty > 1 ? ` × ${l.line.qty}` : ""}</div><div className="text-xs text-muted-foreground">{l.item.tag} · went out {COND[l.line.conditionOut]}</div></div></div>
                  <NativeSelect aria-label={`Condition of ${l.item.name}`} value={r.conditionIn} onChange={(e) => set({ conditionIn: Number(e.target.value), sendToRepair: Number(e.target.value) <= 1 || r.sendToRepair })}>{[5, 4, 3, 2, 1].map((c) => <option key={c} value={c}>{c} · {COND[c]}</option>)}</NativeSelect>
                  <Textarea rows={1} placeholder="Notes: stains, missing buttons…" value={r.notesIn} onChange={(e) => set({ notesIn: e.target.value })} aria-label={`Notes for ${l.item.name}`} className="min-h-8" />
                  <Label className="text-sm font-normal"><Checkbox checked={r.sendToRepair} onCheckedChange={(v) => set({ sendToRepair: !!v })} />Send to repair</Label>
                </div>); })}
          </div>
          <DialogFooter><Button disabled={busy} onClick={doReturn}>{busy ? "Saving…" : `Return ${ret?.length ?? 0}`}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <LineDialog line={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function LineDialog({ line, onClose }: { line: Line | null; onClose: () => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [v, setV] = useState<Record<string, string>>({});
  const open = !!line;
  const val = (k: "character" | "actor" | "scene" | "usageNotes" | "alterations") => v[k] ?? line?.line[k] ?? "";
  const field = (k: Parameters<typeof val>[0], label: string, area = false) => (
    <label className="grid gap-1.5 text-sm font-medium">{label}{area ? <Textarea rows={2} value={val(k)} onChange={(e) => setV({ ...v, [k]: e.target.value })} /> : <Input value={val(k)} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}</label>);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setV({}); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{line?.item.name}</DialogTitle><DialogDescription>How it was used in this show. This is what you&apos;ll see when you look back.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">{field("character", "Character")}{field("actor", "Worn / used by")}{field("scene", "Scene")}<div />{field("usageNotes", "How it was used", true)}{field("alterations", "Alterations made", true)}</div>
        <DialogFooter><Button disabled={busy} onClick={() => start(async () => {
          const r = await updateLineAction(line!.line.id, { character: val("character"), actor: val("actor"), scene: val("scene"), usageNotes: val("usageNotes"), alterations: val("alterations") });
          if (!r.ok) { toast.error(r.error); return; } setV({}); onClose(); router.refresh(); })}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
