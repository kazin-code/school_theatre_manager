"use client";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/app/fields";
import { Empty } from "@/components/app/bits";
import { ShowCard } from "../shows/show-card";
import type { ShowRow } from "@/server/queries/shows";

export function PastShows({ shows }: { shows: ShowRow[] }) {
  const [q, setQ] = useState(""); const [year, setYear] = useState(""); const [type, setType] = useState("");
  const years = useMemo(() => [...new Set(shows.map((s) => s.year).filter(Boolean))].sort((a, b) => b! - a!), [shows]);
  const types = useMemo(() => [...new Set(shows.map((s) => s.type))].sort(), [shows]);
  const list = shows.filter((s) => (!q || `${s.title} ${s.director ?? ""} ${s.writtenBy ?? ""} ${s.musicBy ?? ""}`.toLowerCase().includes(q.toLowerCase())) && (!year || String(s.year) === year) && (!type || s.type === type));
  if (!shows.length) return <Empty>No past shows yet. When a production closes, open it and choose <b>Move to past shows</b>. Everything used stays on record here.</Empty>;
  const byYear = new Map<string, ShowRow[]>();
  for (const s of list) { const k = s.year ? String(s.year) : "Undated"; byYear.set(k, [...(byYear.get(k) ?? []), s]); }
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, directors, authors…" className="max-w-sm" aria-label="Search past shows" />
        <NativeSelect className="w-auto" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year"><option value="">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</NativeSelect>
        <NativeSelect className="w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</NativeSelect>
      </div>
      {!list.length && <Empty>No past shows match.</Empty>}
      {[...byYear].map(([y, ss]) => (
        <section key={y}><h2 className="mb-3 text-sm font-semibold tracking-wider text-muted-foreground uppercase">{y}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">{ss.map((s) => <ShowCard key={s.id} s={s} />)}</div></section>
      ))}
    </div>
  );
}
