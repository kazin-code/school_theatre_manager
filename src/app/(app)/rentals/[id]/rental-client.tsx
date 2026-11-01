"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Star, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/app/fields";
import { TagChip, Thumb } from "@/components/app/bits";
import { cancelRentalAction, returnRentalAction, updateRentalAction } from "@/server/actions/rentals";
import { COND, money, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RentalDetail } from "@/server/queries/rentals";

type Rental = RentalDetail["rental"]; type Line = RentalDetail["lines"][number];
type In = { id: number; conditionIn: number; notesIn: string; damageCharge: string; sendToRepair: boolean };

/** A starting point for the rating: lose stars for damage and for coming back late. */
export function suggestRating(lines: { out: number; in: number; damage: number; qty: number }[], daysLate: number) {
  let score = 5;
  const drop = lines.reduce((a, l) => a + Math.max(0, l.out - l.in) * l.qty, 0);
  const pieces = lines.reduce((a, l) => a + l.qty, 0) || 1;
  score -= Math.min(3, Math.ceil((drop / pieces) * 2));
  if (lines.some((l) => l.damage > 0)) score -= 1;
  if (daysLate > 0) score -= daysLate > 7 ? 2 : 1;
  return Math.max(1, Math.min(5, score));
}

export function ReturnRental({ rental, lines }: { rental: Rental; lines: Line[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<In[]>(lines.map((l) => ({ id: l.line.id, conditionIn: l.line.conditionOut, notesIn: "", damageCharge: "", sendToRepair: false })));
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [deposit, setDeposit] = useState(true);
  const late = rental.dateDue ? Math.max(0, Math.round((new Date(date).getTime() - new Date(rental.dateDue).getTime()) / 864e5)) : 0;
  const suggestion = suggestRating(rows.map((r, i) => ({ out: lines[i].line.conditionOut, in: r.conditionIn, damage: Number(r.damageCharge) || 0, qty: lines[i].line.qty })), late);
  const shown = rating ?? suggestion;
  const set = (i: number, p: Partial<In>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const totalDamage = rows.reduce((a, r) => a + (Number(r.damageCharge) || 0), 0);
  const submit = () => start(async () => {
    const r = await returnRentalAction(rental.id, { dateReturned: date, rating: shown, ratingNotes: notes, depositReturned: rental.deposit ? deposit : undefined,
      lines: rows.map((x) => ({ ...x, damageCharge: x.damageCharge === "" ? null : x.damageCharge })) });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Rental checked in."); router.refresh();
  });
  return (
    <Card>
      <CardHeader><CardTitle>Check in</CardTitle><CardDescription>Compare each piece with how it went out. Any change is added to the item&apos;s condition history.</CardDescription></CardHeader>
      <CardContent className="grid gap-3">
        {lines.map((l, i) => { const r = rows[i]; const worse = r.conditionIn < l.line.conditionOut; return (
          <div key={l.line.id} className={cn("grid gap-2 rounded-lg border p-3", worse && "border-destructive/40 bg-destructive/5")}>
            <div className="flex items-center gap-3"><Thumb file={l.item.mainPhoto} className="size-10" /><div className="min-w-0 flex-1"><div className="font-medium">{l.item.name}{l.line.qty > 1 ? ` × ${l.line.qty}` : ""}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><TagChip tag={l.item.tag} />Went out {COND[l.line.conditionOut]}{l.line.notesOut ? `: ${l.line.notesOut}` : ""}</div></div></div>
            <div className="grid gap-2 sm:grid-cols-[170px_1fr_120px]">
              <NativeSelect aria-label={`Condition of ${l.item.name} now`} value={r.conditionIn} onChange={(e) => set(i, { conditionIn: Number(e.target.value), sendToRepair: Number(e.target.value) <= 1 || r.sendToRepair })}>{[5, 4, 3, 2, 1].map((c) => <option key={c} value={c}>{c} · {COND[c]}</option>)}</NativeSelect>
              <Input placeholder="What changed?" value={r.notesIn} onChange={(e) => set(i, { notesIn: e.target.value })} aria-label={`Notes on ${l.item.name}`} />
              <Input type="number" min={0} step={0.01} placeholder="Damage $" value={r.damageCharge} onChange={(e) => set(i, { damageCharge: e.target.value })} aria-label={`Damage charge for ${l.item.name}`} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Label className="font-normal"><Checkbox checked={r.sendToRepair} onCheckedChange={(v) => set(i, { sendToRepair: !!v })} />Send to repair</Label>
              {worse && l.item.replacementValue ? <span className="text-xs text-muted-foreground">Replacement value {money(l.item.replacementValue)}</span> : null}
            </div>
          </div>); })}
        <div className="grid gap-3 rounded-lg border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Rate {rental.status === "out" ? "this renter" : ""}</span>
            <div className="flex" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={shown === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => setRating(n)} className="p-0.5"><Star className={cn("size-6", n <= shown ? "fill-amber-400 text-amber-500" : "text-muted-foreground/40")} /></button>))}</div>
            <span className="text-xs text-muted-foreground">{rating == null ? `Suggested from condition${late ? ` and ${late} day${late === 1 ? "" : "s"} late` : ""}. Click to change.` : <button type="button" className="underline" onClick={() => setRating(null)}>Use the suggestion ({suggestion})</button>}</span>
          </div>
          <Textarea rows={2} placeholder="How did they treat the materials? (shown next time someone rents to them)" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Rating notes" />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">Returned on<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" /></label>
            {late > 0 && <span className="text-destructive">{late} day{late === 1 ? "" : "s"} late</span>}
            {rental.deposit ? <Label className="font-normal"><Checkbox checked={deposit} onCheckedChange={(v) => setDeposit(!!v)} />Deposit of {money(rental.deposit)} returned</Label> : null}
            {totalDamage > 0 && <span className="font-medium text-destructive">Damage charges: {money(totalDamage)}</span>}
          </div>
        </div>
        <Button disabled={busy} onClick={submit}><Undo2 />{busy ? "Saving…" : "Check in rental"}</Button>
      </CardContent>
    </Card>
  );
}

export function RentalActions({ rental }: { rental: Rental }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [v, setV] = useState({ purpose: rental.purpose ?? "", dateDue: rental.dateDue ?? "", fee: rental.fee?.toString() ?? "", deposit: rental.deposit?.toString() ?? "", notes: rental.notes ?? "" });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Pencil />Edit</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit rental #{rental.id}</DialogTitle></DialogHeader>
          <div className="grid gap-3 text-sm">
            <label className="grid gap-1.5 font-medium">For<Input value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} /></label>
            <label className="grid gap-1.5 font-medium">Due back<Input type="date" value={v.dateDue} onChange={(e) => setV({ ...v, dateDue: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5 font-medium">Fee ($)<Input type="number" step={0.01} value={v.fee} onChange={(e) => setV({ ...v, fee: e.target.value })} /></label>
              <label className="grid gap-1.5 font-medium">Deposit ($)<Input type="number" step={0.01} value={v.deposit} onChange={(e) => setV({ ...v, deposit: e.target.value })} /></label></div>
            <label className="grid gap-1.5 font-medium">Notes<Textarea rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
          </div>
          <DialogFooter className="sm:justify-between">
            {rental.status === "out" ? <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => start(async () => { const r = await cancelRentalAction(rental.id); if (!r.ok) toast.error(r.error); else { toast.success("Rental cancelled."); router.push("/rentals"); } })}>Cancel rental (entered by mistake)</Button> : <span />}
            <Button disabled={busy} onClick={() => start(async () => { const r = await updateRentalAction(rental.id, v); if (!r.ok) { toast.error(r.error); return; } setOpen(false); router.refresh(); })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
