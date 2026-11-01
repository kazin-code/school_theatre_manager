"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError, NativeSelect, NumberField, TextAreaField, TextField } from "@/components/app/fields";
import { Availability, Empty, Stars, TagChip, Thumb } from "@/components/app/bits";
import { rentalSchema } from "@/db/validation";
import { createRentalAction } from "@/server/actions/rentals";
import { applyResult } from "@/lib/forms";
import { addDays, COND, money, todayISO } from "@/lib/format";
import { pullList, usePullList } from "@/lib/pull-list";
import type { ItemRow } from "@/server/queries/items";
import { RenterDialog } from "../../renters/renter-dialog";

type It = ItemRow & { free: number };
type R = { id: number; name: string; organization: string | null; approved: boolean; avgRating: number | null; openCount: number };
type In = z.input<typeof rentalSchema>; type Out = z.output<typeof rentalSchema>;

export function NewRental({ items, renters, renterId, fromPull }: { items: It[]; renters: R[]; renterId: number | null; fromPull: boolean }) {
  const router = useRouter();
  const pull = usePullList();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const today = todayISO();
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(rentalSchema), defaultValues: { renterId: renterId ?? "", purpose: "", dateOut: today, dateDue: addDays(today, 14), fee: "", deposit: "", notes: "", lines: [] } as unknown as In });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const watched = form.watch("lines");
  const rid = Number(form.watch("renterId"));
  const renter = renters.find((r) => r.id === rid);

  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!fromPull || loaded || !pull.items.length) return;
    setLoaded(true);
    for (const p of pull.items) { const it = byId.get(p.id); if (it && it.rentable) lines.append({ itemId: it.id, qty: Math.min(p.qty, Math.max(1, it.free)), conditionOut: it.condition, notesOut: "" }); }
  }, [fromPull, loaded, pull.items, byId, lines]);

  const used = (id: number) => (watched ?? []).filter((l) => l.itemId === id).reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return items.filter((i) => words.every((w) => [i.tag, i.name, i.category, i.subcategory, i.era, i.size, i.color, i.keywords].join(" ").toLowerCase().includes(w))).slice(0, 50);
  }, [items, q]);
  const suggestedFee = (watched ?? []).reduce((a, l) => a + (byId.get(l.itemId)?.rentalRate ?? 0) * (Number(l.qty) || 0), 0);

  async function onSubmit(v: Out) {
    const r = await createRentalAction(v);
    if (!applyResult(form, r)) { if (!r.ok) toast.error(r.error); return; }
    if (fromPull) pullList.removeMany(r.data.itemIds);
    toast.success("Rental started.");
    router.push(`/rentals/${r.data.id}`);
  }
  const approved = renters.filter((r) => r.approved);
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="grid gap-5">
          <Card>
            <CardHeader><CardTitle>Who&apos;s renting</CardTitle><CardDescription>Only approved renters can take items out.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex gap-2">
                <NativeSelect aria-label="Renter" {...form.register("renterId", { valueAsNumber: true })} aria-invalid={!!form.formState.errors.renterId || undefined}>
                  <option value="">Choose a renter…</option>{approved.map((r) => <option key={r.id} value={r.id}>{r.name}{r.organization && r.organization !== r.name ? ` (${r.organization})` : ""}</option>)}
                </NativeSelect>
                <Button type="button" variant="outline" onClick={() => setAdding(true)}><Plus />New</Button>
              </div>
              {form.formState.errors.renterId && <p className="text-sm text-destructive">Choose a renter.</p>}
              {renter && <div className="flex items-center gap-3 text-sm"><Stars value={renter.avgRating} />{renter.openCount > 0 && <span className="text-amber-700 dark:text-amber-400">{renter.openCount} rental{renter.openCount === 1 ? "" : "s"} still out</span>}{renter.avgRating != null && renter.avgRating < 3 && <span className="text-destructive">Low rating: check their history first.</span>}</div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="purpose" label="For" placeholder="e.g. their spring musical" className="sm:col-span-2" />
                <TextField name="dateOut" label="Going out" type="date" />
                <TextField name="dateDue" label="Due back" type="date" />
                <NumberField name="fee" label="Rental fee ($)" step={0.01} hint={suggestedFee ? `Item rates add up to ${money(suggestedFee)}.` : undefined} />
                <NumberField name="deposit" label="Deposit ($)" step={0.01} />
                <TextAreaField name="notes" label="Notes" rows={2} className="sm:col-span-2" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Add items</CardTitle><CardDescription>Only items marked rentable and on the shelf can be added.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the inventory" className="pl-8" aria-label="Search the inventory" /></div>
              {q && !results.length && <p className="text-sm text-muted-foreground">No matches.</p>}
              <ul className="grid max-h-[50vh] gap-1 overflow-y-auto">{results.map((i) => { const left = i.free - used(i.id); return (
                <li key={i.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
                  <Thumb file={i.mainPhoto} className="size-10" />
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{i.name}</div><div className="flex items-center gap-2 text-xs text-muted-foreground"><TagChip tag={i.tag} />{[i.size && `Size ${i.size}`, COND[i.condition]].filter(Boolean).join(" · ")}</div></div>
                  {!i.rentable ? <span className="text-xs text-muted-foreground">Not for rent</span> : left > 0 ? <Button type="button" size="sm" variant="outline" aria-label={`Add ${i.name}`} onClick={() => lines.append({ itemId: i.id, qty: 1, conditionOut: i.condition, notesOut: "" })}><Plus />Add</Button> : <Availability it={i} />}
                </li>); })}</ul>
            </CardContent>
          </Card>
        </div>
        <Card className="lg:sticky lg:top-4">
          <CardHeader><CardTitle>Going out {watched?.length ? `· ${watched.reduce((a, l) => a + (Number(l.qty) || 0), 0)} piece(s)` : ""}</CardTitle><CardDescription>Confirm each piece&apos;s condition as it leaves. You&apos;ll compare when it comes back.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <FormError />
            {!lines.fields.length ? <Empty>No items yet.</Empty> : lines.fields.map((f, idx) => { const it = byId.get(watched?.[idx]?.itemId ?? f.itemId); if (!it) return null; const over = used(it.id) > it.free; return (
              <div key={f.id} className="grid gap-2 rounded-lg border p-3">
                <div className="flex items-center gap-3"><Thumb file={it.mainPhoto} className="size-10" /><div className="min-w-0 flex-1"><div className="font-medium">{it.name}</div><div className="flex items-center gap-2 text-xs text-muted-foreground"><TagChip tag={it.tag} />{it.free} available</div></div>
                  {it.quantity > 1 && <label className="flex items-center gap-1 text-sm">Qty<Input type="number" min={1} max={it.free} className="h-7 w-16" {...form.register(`lines.${idx}.qty`, { valueAsNumber: true })} /></label>}
                  <Button type="button" size="icon-sm" variant="ghost" onClick={() => lines.remove(idx)} aria-label={`Remove ${it.name}`}><X /></Button></div>
                <div className="grid gap-2 sm:grid-cols-[170px_1fr]">
                  <NativeSelect aria-label={`Condition of ${it.name} going out`} {...form.register(`lines.${idx}.conditionOut`, { valueAsNumber: true })}>{[5, 4, 3, 2, 1].map((c) => <option key={c} value={c}>{c} · {COND[c]}</option>)}</NativeSelect>
                  <Input placeholder="Notes on its condition" aria-label={`Notes on ${it.name}`} {...form.register(`lines.${idx}.notesOut`)} />
                </div>
                {over && <p className="text-sm text-destructive">Only {it.free} available.</p>}
              </div>); })}
            <Button type="submit" disabled={form.formState.isSubmitting || !lines.fields.length}>{form.formState.isSubmitting ? "Saving…" : "Start rental"}</Button>
          </CardContent>
        </Card>
        <RenterDialog open={adding} onClose={() => setAdding(false)} onSaved={(id) => setTimeout(() => form.setValue("renterId", id as unknown as In["renterId"]), 300)} />
      </form>
    </FormProvider>
  );
}
