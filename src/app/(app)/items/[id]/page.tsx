import Link from "next/link";
import { Fragment, Suspense } from "react";
import { notFound } from "next/navigation";
import { Copy, Pencil } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getItem } from "@/server/queries/items";
import { PageHeader } from "@/components/app/page-header";
import { Availability, Condition, Empty, Pill, TagChip } from "@/components/app/bits";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COND, fmtDate, fmtWhen, money } from "@/lib/format";
import { ConditionDialog, Gallery, ItemMenu } from "./item-client";

export default function Page({ params }: PageProps<"/items/[id]">) {
  return <Suspense><Content params={params} /></Suspense>;
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false);
  if (!shown.length) return <p className="text-sm text-muted-foreground">Nothing recorded.</p>;
  return <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">{shown.map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></Fragment>)}</dl>;
}

async function Content({ params }: { params: PageProps<"/items/[id]">["params"] }) {
  const me = await requireUser();
  const d = await getItem(Number((await params).id) || 0);
  if (!d) notFound();
  const { item: it } = d;
  const inch = (v: number | null) => (v == null ? null : `${v}″`);
  const pullInfo = { id: it.id, tag: it.tag, name: it.name, category: it.category, size: it.size, photo: it.mainPhoto, qty: 1, max: it.quantity };
  return (
    <>
      <PageHeader eyebrow={<TagChip tag={it.tag} />} title={it.name} crumbs={[{ href: "/items", label: "Inventory" }]} actions={<>
        <ConditionDialog id={it.id} condition={it.condition} status={it.status} notes={it.conditionNotes} />
        <Link href={`/items/${it.id}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil />Edit</Link>
        <Link href={`/items/new?copy=${it.id}`} className={buttonVariants({ variant: "outline" })}><Copy />Copy</Link>
        <ItemMenu pull={pullInfo} canDelete={me.role === "director"} hasHistory={d.rentals.length + d.shows.length > 0} />
      </>}>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Availability it={it} /><Condition value={it.condition} />
          <span>{[it.category, it.subcategory].filter(Boolean).join(" · ")}</span>
          {it.quantity > 1 && <Pill>qty {it.quantity}</Pill>}
          {!it.rentable && <Pill>Not for rent</Pill>}
        </div>
      </PageHeader>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Gallery itemId={it.id} name={it.name} photos={d.photos} />
        <div className="grid gap-5">
          <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader><CardContent className="grid gap-4">
            {it.description && <p className="text-sm whitespace-pre-wrap">{it.description}</p>}
            <Facts rows={[["Era", it.era], ["Gender", it.gender], ["Color", it.color], ["Material", it.material], ["Pattern", it.pattern], ["Size", it.size], ["Shoe size", it.shoeSize],
              ["Chest", inch(it.chest)], ["Waist", inch(it.waist)], ["Hips", inch(it.hips)], ["Inseam", inch(it.inseam)], ["Neck", inch(it.neck)], ["Sleeve", inch(it.sleeve)], ["Head", inch(it.head)],
              ["Location", it.location], ["Keywords", it.keywords]]} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Value &amp; source</CardTitle></CardHeader><CardContent>
            <Facts rows={[["Acquired", it.acquiredDate && fmtDate(it.acquiredDate)], ["From", it.acquiredFrom], ["Cost", it.cost != null && money(it.cost)],
              ["Replacement", it.replacementValue != null && money(it.replacementValue)], ["Rental rate", it.rentalRate != null && money(it.rentalRate)],
              ["Added", `${fmtWhen(it.createdAt)}${it.createdBy ? ` by ${it.createdBy}` : ""}`], ["Last change", it.updatedAt && `${fmtWhen(it.updatedAt)}${it.updatedBy ? ` by ${it.updatedBy}` : ""}`]]} />
            {it.notes && <p className="mt-3 rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{it.notes}</p>}
          </CardContent></Card>
        </div>
      </div>

      <Card className="mt-5"><CardHeader><CardTitle>Used in shows</CardTitle></CardHeader><CardContent>
        {!d.shows.length ? <Empty>Not used in any show yet.</Empty> : (
          <Table><TableHeader><TableRow><TableHead>Show</TableHead><TableHead>Character / scene</TableHead><TableHead>Out</TableHead><TableHead>Returned</TableHead><TableHead>Condition</TableHead></TableRow></TableHeader>
            <TableBody>{d.shows.map(({ line: l, show: s }) => (
              <TableRow key={l.id}>
                <TableCell><Link href={`/shows/${s.id}`} className="font-medium hover:underline">{s.title}</Link><div className="text-xs text-muted-foreground">{[s.type, s.season, s.year].filter(Boolean).join(" · ")}</div></TableCell>
                <TableCell className="whitespace-normal">{[l.character, l.actor && `worn by ${l.actor}`, l.scene].filter(Boolean).join(" · ") || "—"}{l.usageNotes && <div className="text-xs text-muted-foreground">{l.usageNotes}</div>}{l.alterations && <div className="text-xs text-muted-foreground">Alterations: {l.alterations}</div>}</TableCell>
                <TableCell>{fmtDate(l.dateOut)}</TableCell>
                <TableCell>{l.dateReturned ? fmtDate(l.dateReturned) : <Pill tone="amber">Still out</Pill>}</TableCell>
                <TableCell className="text-sm">{COND[l.conditionOut]}{l.conditionIn ? ` → ${COND[l.conditionIn]}` : ""}</TableCell>
              </TableRow>))}</TableBody></Table>)}
      </CardContent></Card>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Rental history</CardTitle></CardHeader><CardContent>
          {!d.rentals.length ? <Empty>Never rented out.</Empty> : (
            <Table><TableHeader><TableRow><TableHead>Renter</TableHead><TableHead>Out</TableHead><TableHead>Back</TableHead><TableHead>Condition</TableHead></TableRow></TableHeader>
              <TableBody>{d.rentals.map(({ line: l, rental: r, renter: p }) => (
                <TableRow key={l.id}>
                  <TableCell><Link href={`/rentals/${r.id}`} className="font-medium hover:underline">{p.name}</Link>{p.organization && <div className="text-xs text-muted-foreground">{p.organization}</div>}</TableCell>
                  <TableCell>{fmtDate(r.dateOut)}</TableCell>
                  <TableCell>{r.dateReturned ? fmtDate(r.dateReturned) : <Pill tone="amber">Out</Pill>}</TableCell>
                  <TableCell className="text-sm">{COND[l.conditionOut]}{l.conditionIn ? ` → ${COND[l.conditionIn]}` : ""}{l.damageCharge ? <div className="text-xs text-destructive">Damage {money(l.damageCharge)}</div> : null}</TableCell>
                </TableRow>))}</TableBody></Table>)}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Condition history</CardTitle></CardHeader><CardContent>
          <ol className="grid gap-3">{d.conditions.map((c) => (
            <li key={c.id} className="grid grid-cols-[auto_1fr] gap-3 text-sm">
              <Condition value={c.condition} />
              <div><span className="font-medium">{c.source}</span><div className="text-xs text-muted-foreground">{fmtWhen(c.at)}{c.user ? ` · ${c.user}` : ""}</div>{c.notes && <div className="mt-0.5">{c.notes}</div>}</div>
            </li>))}</ol>
        </CardContent></Card>
      </div>
    </>
  );
}
