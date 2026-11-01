"use client";
import { useMemo, useState } from "react";
import { useTable } from "@tanstack/react-table";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Pager } from "@/components/app/data-table";
import { Empty, Pill } from "@/components/app/bits";
import { features, type Col } from "@/lib/table";
import { money } from "@/lib/format";
import { sponsorUrl } from "@/lib/urls";
import type { Sponsor } from "@stm/core/db/schema";
import { SponsorDialog } from "./sponsor-dialog";

export function SponsorsTable({ rows, tiers, adSizes, canDelete }: { rows: Sponsor[]; tiers: string[]; adSizes: string[]; canDelete: boolean }) {
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ s: Sponsor | null } | null>(null);
  const total = rows.filter((s) => s.active).reduce((a, s) => a + (s.amount ?? 0), 0);
  const columns = useMemo<Col<Sponsor>[]>(() => [
    { id: "logo", header: "", enableSorting: false, meta: { className: "w-16" }, cell: ({ row }) => row.original.logo
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={sponsorUrl(row.original.logo)} alt="" className="size-11 rounded-md border bg-white object-contain p-0.5" /> : <span className="grid size-11 place-items-center rounded-md bg-muted text-muted-foreground"><Users className="size-5" /></span> },
    { accessorKey: "name", header: "Sponsor", cell: ({ row }) => <div><div className="font-medium">{row.original.name}</div><div className="text-xs text-muted-foreground">{row.original.website}</div></div> },
    { accessorKey: "tier", header: "Tier", sortFn: (a, b) => (tiers.indexOf(a.original.tier ?? "") + 1 || 99) - (tiers.indexOf(b.original.tier ?? "") + 1 || 99) },
    { accessorKey: "adSize", header: "Ad size" },
    { accessorKey: "message", header: "Message", enableSorting: false, meta: { className: "max-w-64 whitespace-normal text-sm" } },
    { accessorKey: "amount", header: "Amount", meta: { className: "text-right tabular" }, cell: ({ row }) => (row.original.amount != null ? money(row.original.amount) : "") },
    { id: "contact", header: "Contact", enableSorting: false, cell: ({ row }) => <span className="text-sm">{[row.original.contactName, row.original.email, row.original.phone].filter(Boolean).join(" · ")}</span>, meta: { className: "whitespace-normal" } },
    { accessorKey: "active", header: "In programs", cell: ({ row }) => (row.original.active ? <Pill tone="green">Active</Pill> : <Pill>Off</Pill>) },
  ], [tiers]);
  const table = useTable({ features, data: rows, columns, state: { globalFilter: q }, onGlobalFilterChange: setQ, globalFilterFn: "includesString", initialState: { pagination: { pageIndex: 0, pageSize: 50 } } });
  return (
    <div className="grid gap-3">
      <p className="max-w-[70ch] text-sm text-muted-foreground">Businesses, families and patrons who support your shows. Active sponsors appear in every show&apos;s program wherever you place a Sponsors block, grouped by tier and sized by the ad they bought.{total > 0 && <> Active sponsorships total <b className="text-foreground">{money(total)}</b>.</>}</p>
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sponsors…" className="max-w-sm" aria-label="Search sponsors" />
        <Button className="ml-auto" onClick={() => setEdit({ s: null })}><Plus />Add a sponsor</Button>
      </div>
      {!rows.length ? <Empty>No sponsors yet. Add a local business with a logo or ad, or a family sending a message to the cast.</Empty> : <><DataTable table={table} onRowClick={(s) => setEdit({ s })} empty="No sponsors match." /><Pager table={table} label="sponsors" /></>}
      <SponsorDialog open={!!edit} sponsor={edit?.s} tiers={tiers} adSizes={adSizes} canDelete={canDelete} onClose={() => setEdit(null)} />
    </div>
  );
}
