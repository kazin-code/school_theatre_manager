import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Repeat } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getRenter } from "@/server/queries/rentals";
import { PageHeader } from "@/components/app/page-header";
import { Empty, Pill, Stars } from "@/components/app/bits";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, money } from "@/lib/format";
import { RenterActions } from "./renter-actions";

export default function Page({ params }: PageProps<"/renters/[id]">) { return <Suspense><Content params={params} /></Suspense>; }

async function Content({ params }: { params: PageProps<"/renters/[id]">["params"] }) {
  const me = await requireUser();
  const d = await getRenter(Number((await params).id) || 0);
  if (!d) notFound();
  const r = d.renter;
  return (
    <>
      <PageHeader eyebrow="Renter" title={r.name} crumbs={[{ href: "/renters", label: "Renters" }]} actions={<>
        {r.approved && <Link href={`/rentals/new?renter=${r.id}`} className={buttonVariants()}><Repeat />Start a rental</Link>}
        <RenterActions renter={r} canDelete={me.role === "director" && !d.history.length} />
      </>}>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {r.approved ? <Pill tone="green">Approved{r.approvedDate ? ` ${fmtDate(r.approvedDate)}` : ""}</Pill> : <Pill>Not approved</Pill>}
          <Stars value={r.avgRating} />{r.ratingCount > 0 && <span>from {r.ratingCount} rental{r.ratingCount === 1 ? "" : "s"}</span>}
        </div>
      </PageHeader>
      <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
        <Card><CardHeader><CardTitle>Contact</CardTitle></CardHeader><CardContent className="grid gap-1 text-sm">
          {r.organization && <div>{r.organization}</div>}{r.contactName && <div>{r.contactName}</div>}
          {r.email && <a href={`mailto:${r.email}`} className="text-link hover:underline">{r.email}</a>}{r.phone && <div>{r.phone}</div>}
          {r.address && <div className="whitespace-pre-wrap text-muted-foreground">{r.address}</div>}
          {r.notes && <p className="mt-2 rounded-lg bg-muted p-3 whitespace-pre-wrap">{r.notes}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border p-2"><div className="text-xl font-semibold tabular">{r.rentalCount}</div><div className="text-xs text-muted-foreground">rentals</div></div>
            <div className="rounded-lg border p-2"><div className="text-xl font-semibold tabular">{money(r.damage)}</div><div className="text-xs text-muted-foreground">damage charged</div></div>
          </div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Rental history</CardTitle></CardHeader><CardContent>
          {!d.history.length ? <Empty>No rentals yet.</Empty> : (
            <Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Items</TableHead><TableHead>Out</TableHead><TableHead>Back</TableHead><TableHead>Rating</TableHead></TableRow></TableHeader>
              <TableBody>{d.history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell><Link href={`/rentals/${h.id}`} className="font-medium text-link hover:underline">#{h.id}</Link></TableCell>
                  <TableCell className="max-w-md whitespace-normal">{h.purpose && <div className="font-medium">{h.purpose}</div>}<div className="line-clamp-2 text-xs text-muted-foreground">{h.pieces} piece{h.pieces === 1 ? "" : "s"}: {h.summary}</div></TableCell>
                  <TableCell>{fmtDate(h.dateOut)}</TableCell>
                  <TableCell>{h.dateReturned ? fmtDate(h.dateReturned) : <Pill tone="amber">Out</Pill>}</TableCell>
                  <TableCell><Stars value={h.rating} />{h.damage > 0 && <div className="text-xs text-destructive">Damage {money(h.damage)}</div>}{h.ratingNotes && <div className="max-w-56 text-xs whitespace-normal text-muted-foreground">{h.ratingNotes}</div>}</TableCell>
                </TableRow>))}</TableBody></Table>)}
        </CardContent></Card>
      </div>
    </>
  );
}
