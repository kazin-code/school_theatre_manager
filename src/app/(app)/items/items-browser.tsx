"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTable, type ColumnFiltersState, type PaginationState, type SortingState } from "@tanstack/react-table";
import { features, type Col, type Filter } from "@/lib/table";
import { toast } from "sonner";
import { Download, LayoutGrid, List, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/app/page-header";
import { DataTable, Pager } from "@/components/app/data-table";
import { NativeSelect } from "@/components/app/fields";
import { Availability, Condition, Empty, TagChip, Thumb } from "@/components/app/bits";
import { usePullList } from "@/lib/pull-list";
import { photoUrl } from "@/lib/urls";
import { COND } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ItemRow } from "@/server/queries/items";

type ShowOpt = { id: number; title: string; year: number | null };
const free = (r: ItemRow) => r.quantity - r.rentOut - r.showOut;

// ---- filter functions ----
const textSearch: Filter<ItemRow> = (row, _id, q: string) => {
  const hay = [row.original.tag, row.original.name, row.original.category, row.original.subcategory, row.original.era, row.original.gender, row.original.size,
    row.original.color, row.original.material, row.original.keywords, row.original.description, row.original.notes, row.original.location, row.original.showTitles].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};
const equalsText: Filter<ItemRow> = (row, id, v: string) => String(row.getValue(id) ?? "").toLowerCase() === v.toLowerCase();
const containsText: Filter<ItemRow> = (row, id, v: string) => String(row.getValue(id) ?? "").toLowerCase().includes(v.toLowerCase());
const range: Filter<ItemRow> = (row, id, [lo, hi]: [string, string]) => {
  const n = row.getValue<number | null>(id);
  if (lo === "" && hi === "") return true;
  if (n == null) return false;
  return (lo === "" || n >= Number(lo)) && (hi === "" || n <= Number(hi));
};

const STATUS: [string, string][] = [["current", "Not retired"], ["active", "In stock"], ["repair", "In repair"], ["retired", "Retired"], ["lost", "Lost"], ["all", "Everything"]];
const AVAIL: [string, string][] = [["available", "Available now"], ["out", "Checked out (any)"], ["inshow", "Out to a show"], ["rented", "Out on rental"]];
const MEASURES = ["chest", "waist", "hips", "inseam"] as const;
// Columns that exist only so they can be filtered or sorted on.
const HIDDEN = Object.fromEntries(["category", "subcategory", "gender", "size", "location", "material", "color", ...MEASURES, "availability", "rentable", "show", "createdAt", "era"].map((k) => [k, false]));

export function ItemsBrowser({ items, shows, lists }: { items: ItemRow[]; shows: ShowOpt[]; lists: Record<string, string[]> }) {
  const router = useRouter();
  const pull = usePullList();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [filters, setFilters] = useState<ColumnFiltersState>([{ id: "status", value: "current" }]);
  const [showFilters, setShowFilters] = useState(true);

  const columns = useMemo<Col<ItemRow>[]>(() => [
    { id: "photo", header: "", enableSorting: false, cell: ({ row }) => <Thumb file={row.original.mainPhoto} />, meta: { className: "w-14" } },
    { accessorKey: "tag", header: "Tag", cell: ({ getValue }) => <TagChip tag={getValue<string>()} /> },
    { accessorKey: "name", header: "Item", cell: ({ row }) => <div><div className="font-medium">{row.original.name}</div><div className="text-xs text-muted-foreground">{[row.original.category, row.original.subcategory].filter(Boolean).join(" · ")}{row.original.quantity > 1 ? ` · qty ${row.original.quantity}` : ""}</div></div> },
    { accessorKey: "category", header: "Category", filterFn: equalsText, enableHiding: true },
    { accessorKey: "subcategory", filterFn: equalsText }, { accessorKey: "gender", filterFn: equalsText }, { accessorKey: "size", filterFn: equalsText }, { accessorKey: "location", filterFn: equalsText },
    { accessorKey: "era", header: "Era", filterFn: equalsText },
    { accessorKey: "material", filterFn: containsText }, { accessorKey: "color", filterFn: containsText },
    { id: "look", header: "Look", enableSorting: false, cell: ({ row }) => <span className="text-sm">{[row.original.gender, row.original.size && `Size ${row.original.size}`, row.original.color, row.original.material].filter(Boolean).join(" · ")}</span> },
    ...MEASURES.map((m) => ({ accessorKey: m, filterFn: range })),
    { accessorKey: "condition", header: "Condition", cell: ({ getValue }) => <Condition value={getValue<number>()} />, filterFn: (row, id, v: string) => row.getValue<number>(id) >= Number(v) },
    { id: "status", accessorKey: "status", header: "Status", cell: ({ row }) => <Availability it={row.original} />,
      filterFn: (row, _id, v: string) => { const s = row.original.status; return v === "all" ? true : v === "current" ? s !== "retired" : s === v; } },
    { id: "availability", accessorFn: free, filterFn: (row, _id, v: string) => {
        const r = row.original;
        return v === "available" ? r.status === "active" && free(r) > 0 : v === "out" ? r.rentOut + r.showOut > 0 : v === "inshow" ? r.showOut > 0 : v === "rented" ? r.rentOut > 0 : true; } },
    { accessorKey: "rentable", filterFn: (row, id, v: boolean) => !v || row.getValue<boolean>(id) },
    { id: "show", accessorFn: (r) => r.showIds ?? "", filterFn: (row, id, v: string) => v === "never" ? !row.getValue<string>(id) : row.getValue<string>(id).split(",").includes(v) },
    { accessorKey: "showCount", header: "Shows", cell: ({ getValue }) => <span className="tabular">{getValue<number>() || ""}</span>, meta: { className: "text-right" } },
    { accessorKey: "createdAt" },
    { id: "pull", header: "", enableSorting: false, cell: ({ row }) => <Button size="xs" variant="outline" onClick={() => addPull(row.original)}>+ Pull</Button> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 60 });
  const table = useTable({
    features, data: items, columns,
    state: { sorting, columnFilters: filters, globalFilter: query, columnVisibility: HIDDEN, pagination },
    onSortingChange: setSorting, onColumnFiltersChange: setFilters, onGlobalFilterChange: setQuery, onPaginationChange: setPagination,
    globalFilterFn: textSearch, autoResetPageIndex: true,
  });

  function addPull(r: ItemRow) {
    const ok = pull.add({ id: r.id, tag: r.tag, name: r.name, category: r.category, size: r.size, photo: r.mainPhoto, qty: 1, max: r.quantity });
    toast[ok ? "success" : "info"](ok ? `Added ${r.name} to the pull list` : `${r.name} is already on the pull list`);
  }
  const fv = (id: string) => (filters.find((f) => f.id === id)?.value ?? "") as string;
  const setF = (id: string, value: unknown) => setFilters((cur) => [...cur.filter((f) => f.id !== id), ...(value === "" || value === false || value == null ? [] : [{ id, value }])]);
  const rng = (m: string) => (filters.find((f) => f.id === m)?.value as [string, string]) ?? ["", ""];
  const setRng = (m: string, i: 0 | 1, v: string) => { const r = [...rng(m)] as [string, string]; r[i] = v; setF(m, r[0] === "" && r[1] === "" ? "" : r); };
  const rows = table.getRowModel().rows;
  const matched = table.getPrePaginatedRowModel().rows;
  const pieces = matched.reduce((a, r) => a + r.original.quantity, 0);
  const active = filters.filter((f) => !(f.id === "status" && f.value === "current"));

  const sel = (id: string, label: string, opts: (string | [string, string])[], ph = "Any") => (
    <div className="grid gap-1"><Label htmlFor={`v-${id}`} className="text-xs font-normal text-muted-foreground">{label}</Label>
      <NativeSelect id={`v-${id}`} value={fv(id)} onChange={(e) => setF(id, e.target.value)}><option value="">{ph}</option>{opts.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{t}</option>; })}</NativeSelect></div>
  );

  return (
    <>
      <PageHeader eyebrow="Inventory" title="Find what you have" actions={<>
        <a href="/api/export/items" className={buttonVariants({ variant: "outline" })}><Download />Export spreadsheet</a>
        <Link href="/items/new" className={buttonVariants()}><Plus />Add an item</Link>
      </>} />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names, tags, colors, keywords, or a show or character it was used for…" className="h-11 pl-9 text-base" aria-label="Search the inventory" autoFocus />
      </div>
      <div className={cn("grid items-start gap-5", showFilters && "lg:grid-cols-[250px_1fr]")}>
        {showFilters && (
          <aside className="grid gap-3 rounded-xl border bg-card p-4 lg:sticky lg:top-4">
            <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">What</div>
            {sel("category", "Category", lists.category ?? [])}{sel("subcategory", "Type", lists.subcategory ?? [])}{sel("era", "Era / period", lists.era ?? [])}
            {sel("gender", "Gender", lists.gender ?? [])}{sel("size", "Size", lists.size ?? [])}{sel("material", "Material", lists.material ?? [])}{sel("color", "Color", lists.color ?? [])}
            <div className="mt-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Where &amp; state</div>
            {sel("location", "Storage location", lists.location ?? [])}{sel("availability", "Availability", AVAIL)}
            <div className="grid gap-1"><Label htmlFor="v-status" className="text-xs font-normal text-muted-foreground">Status</Label>
              <NativeSelect id="v-status" value={fv("status") || "all"} onChange={(e) => setF("status", e.target.value)}>{STATUS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</NativeSelect></div>
            {sel("condition", "Condition at least", [5, 4, 3, 2].map((c) => [String(c), `${c} · ${COND[c]}`] as [string, string]))}
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!fv("rentable")} onCheckedChange={(v) => setF("rentable", !!v)} />Rentable to outside groups</label>
            <div className="mt-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Show history</div>
            {sel("show", "Used in show", [["never", "Never used in a show"], ...shows.map((s) => [String(s.id), `${s.title}${s.year ? ` (${s.year})` : ""}`] as [string, string])])}
            <div className="mt-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Measurements (in.)</div>
            {MEASURES.map((m) => (
              <div key={m} className="grid grid-cols-[52px_1fr_1fr] items-center gap-1.5 text-sm">
                <span className="capitalize">{m}</span>
                <Input type="number" min={0} step={0.5} placeholder="min" value={rng(m)[0]} onChange={(e) => setRng(m, 0, e.target.value)} aria-label={`${m} at least`} className="h-7" />
                <Input type="number" min={0} step={0.5} placeholder="max" value={rng(m)[1]} onChange={(e) => setRng(m, 1, e.target.value)} aria-label={`${m} at most`} className="h-7" />
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setFilters([{ id: "status", value: "current" }])}>Clear all filters</Button>
          </aside>
        )}
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}><SlidersHorizontal />{showFilters ? "Hide filters" : "Show filters"}</Button>
            <span className="text-sm font-medium tabular">{matched.length ? `${matched.length} item${matched.length === 1 ? "" : "s"}${pieces !== matched.length ? ` · ${pieces} pieces` : ""}` : "No matches"}</span>
            {active.map((f) => <Button key={f.id} size="xs" variant="secondary" onClick={() => setF(f.id, "")}>{f.id}: {Array.isArray(f.value) ? f.value.filter(Boolean).join("–") : String(f.value)}<X /></Button>)}
            <div className="ml-auto flex items-center gap-2">
              <NativeSelect aria-label="Sort" className="w-auto" value={`${sorting[0]?.id}:${sorting[0]?.desc ? 1 : 0}`} onChange={(e) => { const [id, d] = e.target.value.split(":"); setSorting([{ id, desc: d === "1" }]); }}>
                <option value="name:0">Name A–Z</option><option value="tag:0">Tag number</option><option value="category:0">Category</option><option value="createdAt:1">Newest first</option><option value="condition:1">Best condition</option><option value="showCount:1">Most used in shows</option>
              </NativeSelect>
              <ToggleGroup value={[view]} onValueChange={(v) => v[0] && setView(v[0] as "grid" | "list")} variant="outline" size="sm">
                <ToggleGroupItem value="grid" aria-label="Photo grid"><LayoutGrid /></ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List"><List /></ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
          {!items.length ? <Empty>Your inventory is empty. <Link href="/items/new" className="font-medium text-primary underline">Add the first item</Link>: a costume, a chair, a prop.</Empty>
            : view === "list" ? <DataTable table={table} onRowClick={(r) => router.push(`/items/${r.id}`)} empty="Nothing matches. Try fewer filters or a different word." />
            : rows.length === 0 ? <Empty>Nothing matches. Try fewer filters or a different word.</Empty>
            : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {rows.map(({ original: r }) => (
                  <div key={r.id} className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/30">
                    <Link href={`/items/${r.id}`} className="flex flex-1 flex-col">
                      <div className="grid aspect-[4/3] place-items-center bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.mainPhoto ? <img src={photoUrl(r.mainPhoto)} alt="" loading="lazy" className="size-full object-cover" /> : <Thumb className="size-12 bg-transparent" />}
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-3">
                        <div><TagChip tag={r.tag} /></div>
                        <div className="leading-snug font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{[r.era, r.gender, r.size && `Size ${r.size}`, r.color].filter(Boolean).join(" · ")}</div>
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-1 pt-1"><Availability it={r} /><Condition value={r.condition} /></div>
                      </div>
                    </Link>
                    {r.photoCount > 1 && <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 text-[11px] text-white">{r.photoCount} photos</span>}
                    <Button size="xs" variant="secondary" className="absolute top-2 right-2" onClick={() => addPull(r)}>+ Pull</Button>
                  </div>
                ))}
              </div>
            )}
          {items.length > 0 && <Pager table={table} />}
        </section>
      </div>
    </>
  );
}
