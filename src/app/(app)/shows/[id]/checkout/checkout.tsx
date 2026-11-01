"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/app/fields";
import { Availability, Empty, TagChip, Thumb } from "@/components/app/bits";
import { checkoutAction } from "@/server/actions/shows";
import { pullList, usePullList } from "@/lib/pull-list";
import { todayISO } from "@/lib/format";
import type { ItemRow } from "@/server/queries/items";

type It = ItemRow & { free: number };
type Line = { key: number; itemId: number; qty: number; character: string; actor: string; scene: string; usageNotes: string };
let k = 0;

export function Checkout({ showId, fromPull, items, cast }: { showId: number; fromPull: boolean; items: It[]; cast: { name: string; role: string | null }[] }) {
  const router = useRouter();
  const pull = usePullList();
  const [busy, start] = useTransition();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState<Line[]>([]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!fromPull || loaded || !pull.items.length) return;
    setLoaded(true);
    setLines(pull.items.filter((p) => byId.has(p.id)).map((p) => ({ key: k++, itemId: p.id, qty: Math.min(p.qty, Math.max(1, byId.get(p.id)!.free)), character: "", actor: "", scene: "", usageNotes: "" })));
  }, [fromPull, loaded, pull.items, byId]);

  const used = (id: number) => lines.filter((l) => l.itemId === id).reduce((a, l) => a + l.qty, 0);
  const add = (it: It) => setLines((ls) => [...ls, { key: k++, itemId: it.id, qty: 1, character: "", actor: "", scene: "", usageNotes: "" }]);
  const characters = [...new Set(cast.map((p) => p.role).filter((r): r is string => !!r))];
  /** Picking a character from the cast list fills in who plays it. */
  const setCharacter = (l: Line, character: string) => {
    const who = cast.find((p) => p.role && p.role.toLowerCase() === character.trim().toLowerCase());
    const prevWho = cast.find((p) => p.role && p.role.toLowerCase() === l.character.trim().toLowerCase());
    set(l.key, { character, ...(who && (!l.actor || l.actor === prevWho?.name) ? { actor: who.name } : {}) });
  };
  const set = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const cats = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort() as string[], [items]);
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length && !cat) return [];
    return items.filter((i) => (!cat || i.category === cat) && words.every((w) => [i.tag, i.name, i.category, i.subcategory, i.era, i.gender, i.size, i.color, i.material, i.keywords].join(" ").toLowerCase().includes(w))).slice(0, 60);
  }, [items, q, cat]);
  const problems = lines.filter((l) => used(l.itemId) > (byId.get(l.itemId)?.free ?? 0));

  const submit = () => start(async () => {
    const r = await checkoutAction(showId, { dateOut: date, lines: lines.map(({ key: _k, ...l }) => l) });
    if (!r.ok) { toast.error(r.error); return; }
    if (fromPull) pullList.removeMany(r.data.ids);
    toast.success(`Checked out ${lines.reduce((a, l) => a + l.qty, 0)} piece(s).`);
    router.push(`/shows/${showId}?tab=items`);
  });

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="lg:sticky lg:top-4">
        <CardHeader><CardTitle>Find items</CardTitle><CardDescription>Search by name, tag, size, color… then add them.</CardDescription></CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the inventory" className="pl-8" autoFocus aria-label="Search the inventory" /></div>
            <NativeSelect className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All</option>{cats.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
          </div>
          {!q && !cat ? <p className="text-sm text-muted-foreground">Type to search, or pick a category.</p> : !results.length ? <p className="text-sm text-muted-foreground">No matches.</p> : (
            <ul className="grid max-h-[60vh] gap-1 overflow-y-auto">{results.map((i) => { const left = i.free - used(i.id); return (
              <li key={i.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
                <Thumb file={i.mainPhoto} className="size-10" />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{i.name}</div><div className="flex items-center gap-2 text-xs text-muted-foreground"><TagChip tag={i.tag} />{[i.size && `Size ${i.size}`, i.color].filter(Boolean).join(" · ")}</div></div>
                {left > 0 && i.status === "active" ? <Button size="sm" variant="outline" onClick={() => add(i)} aria-label={`Add ${i.name}`}><Plus />Add</Button> : <Availability it={i} />}
              </li>); })}</ul>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Checking out {lines.length ? `${lines.reduce((a, l) => a + l.qty, 0)} piece(s)` : ""}</CardTitle><CardDescription>Record who uses each piece and how. It becomes this show&apos;s history.</CardDescription></CardHeader>
        <CardContent className="grid gap-3">
          {!lines.length ? <Empty>{fromPull && !pull.items.length ? "Your pull list is empty." : "Nothing added yet."}</Empty> : lines.map((l) => { const it = byId.get(l.itemId)!; return (
            <div key={l.key} className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-3"><Thumb file={it.mainPhoto} className="size-10" /><div className="min-w-0 flex-1"><div className="font-medium">{it.name}</div><div className="flex items-center gap-2 text-xs text-muted-foreground"><TagChip tag={it.tag} />{it.free} available</div></div>
                {it.quantity > 1 && <label className="flex items-center gap-1 text-sm">Qty<Input type="number" min={1} max={it.free} value={l.qty} onChange={(e) => set(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} className="h-7 w-16" /></label>}
                <Button size="icon-sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove ${it.name}`}><X /></Button></div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input placeholder="Character" list="co-characters" value={l.character} onChange={(e) => setCharacter(l, e.target.value)} aria-label="Character" />
                <Input placeholder="Worn / used by" list="co-actors" value={l.actor} onChange={(e) => set(l.key, { actor: e.target.value })} aria-label="Actor" />
                <Input placeholder="Scene" value={l.scene} onChange={(e) => set(l.key, { scene: e.target.value })} aria-label="Scene" />
              </div>
              <Input placeholder="How it's used (optional)" value={l.usageNotes} onChange={(e) => set(l.key, { usageNotes: e.target.value })} aria-label="How it's used" />
              {used(l.itemId) > it.free && <p className="text-sm text-destructive">Only {it.free} of this item {it.free === 1 ? "is" : "are"} available.</p>}
            </div>); })}
          <datalist id="co-characters">{characters.map((c) => <option key={c} value={c} />)}</datalist>
          <datalist id="co-actors">{cast.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <label className="flex items-center gap-2 text-sm">Checkout date<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" /></label>
            <Button className="ml-auto" disabled={busy || !lines.length || problems.length > 0} onClick={submit}>{busy ? "Saving…" : "Check out"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
