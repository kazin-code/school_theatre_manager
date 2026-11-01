"use client";
import { FlexRender, type ReactTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { F } from "@/lib/table";

/** Renders a TanStack table with shadcn's table styles: click headers to sort, click rows to open. */
export function DataTable<T extends object>({ table, onRowClick, empty }: { table: ReactTable<F, T, any>; onRowClick?: (row: T) => void; empty?: React.ReactNode }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rows = table.getRowModel().rows;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/40">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => {
                const sort = h.column.getIsSorted();
                return (
                  <TableHead key={h.id} className={cn("text-xs uppercase tracking-wide", h.column.columnDef.meta?.className)}>
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 uppercase hover:text-foreground">
                        <FlexRender header={h} />
                        {sort === "asc" ? <ArrowUp className="size-3" /> : sort === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : <FlexRender header={h} />}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? rows.map((r) => (
            <TableRow key={r.id} onClick={onRowClick ? (e) => { if (!(e.target as HTMLElement).closest("a,button,input,select,label")) onRowClick(r.original); } : undefined} className={onRowClick ? "cursor-pointer" : undefined}>
              {r.getVisibleCells().map((c) => <TableCell key={c.id} className={cn("align-top", c.column.columnDef.meta?.className)}><FlexRender cell={c} /></TableCell>)}
            </TableRow>
          )) : (
            <TableRow><TableCell colSpan={table.getVisibleLeafColumns().length} className="py-10 text-center text-muted-foreground">{empty ?? "Nothing to show."}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/** "Showing 1–50 of 230" with previous/next and show-more controls. */
export function Pager<T extends object>({ table, label = "items" }: { table: ReactTable<F, T, any>; label?: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { pageIndex, pageSize } = table.state.pagination;
  const total = table.getPrePaginatedRowModel().rows.length;
  if (total <= pageSize) return null;
  const from = pageIndex * pageSize + 1, to = Math.min(total, from + pageSize - 1);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="tabular text-muted-foreground">Showing {from}–{to} of {total} {label}</span>
      <button type="button" className="ml-auto rounded-lg border px-3 py-1 hover:bg-muted disabled:opacity-40" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</button>
      <button type="button" className="rounded-lg border px-3 py-1 hover:bg-muted disabled:opacity-40" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button>
    </div>
  );
}
