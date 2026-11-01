import { connection } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activity, items, rentalItems, rentals, renters, showItems, showPeople, shows, sponsors } from "@stm/core/db/schema";
import { currentUser } from "@/server/auth";
import { toCsv } from "@/server/csv";

const COND = ["", "Needs repair", "Poor", "Fair", "Good", "Excellent"];
const c = (n: number | null) => (n ? COND[n] : "");

/** Spreadsheet (CSV) exports that open in Excel or Google Sheets. */
const EXPORTS: Record<string, { file: string; build: () => [string[], unknown[][]] }> = {
  items: { file: "inventory", build: () => {
    const rows = db().select().from(items).orderBy(asc(items.tag)).all();
    const cols = Object.keys(items).filter((k) => k !== "mainPhoto") as (keyof (typeof rows)[number])[];
    return [cols as string[], rows.map((r) => cols.map((k) => (k === "condition" ? c(r.condition) : r[k])))];
  } },
  "show-items": { file: "show-usage-history", build: () => {
    const rows = db().select({ show: shows.title, year: shows.year, season: shows.season, tag: items.tag, item: items.name, category: items.category, qty: showItems.qty, character: showItems.character, actor: showItems.actor,
      scene: showItems.scene, usage: showItems.usageNotes, alterations: showItems.alterations, out: showItems.dateOut, condOut: showItems.conditionOut, back: showItems.dateReturned, condIn: showItems.conditionIn, notesIn: showItems.notesIn })
      .from(showItems).innerJoin(shows, eq(shows.id, showItems.showId)).innerJoin(items, eq(items.id, showItems.itemId)).orderBy(sql`${shows.year} DESC`, asc(shows.title), asc(items.tag)).all();
    return [["Show", "Year", "Season", "Tag", "Item", "Category", "Qty", "Character", "Worn/used by", "Scene", "How used", "Alterations", "Out", "Condition out", "Returned", "Condition back", "Return notes"],
      rows.map((r) => [r.show, r.year, r.season, r.tag, r.item, r.category, r.qty, r.character, r.actor, r.scene, r.usage, r.alterations, r.out, c(r.condOut), r.back, c(r.condIn), r.notesIn])];
  } },
  shows: { file: "shows", build: () => {
    const rows = db().select().from(shows).orderBy(sql`${shows.year} DESC`, asc(shows.title)).all();
    const people = db().select().from(showPeople).orderBy(asc(showPeople.sort)).all();
    return [["Title", "Type", "Season", "Year", "Status", "Director", "Venue", "Opens", "Closes", "Written by", "Book by", "Music by", "Lyrics by", "Based on", "Licensor", "Cast", "Team & crew"],
      rows.map((s) => { const p = people.filter((x) => x.showId === s.id); return [s.title, s.type, s.season, s.year, s.status, s.director, s.venue, s.openDate, s.closeDate, s.writtenBy, s.bookBy, s.musicBy, s.lyricsBy, s.basedOn, s.licensor,
        p.filter((x) => x.kind === "cast").map((x) => `${x.name}${x.role ? ` (${x.role})` : ""}`).join("; "), p.filter((x) => x.kind !== "cast").map((x) => `${x.name}${x.role ? ` (${x.role})` : ""}`).join("; ")]; })];
  } },
  rentals: { file: "rentals", build: () => {
    const rows = db().select({ r: rentals, renter: renters.name, tag: items.tag, item: items.name, line: rentalItems }).from(rentalItems).innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
      .innerJoin(renters, eq(renters.id, rentals.renterId)).innerJoin(items, eq(items.id, rentalItems.itemId)).orderBy(sql`${rentals.dateOut} DESC`, asc(items.tag)).all();
    return [["Rental #", "Renter", "For", "Out", "Due", "Returned", "Status", "Fee", "Deposit", "Rating", "Rating notes", "Tag", "Item", "Qty", "Condition out", "Condition back", "Damage charge", "Return notes"],
      rows.map(({ r, renter, tag, item, line: l }) => [r.id, renter, r.purpose, r.dateOut, r.dateDue, r.dateReturned, r.status, r.fee, r.deposit, r.rating, r.ratingNotes, tag, item, l.qty, c(l.conditionOut), c(l.conditionIn), l.damageCharge, l.notesIn])];
  } },
  renters: { file: "renters", build: () => {
    const rows = db().select().from(renters).orderBy(asc(renters.name)).all();
    const stats = db().select({ id: rentals.renterId, n: sql<number>`count(*)`, avg: sql<number | null>`round(avg(${rentals.rating}),1)` }).from(rentals).groupBy(rentals.renterId).all();
    return [["Name", "Organization", "Contact", "Email", "Phone", "Address", "Approved", "Rentals", "Average rating", "Notes"],
      rows.map((r) => { const s = stats.find((x) => x.id === r.id); return [r.name, r.organization, r.contactName, r.email, r.phone, r.address, r.approved, s?.n ?? 0, s?.avg ?? "", r.notes]; })];
  } },
  sponsors: { file: "sponsors", build: () => {
    const rows = db().select().from(sponsors).orderBy(asc(sponsors.name)).all();
    return [["Name", "Tier", "Ad size", "Message", "Amount", "Website", "Contact", "Email", "Phone", "Active", "Notes"], rows.map((s) => [s.name, s.tier, s.adSize, s.message, s.amount, s.website, s.contactName, s.email, s.phone, s.active, s.notes])];
  } },
  activity: { file: "activity-log", build: () => {
    const rows = db().select().from(activity).orderBy(sql`${activity.id} DESC`).all();
    return [["When", "Who", "What", "Details"], rows.map((a) => [a.at, a.user, a.action, a.details])];
  } },
};

export async function GET(_req: Request, ctx: RouteContext<"/api/export/[what]">) {
  await connection();
  if (!(await currentUser())) return new Response("Sign in first.", { status: 401 });
  const e = EXPORTS[(await ctx.params).what];
  if (!e) return new Response("Not found", { status: 404 });
  const [head, rows] = e.build();
  return new Response(toCsv(head, rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${e.file}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
