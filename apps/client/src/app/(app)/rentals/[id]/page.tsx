import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FileText } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getRental } from "@/server/queries/rentals";
import { PageHeader } from "@/components/app/page-header";
import { Pill, Stars, TagChip, Thumb } from "@/components/app/bits";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COND, fmtDate, money, todayISO } from "@/lib/format";
import { RentalActions, ReturnRental } from "./rental-client";

export default function Page({ params }: PageProps<"/rentals/[id]">) { return <Suspense><Content params={params} /></Suspense>; }

async function Content({ params }: { params: PageProps<"/rentals/[id]">["params"] }) {
  await requireUser();
  await connection();
  const d = await getRental(Number((await params).id) || 0);
  if (!d) notFound();
  const { rental: r, renter: p } = d;
  const overdue = r.status === "out" && r.dateDue && r.dateDue < todayISO();
  const damage = d.lines.reduce((a, l) => a + (l.line.damageCharge ?? 0), 0);
  return (
    <>
      <PageHeader eyebrow={`Rental #${r.id}`} title={p.name} crumbs={[{ href: "/rentals", label: "Rentals" }]} actions={<>
        <a href={`/rentals/${r.id}/agreement`} target="_blank" className={buttonVariants({ variant: "outline" })}><FileText />Print agreement</a>
        <RentalActions rental={r} />
      </>}>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {r.status === "returned" ? <Pill>Returned {fmtDate(r.dateReturned)}</Pill> : overdue ? <Pill tone="red">Overdue</Pill> : <Pill tone="amber">Out</Pill>}
          {r.purpose && <span>{r.purpose}</span>}
          <span>Out {fmtDate(r.dateOut)}{r.dateDue ? ` · due ${fmtDate(r.dateDue)}` : ""}</span>
          <Link href={`/renters/${p.id}`} className="text-link hover:underline">Renter history</Link>
        </div>
      </PageHeader>
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        {r.status === "out" ? <ReturnRental rental={r} lines={d.lines} /> : (
          <Card><CardHeader><CardTitle>Items</CardTitle></CardHeader><CardContent>
            <Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Went out</TableHead><TableHead>Came back</TableHead><TableHead className="text-right">Damage</TableHead></TableRow></TableHeader>
              <TableBody>{d.lines.map(({ line: l, item: i }) => (
                <TableRow key={l.id}>
                  <TableCell><div className="flex items-center gap-3"><Thumb file={i.mainPhoto} className="size-10" /><div><Link href={`/items/${i.id}`} className="font-medium hover:underline">{i.name}</Link>{l.qty > 1 && ` × ${l.qty}`}<div><TagChip tag={i.tag} /></div></div></div></TableCell>
                  <TableCell className="whitespace-normal">{COND[l.conditionOut]}{l.notesOut && <div className="text-xs text-muted-foreground">{l.notesOut}</div>}</TableCell>
                  <TableCell className="whitespace-normal">{l.conditionIn ? <span className={l.conditionIn < l.conditionOut ? "font-medium text-destructive" : ""}>{COND[l.conditionIn]}</span> : "—"}{l.notesIn && <div className="text-xs text-muted-foreground">{l.notesIn}</div>}</TableCell>
                  <TableCell className="text-right tabular">{l.damageCharge ? money(l.damageCharge) : ""}</TableCell>
                </TableRow>))}</TableBody></Table>
          </CardContent></Card>)}
        <Card><CardHeader><CardTitle>Summary</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Pieces</span><span className="tabular">{d.lines.reduce((a, l) => a + l.line.qty, 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span className="tabular">{money(r.fee)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Deposit</span><span className="tabular">{money(r.deposit)}{r.status === "returned" && r.deposit ? (r.depositReturned ? " · returned" : " · kept") : ""}</span></div>
          {damage > 0 && <div className="flex justify-between text-destructive"><span>Damage charges</span><span className="tabular">{money(damage)}</span></div>}
          {r.status === "returned" && <div className="mt-2 border-t pt-2"><div className="text-muted-foreground">Rating</div><Stars value={r.rating} />{r.ratingNotes && <p className="mt-1">{r.ratingNotes}</p>}<div className="mt-1 text-xs text-muted-foreground">Checked in by {r.returnedBy}</div></div>}
          {r.notes && <p className="mt-2 rounded-lg bg-muted p-3 whitespace-pre-wrap">{r.notes}</p>}
          <div className="text-xs text-muted-foreground">Started by {r.createdBy}</div>
        </CardContent></Card>
      </div>
    </>
  );
}
