import { asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db, int, round, t } from "../db";
import { toCsv } from "../csv";

const COND = ["", "Needs repair", "Poor", "Fair", "Good", "Excellent"];
const c = (n: number | null) => (n ? COND[n] : "");

/** Spreadsheet (CSV) exports that open in Excel or Google Sheets. */
export const EXPORTS: Record<string, { file: string; build: () => Promise<[string[], unknown[][]]> }> = {
  items: { file: "inventory", build: async () => {
    const rows = await db().select().from(t.items).orderBy(asc(t.items.tag));
    const cols = Object.keys(getTableColumns(t.items)).filter((k) => k !== "mainPhoto") as (keyof (typeof rows)[number])[];
    return [cols as string[], rows.map((r) => cols.map((k) => (k === "condition" ? c(r.condition) : r[k])))];
  } },
  "show-items": { file: "show-usage-history", build: async () => {
    const rows = await db().select({ show: t.shows.title, year: t.shows.year, season: t.shows.season, tag: t.items.tag, item: t.items.name, category: t.items.category, qty: t.showItems.qty, character: t.showItems.character, actor: t.showItems.actor,
      scene: t.showItems.scene, usage: t.showItems.usageNotes, alterations: t.showItems.alterations, out: t.showItems.dateOut, condOut: t.showItems.conditionOut, back: t.showItems.dateReturned, condIn: t.showItems.conditionIn, notesIn: t.showItems.notesIn })
      .from(t.showItems).innerJoin(t.shows, eq(t.shows.id, t.showItems.showId)).innerJoin(t.items, eq(t.items.id, t.showItems.itemId)).orderBy(sql`${t.shows.year} DESC NULLS LAST`, asc(t.shows.title), asc(t.items.tag));
    return [["Show", "Year", "Season", "Tag", "Item", "Category", "Qty", "Character", "Worn/used by", "Scene", "How used", "Alterations", "Out", "Condition out", "Returned", "Condition back", "Return notes"],
      rows.map((r) => [r.show, r.year, r.season, r.tag, r.item, r.category, r.qty, r.character, r.actor, r.scene, r.usage, r.alterations, r.out, c(r.condOut), r.back, c(r.condIn), r.notesIn])];
  } },
  shows: { file: "shows", build: async () => {
    const rows = await db().select().from(t.shows).orderBy(sql`${t.shows.year} DESC NULLS LAST`, asc(t.shows.title));
    const people = await db().select().from(t.showPeople).orderBy(asc(t.showPeople.sort));
    return [["Title", "Type", "Season", "Year", "Status", "Director", "Venue", "Opens", "Closes", "Written by", "Book by", "Music by", "Lyrics by", "Based on", "Licensor", "Cast", "Team & crew"],
      rows.map((s) => { const p = people.filter((x) => x.showId === s.id); return [s.title, s.type, s.season, s.year, s.status, s.director, s.venue, s.openDate, s.closeDate, s.writtenBy, s.bookBy, s.musicBy, s.lyricsBy, s.basedOn, s.licensor,
        p.filter((x) => x.kind === "cast").map((x) => `${x.name}${x.role ? ` (${x.role})` : ""}`).join("; "), p.filter((x) => x.kind !== "cast").map((x) => `${x.name}${x.role ? ` (${x.role})` : ""}`).join("; ")]; })];
  } },
  rentals: { file: "rentals", build: async () => {
    const rows = await db().select({ r: t.rentals, renter: t.renters.name, tag: t.items.tag, item: t.items.name, line: t.rentalItems }).from(t.rentalItems).innerJoin(t.rentals, eq(t.rentals.id, t.rentalItems.rentalId))
      .innerJoin(t.renters, eq(t.renters.id, t.rentals.renterId)).innerJoin(t.items, eq(t.items.id, t.rentalItems.itemId)).orderBy(desc(t.rentals.dateOut), asc(t.items.tag));
    return [["Rental #", "Renter", "For", "Out", "Due", "Returned", "Status", "Fee", "Deposit", "Rating", "Rating notes", "Tag", "Item", "Qty", "Condition out", "Condition back", "Damage charge", "Return notes"],
      rows.map(({ r, renter, tag, item, line: l }) => [r.id, renter, r.purpose, r.dateOut, r.dateDue, r.dateReturned, r.status, r.fee, r.deposit, r.rating, r.ratingNotes, tag, item, l.qty, c(l.conditionOut), c(l.conditionIn), l.damageCharge, l.notesIn])];
  } },
  renters: { file: "renters", build: async () => {
    const rows = await db().select().from(t.renters).orderBy(asc(t.renters.name));
    const stats = await db().select({ id: t.rentals.renterId, n: int(sql`count(*)`), avg: round(sql`avg(${t.rentals.rating})`, 1) }).from(t.rentals).groupBy(t.rentals.renterId);
    return [["Name", "Organization", "Contact", "Email", "Phone", "Address", "Approved", "Rentals", "Average rating", "Notes"],
      rows.map((r) => { const s = stats.find((x) => x.id === r.id); return [r.name, r.organization, r.contactName, r.email, r.phone, r.address, r.approved, s?.n ?? 0, s?.avg ?? "", r.notes]; })];
  } },
  sponsors: { file: "sponsors", build: async () => {
    const rows = await db().select().from(t.sponsors).orderBy(asc(t.sponsors.name));
    return [["Name", "Tier", "Ad size", "Message", "Amount", "Website", "Contact", "Email", "Phone", "Active", "Notes"], rows.map((s) => [s.name, s.tier, s.adSize, s.message, s.amount, s.website, s.contactName, s.email, s.phone, s.active, s.notes])];
  } },
  activity: { file: "activity-log", build: async () => {
    const rows = await db().select().from(t.activity).orderBy(desc(t.activity.id));
    return [["When", "Who", "What", "Details"], rows.map((a) => [a.at, a.user, a.action, a.details])];
  } },
};

export async function exportCsv(what: string) {
  const e = EXPORTS[what];
  if (!e) return null;
  const [head, rows] = await e.build();
  return { file: `${e.file}-${new Date().toISOString().slice(0, 10)}.csv`, csv: toCsv(head, rows) };
}
