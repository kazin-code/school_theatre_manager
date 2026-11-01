"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTable, type ColumnFiltersState } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DataTable, Pager } from "@/components/app/data-table";
import { Empty, Pill, Stars } from "@/components/app/bits";
import { features, type Col } from "@/lib/table";
import { fmtDate, money, todayISO } from "@/lib/format";
import type { RentalRow } from "@/server/queries/rentals";

const state = (r: RentalRow, today: string) => (r.status === "returned" ? "returned" : r.dateDue && r.dateDue < today ? "overdue" : "out");

export function RentalsTable({ rows }: { rows: RentalRow[] }) {
  const router = useRouter();
  const today = todayISO();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<ColumnFiltersState>([{ id: "state", value: "open" }]);
  const counts = useMemo(() => ({ open: rows.filter((r) => r.status === "out").length, overdue: rows.filter((r) => state(r, today) === "overdue").length, returned: rows.filter((r) => r.status === "returned").length, all: rows.length }), [rows, today]);
  const columns = useMemo<Col<RentalRow>[]>(() => [
    { accessorKey: "id", header: "#", cell: ({ row }) => <span className="font-medium text-primary">#{row.original.id}</span> },
    { accessorKey: "renterName", header: "Renter", cell: ({ row }) => <div><div className="font-medium">{row.original.renterName}</div><div className="text-xs text-muted-foreground">{row.original.purpose ?? row.original.organization}</div></div> },
    { accessorKey: "summary", header: "Items", enableSorting: false, cell: ({ row }) => <div className="max-w-sm text-sm whitespace-normal"><span className="tabular">{row.original.pieces} pc</span> · <span className="line-clamp-1 inline text-muted-foreground">{row.original.summary}</span></div> },
    { accessorKey: "dateOut", header: "Out", cell: ({ row }) => fmtDate(row.original.dateOut) },
    { accessorKey: "dateDue", header: "Due", cell: ({ row }) => fmtDate(row.original.dateDue) },
    { id: "state", accessorFn: (r) => state(r, today), header: "Status", filterFn: (row, id, v: string) => v === "all" || (v === "open" ? row.original.status === "out" : row.getValue(id) === v),
      cell: ({ row }) => { const s = state(row.original, today); return s === "returned" ? <div><Pill>Returned {fmtDate(row.original.dateReturned)}</Pill></div> : s === "overdue" ? <Pill tone="red">Overdue</Pill> : <Pill tone="amber">Out</Pill>; } },
    { accessorKey: "rating", header: "Rating", cell: ({ row }) => row.original.status === "returned" ? <><Stars value={row.original.rating} />{row.original.damage > 0 && <div className="text-xs text-destructive">Damage {money(row.original.damage)}</div>}</> : null },
  ], [today]);
  const table = useTable({ features, data: rows, columns, state: { globalFilter: q, columnFilters: filters }, onGlobalFilterChange: setQ, onColumnFiltersChange: setFilters,
    globalFilterFn: "includesString", initialState: { pagination: { pageIndex: 0, pageSize: 50 } } });
  const v = (filters[0]?.value as string) ?? "all";
  if (!rows.length) return <Empty>No rentals yet. Add an approved renter, then start a rental from here or from your pull list.</Empty>;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup value={[v]} onValueChange={(x) => x[0] && setFilters([{ id: "state", value: x[0] }])} variant="outline" size="sm">
          <ToggleGroupItem value="open">Out ({counts.open})</ToggleGroupItem>
          <ToggleGroupItem value="overdue">Overdue ({counts.overdue})</ToggleGroupItem>
          <ToggleGroupItem value="returned">Returned ({counts.returned})</ToggleGroupItem>
          <ToggleGroupItem value="all">All ({counts.all})</ToggleGroupItem>
        </ToggleGroup>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search renters, items, purposes…" className="max-w-sm" aria-label="Search rentals" />
      </div>
      <DataTable table={table} onRowClick={(r) => router.push(`/rentals/${r.id}`)} empty="No rentals here." />
      <Pager table={table} label="rentals" />
    </div>
  );
}
