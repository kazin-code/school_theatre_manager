"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTable, type ColumnFiltersState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Pager } from "@/components/app/data-table";
import { NativeSelect } from "@/components/app/fields";
import { Empty, Pill, Stars } from "@/components/app/bits";
import { features, type Col } from "@/lib/table";
import { fmtDate, money } from "@/lib/format";
import type { RenterRow } from "@/server/queries/rentals";
import { RenterDialog } from "./renter-dialog";

export function RentersTable({ rows }: { rows: RenterRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<ColumnFiltersState>([]);
  const [adding, setAdding] = useState(false);
  const columns = useMemo<Col<RenterRow>[]>(() => [
    { accessorKey: "name", header: "Renter", cell: ({ row }) => <div><div className="font-medium">{row.original.name}</div><div className="text-xs text-muted-foreground">{[row.original.organization, row.original.contactName].filter(Boolean).join(" · ")}</div></div> },
    { id: "contact", header: "Contact", enableSorting: false, cell: ({ row }) => <div className="text-sm">{row.original.email}<div className="text-muted-foreground">{row.original.phone}</div></div> },
    { accessorKey: "approved", header: "Status", filterFn: (row, id, v: string) => v === "" || String(row.getValue(id)) === v, cell: ({ row }) => row.original.approved ? <Pill tone="green">Approved</Pill> : <Pill>Not approved</Pill> },
    { accessorKey: "avgRating", header: "Rating", sortUndefined: "last", cell: ({ row }) => <Stars value={row.original.avgRating} /> },
    { accessorKey: "rentalCount", header: "Rentals", cell: ({ row }) => <span className="tabular">{row.original.rentalCount}{row.original.openCount ? <span className="text-amber-700 dark:text-amber-400"> · {row.original.openCount} out</span> : ""}</span> },
    { accessorKey: "damage", header: "Damage", cell: ({ row }) => row.original.damage ? <span className="tabular text-destructive">{money(row.original.damage)}</span> : "" },
    { accessorKey: "lastRental", header: "Last rental", cell: ({ row }) => fmtDate(row.original.lastRental) },
  ], []);
  const table = useTable({ features, data: rows, columns, state: { globalFilter: q, columnFilters: filters }, onGlobalFilterChange: setQ, onColumnFiltersChange: setFilters,
    globalFilterFn: "includesString", initialState: { pagination: { pageIndex: 0, pageSize: 50 }, sorting: [{ id: "name", desc: false }] } });
  const approved = (filters.find((f) => f.id === "approved")?.value as string) ?? "";
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, organizations, emails…" className="max-w-sm" aria-label="Search renters" />
        <NativeSelect className="w-auto" value={approved} aria-label="Approval" onChange={(e) => setFilters(e.target.value ? [{ id: "approved", value: e.target.value }] : [])}><option value="">Everyone</option><option value="true">Approved</option><option value="false">Not approved</option></NativeSelect>
        <Button className="ml-auto" onClick={() => setAdding(true)}><Plus />Add a renter</Button>
      </div>
      {!rows.length ? <Empty>No renters yet. Add the schools and groups you lend to; only approved renters can take items out.</Empty> : <><DataTable table={table} onRowClick={(r) => router.push(`/renters/${r.id}`)} empty="No renters match." /><Pager table={table} label="renters" /></>}
      <RenterDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
