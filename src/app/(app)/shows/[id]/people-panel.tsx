"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { ArrowDown, ArrowUp, ClipboardPaste, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormError, TextAreaField, TextField } from "@/components/app/fields";
import { personSchema, type PersonInput } from "@/db/validation";
import { deletePersonAction, importPeopleAction, reorderAction, savePersonAction } from "@/server/actions/shows";
import { applyResult } from "@/lib/forms";
import type { ShowDetail } from "@/server/queries/shows";

type Person = ShowDetail["people"][number];
type Kind = Person["kind"];
type Out = z.output<typeof personSchema>;
const KINDS: { kind: Kind; title: string; desc: string; role: string; list: string }[] = [
  { kind: "team", title: "Production team", desc: "Director, assistant director, technical and music directors, designers, stage managers…", role: "Position", list: "team_position" },
  { kind: "cast", title: "Cast", desc: "Who plays whom.", role: "Character", list: "" },
  { kind: "pit", title: "Pit orchestra", desc: "Musicians and their instruments.", role: "Instrument", list: "instrument" },
  { kind: "crew", title: "Crew", desc: "Running crew, board operators, house staff…", role: "Job", list: "crew_position" },
];

export function PeoplePanel({ showId, people, musical }: { showId: number; people: Person[]; musical: boolean; lists: Record<string, string[]> }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [edit, setEdit] = useState<{ kind: Kind; p?: Person } | null>(null);
  const [paste, setPaste] = useState<Kind | null>(null);
  const [text, setText] = useState("");
  const kinds = KINDS.filter((k) => musical || k.kind !== "pit" || people.some((p) => p.kind === "pit"));

  const move = (group: Person[], i: number, d: -1 | 1) => start(async () => {
    const ids = group.map((p) => p.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    const others = people.filter((p) => !ids.includes(p.id)).map((p) => p.id);
    const r = await reorderAction(showId, "people", [...others, ...ids]); if (!r.ok) toast.error(r.error); router.refresh();
  });
  const remove = (p: Person) => start(async () => { const r = await deletePersonAction(showId, p.id); if (!r.ok) toast.error(r.error); else { toast.success(`Removed ${p.name}.`); router.refresh(); } });
  const doImport = () => start(async () => {
    const r = await importPeopleAction(showId, paste!, text);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Added ${r.data.count}.`); setPaste(null); setText(""); router.refresh();
  });

  return (
    <div className="grid gap-5">
      {kinds.map((k) => {
        const group = people.filter((p) => p.kind === k.kind);
        return (
          <Card key={k.kind}>
            <CardHeader><CardTitle>{k.title} <span className="font-normal text-muted-foreground tabular">{group.length || ""}</span></CardTitle><CardDescription>{k.desc}</CardDescription>
              <CardAction className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => { setText(""); setPaste(k.kind); }}><ClipboardPaste />Paste a list</Button>
                <Button size="sm" onClick={() => setEdit({ kind: k.kind })}><Plus />Add</Button>
              </CardAction>
            </CardHeader>
            {group.length > 0 && (
              <CardContent>
                <ul className="divide-y">{group.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{p.name}</span>
                      {p.role && <span className="text-muted-foreground"> · {p.role}</span>}
                      <div className="text-xs text-muted-foreground">{[p.voicePart, p.grade && `Grade ${p.grade}`, p.email, p.phone, p.notes].filter(Boolean).join(" · ")}</div>
                    </div>
                    <Button size="icon-sm" variant="ghost" disabled={busy || i === 0} onClick={() => move(group, i, -1)} aria-label={`Move ${p.name} up`}><ArrowUp /></Button>
                    <Button size="icon-sm" variant="ghost" disabled={busy || i === group.length - 1} onClick={() => move(group, i, 1)} aria-label={`Move ${p.name} down`}><ArrowDown /></Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => setEdit({ kind: k.kind, p })} aria-label={`Edit ${p.name}`}><Pencil /></Button>
                    <Button size="icon-sm" variant="ghost" disabled={busy} onClick={() => remove(p)} aria-label={`Remove ${p.name}`}><Trash2 /></Button>
                  </li>))}</ul>
              </CardContent>
            )}
          </Card>
        );
      })}
      {!musical && <p className="text-sm text-muted-foreground">Pit orchestra and musical numbers appear for musicals. Change the show&apos;s type to Musical to use them.</p>}

      <PersonDialog showId={showId} state={edit} onClose={() => setEdit(null)} />

      <Dialog open={!!paste} onOpenChange={(o) => !o && setPaste(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Paste a list: {KINDS.find((k) => k.kind === paste)?.title}</DialogTitle>
            <DialogDescription>One person per line. Separate the {KINDS.find((k) => k.kind === paste)?.role.toLowerCase()} with a comma, a dash, or a tab (straight from a spreadsheet).{paste === "cast" ? " A third column is read as the voice part." : ""}</DialogDescription></DialogHeader>
          <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={paste === "cast" ? "Maya Lopez, Cinderella, Soprano\nEli Park - The Baker" : paste === "pit" ? "Ana Ruiz, Piano\nSam Lee, Drums" : "Jordan Kim, Stage Manager\nPriya Shah - Lighting Designer"} aria-label="List of people" />
          <DialogFooter><Button disabled={busy || !text.trim()} onClick={doImport}>Add {text.split(/\n/).filter((l) => l.trim()).length || ""} people</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PersonDialog({ showId, state, onClose }: { showId: number; state: { kind: Kind; p?: Person } | null; onClose: () => void }) {
  const router = useRouter();
  const blank: PersonInput = { kind: "cast", name: "", role: "", voicePart: "", grade: "", email: "", phone: "", notes: "" };
  const form = useForm<PersonInput, unknown, Out>({ resolver: zodResolver(personSchema), values: state ? { ...blank, ...(state.p ? Object.fromEntries(Object.entries(state.p).map(([k, v]) => [k, v ?? ""])) : {}), kind: state.kind } as PersonInput : blank });
  const k = KINDS.find((x) => x.kind === state?.kind) ?? KINDS[1];
  async function onSubmit(v: Out) {
    const r = await savePersonAction(showId, state?.p?.id ?? null, v);
    if (!applyResult(form, r)) return;
    toast.success(state?.p ? "Saved." : `Added ${v.name}.`);
    if (state?.p) onClose(); else form.reset({ ...blank, kind: k.kind });
    router.refresh();
  }
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <DialogHeader><DialogTitle>{state?.p ? `Edit ${state.p.name}` : `Add to ${k.title.toLowerCase()}`}</DialogTitle>
              {!state?.p && <DialogDescription>Saving keeps this window open so you can add the next person.</DialogDescription>}</DialogHeader>
            <FormError />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="name" label="Name" autoFocus />
              <TextField name="role" label={k.role} list={k.list || undefined} />
              {k.kind === "cast" ? <TextField name="voicePart" label="Voice part" list="voice_part" /> : <TextField name="grade" label="Grade" placeholder="e.g. 11" />}
              {k.kind === "cast" && <TextField name="grade" label="Grade" placeholder="e.g. 11" />}
              <TextField name="email" label="Email" type="email" />
              <TextField name="phone" label="Phone" type="tel" />
              <TextAreaField name="notes" label="Notes" rows={2} className="sm:col-span-2" />
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>{state?.p ? "Save" : "Add"}</Button></DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
