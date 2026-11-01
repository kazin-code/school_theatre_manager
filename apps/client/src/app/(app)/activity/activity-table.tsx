"use client";
import { useMemo, useState } from "react";
import { useTable } from "@tanstack/react-table";
import { features, type Col } from "@/lib/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { Pill } from "@/components/app/bits";
import { fmtWhen } from "@/lib/format";

type Row = { id: number; at: string; user: string | null; action: string; details: string };

export function ActivityTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const columns = useMemo<Col<Row>[]>(() => [
    { accessorKey: "at", header: "When", cell: ({ getValue }) => <span className="whitespace-nowrap tabular">{fmtWhen(getValue<string>())}</span> },
    { accessorKey: "user", header: "Who" },
    { accessorKey: "action", header: "What", cell: ({ getValue }) => <Pill>{getValue<string>()}</Pill> },
    { accessorKey: "details", header: "Details", enableSorting: false, meta: { className: "whitespace-normal" } },
  ], []);
  const table = useTable({ features, data: rows, columns, state: { globalFilter: q }, onGlobalFilterChange: setQ, initialState: { pagination: { pageIndex: 0, pageSize: 50 } }, globalFilterFn: "includesString" });
  return (
    <div className="grid gap-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by person, action, or words…" className="max-w-md" aria-label="Filter activity" />
      <DataTable table={table} empty="No activity yet." />
      {table.getPageCount() > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Newer</Button>
          <span>Page {table.state.pagination.pageIndex + 1} of {table.getPageCount()}</span>
          <Button size="sm" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Older</Button>
        </div>
      )}
    </div>
  );
}
