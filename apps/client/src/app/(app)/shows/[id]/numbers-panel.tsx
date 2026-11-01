"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormError, TextAreaField, TextField } from "@/components/app/fields";
import { numberSchema, type NumberInput } from "@stm/core/db/validation";
import { deleteNumberAction, reorderAction, saveNumberAction } from "@/server/actions/shows";
import { applyResult } from "@/lib/forms";
import type { ShowDetail } from "@/server/queries/shows";

type Num = ShowDetail["numbers"][number];
type Out = z.output<typeof numberSchema>;

export function NumbersPanel({ showId, numbers }: { showId: number; numbers: Num[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [edit, setEdit] = useState<{ n?: Num } | null>(null);
  const move = (i: number, d: -1 | 1) => start(async () => { const ids = numbers.map((n) => n.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; const r = await reorderAction(showId, "numbers", ids); if (!r.ok) toast.error(r.error); router.refresh(); });
  return (
    <Card>
      <CardHeader><CardTitle>Musical numbers</CardTitle><CardDescription>The song list, in running order. It prints in the program.</CardDescription>
        <CardAction><Button size="sm" onClick={() => setEdit({})}><Plus />Add a number</Button></CardAction></CardHeader>
      <CardContent>
        {!numbers.length ? <p className="text-sm text-muted-foreground">No numbers yet.</p> : (
          <Table><TableHeader><TableRow><TableHead>Act</TableHead><TableHead>#</TableHead><TableHead>Song</TableHead><TableHead>Sung by</TableHead><TableHead>Scene</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{numbers.map((n, i) => (
              <TableRow key={n.id}>
                <TableCell>{n.act}</TableCell><TableCell className="tabular">{n.number}</TableCell>
                <TableCell className="font-medium whitespace-normal">{n.title}{n.notes && <div className="text-xs font-normal text-muted-foreground">{n.notes}</div>}</TableCell>
                <TableCell className="whitespace-normal">{n.singers}</TableCell><TableCell>{n.scene}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="icon-sm" variant="ghost" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp /></Button>
                  <Button size="icon-sm" variant="ghost" disabled={busy || i === numbers.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setEdit({ n })} aria-label={`Edit ${n.title}`}><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" disabled={busy} onClick={() => start(async () => { const r = await deleteNumberAction(showId, n.id); if (!r.ok) toast.error(r.error); router.refresh(); })} aria-label={`Delete ${n.title}`}><Trash2 /></Button>
                </TableCell>
              </TableRow>))}</TableBody></Table>)}
      </CardContent>
      <NumberDialog showId={showId} state={edit} last={numbers.at(-1)} onClose={() => setEdit(null)} />
    </Card>
  );
}

function NumberDialog({ showId, state, last, onClose }: { showId: number; state: { n?: Num } | null; last?: Num; onClose: () => void }) {
  const router = useRouter();
  const next = () => { if (!last) return "1"; const m = /^(\d+)$/.exec(last.number ?? ""); return m ? String(Number(m[1]) + 1) : ""; };
  const blank: NumberInput = { act: last?.act ?? "1", number: next(), title: "", singers: "", scene: "", notes: "" };
  const form = useForm<NumberInput, unknown, Out>({ resolver: zodResolver(numberSchema), values: state?.n ? (Object.fromEntries(Object.entries(state.n).map(([k, v]) => [k, v ?? ""])) as NumberInput) : blank });
  async function onSubmit(v: Out) {
    const r = await saveNumberAction(showId, state?.n?.id ?? null, v);
    if (!applyResult(form, r)) return;
    if (state?.n) onClose(); else { toast.success(`Added ${v.title}.`); form.reset({ ...blank, act: v.act ?? "", number: /^\d+$/.test(v.number ?? "") ? String(Number(v.number) + 1) : "" }); }
    router.refresh();
  }
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <DialogHeader><DialogTitle>{state?.n ? "Edit number" : "Add a number"}</DialogTitle></DialogHeader>
            <FormError />
            <div className="grid grid-cols-4 gap-4">
              <TextField name="act" label="Act" /><TextField name="number" label="No." />
              <TextField name="title" label="Song title" className="col-span-2" autoFocus />
              <TextField name="singers" label="Sung by" className="col-span-2" placeholder="Cinderella, Ensemble" />
              <TextField name="scene" label="Scene" className="col-span-2" />
              <TextAreaField name="notes" label="Notes" rows={2} className="col-span-4" />
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>{state?.n ? "Save" : "Add"}</Button></DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
