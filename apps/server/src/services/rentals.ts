import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { z } from "zod";
import { optDate, optNumber, optText, renterSchema, rentalSchema, returnSchema } from "@stm/core/db/validation";
import { col, db, int, listOf, nocase, nowIso, one, round, t, today, tx, write } from "../db";
import { bad, gone } from "../errors";
import { logActivity } from "../activity";
import { requireAvailable } from "../availability";
import type { Me } from "../me";

const RENTER = () => col("renters", "id");
const RENTAL = () => col("rentals", "id");
const renterStats = () => ({
  rentalCount: int(sql`(SELECT COUNT(*) FROM rentals r WHERE r.renter_id=${RENTER()})`).as("rental_count"),
  openCount: int(sql`(SELECT COUNT(*) FROM rentals r WHERE r.renter_id=${RENTER()} AND r.status='out')`).as("open_count"),
  avgRating: round(sql`(SELECT AVG(r.rating) FROM rentals r WHERE r.renter_id=${RENTER()} AND r.rating IS NOT NULL)`, 1).as("avg_rating"),
  ratingCount: int(sql`(SELECT COUNT(r.rating) FROM rentals r WHERE r.renter_id=${RENTER()})`).as("rating_count"),
  damage: sql<number>`(SELECT COALESCE(SUM(ri.damage_charge),0) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE r.renter_id=${RENTER()})`.mapWith(Number).as("damage"),
  lastRental: sql<string | null>`(SELECT MAX(r.date_out) FROM rentals r WHERE r.renter_id=${RENTER()})`.as("last_rental"),
});
const rentalStats = () => ({
  renterName: t.renters.name, organization: t.renters.organization,
  pieces: int(sql`(SELECT COALESCE(SUM(qty),0) FROM rental_items WHERE rental_id=${RENTAL()})`).as("pieces"),
  lineCount: int(sql`(SELECT COUNT(*) FROM rental_items WHERE rental_id=${RENTAL()})`).as("line_count"),
  damage: sql<number>`(SELECT COALESCE(SUM(damage_charge),0) FROM rental_items WHERE rental_id=${RENTAL()})`.mapWith(Number).as("damage"),
  summary: sql<string | null>`(SELECT ${listOf(sql`i.name`, ", ")} FROM rental_items ri JOIN items i ON i.id=ri.item_id WHERE ri.rental_id=${RENTAL()})`.as("summary"),
});

export async function listRenters() {
  return db().select({ ...getTableColumns(t.renters), ...renterStats() }).from(t.renters).orderBy(nocase(t.renters.name));
}
export type RenterRow = Awaited<ReturnType<typeof listRenters>>[number];

export async function listRentals() {
  return db().select({ ...getTableColumns(t.rentals), ...rentalStats() }).from(t.rentals).innerJoin(t.renters, eq(t.renters.id, t.rentals.renterId))
    .orderBy(sql`CASE WHEN ${t.rentals.status}='out' THEN 0 ELSE 1 END`, desc(t.rentals.dateOut), desc(t.rentals.id));
}
export type RentalRow = Awaited<ReturnType<typeof listRentals>>[number];

export async function getRenter(id: number) {
  const renter = await one(db().select({ ...getTableColumns(t.renters), ...renterStats() }).from(t.renters).where(eq(t.renters.id, id)).limit(1));
  if (!renter) return null;
  const history = await db().select({ ...getTableColumns(t.rentals), ...rentalStats() }).from(t.rentals).innerJoin(t.renters, eq(t.renters.id, t.rentals.renterId))
    .where(eq(t.rentals.renterId, id)).orderBy(desc(t.rentals.dateOut), desc(t.rentals.id));
  return { renter, history };
}

export async function getRental(id: number) {
  const r = await one(db().select({ rental: t.rentals, renter: t.renters }).from(t.rentals).innerJoin(t.renters, eq(t.renters.id, t.rentals.renterId)).where(eq(t.rentals.id, id)).limit(1));
  if (!r) return null;
  const lines = await db().select({ line: t.rentalItems, item: { id: t.items.id, tag: t.items.tag, name: t.items.name, category: t.items.category, size: t.items.size, mainPhoto: t.items.mainPhoto, condition: t.items.condition, replacementValue: t.items.replacementValue, rentalRate: t.items.rentalRate } })
    .from(t.rentalItems).innerJoin(t.items, eq(t.items.id, t.rentalItems.itemId)).where(eq(t.rentalItems.rentalId, id)).orderBy(asc(t.items.category), asc(t.items.name));
  return { ...r, lines };
}

// ---------- renters ----------
export function saveRenter(me: Me, id: number | null, input: unknown) {
  return write(async () => {
    const v = renterSchema.parse(input);
    if (id) {
      const old = await one(db().select().from(t.renters).where(eq(t.renters.id, id)).limit(1));
      if (!old) throw gone("That renter");
      await db().update(t.renters).set({ ...v, approvedDate: v.approved && !old.approved ? today() : old.approvedDate, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.renters.id, id));
      await logActivity(me.displayName, "renter", `Edited renter ${v.name}${old.approved !== v.approved ? (v.approved ? " (approved)" : " (approval removed)") : ""}`);
      return { id };
    }
    const row = (await one(db().insert(t.renters).values({ ...v, approvedDate: v.approved ? today() : null, createdBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).returning({ id: t.renters.id })))!;
    await logActivity(me.displayName, "renter", `Added renter ${v.name}`);
    return { id: row.id };
  });
}

export function deleteRenter(me: Me, id: number) {
  return write(async () => {
    const r = await one(db().select().from(t.renters).where(eq(t.renters.id, id)).limit(1));
    if (!r) throw gone("That renter");
    const n = (await one(db().select({ n: int(sql`count(*)`) }).from(t.rentals).where(eq(t.rentals.renterId, id))))!.n;
    if (n) throw bad("This renter has rental history, so they can't be deleted. Remove their approval instead to keep the history.");
    await db().delete(t.renters).where(eq(t.renters.id, id));
    await logActivity(me.displayName, "renter", `Deleted renter ${r.name}`);
  });
}

// ---------- rentals ----------
export function createRental(me: Me, input: unknown) {
  return write(async () => {
    const v = rentalSchema.parse(input);
    const who = await one(db().select().from(t.renters).where(eq(t.renters.id, v.renterId)).limit(1));
    if (!who) throw bad("Choose a renter.", { renterId: "Choose a renter." });
    if (!who.approved) throw bad(`${who.name} isn't on the approved renters list. Approve them first.`);
    await requireAvailable(v.lines, { rentable: true });
    const id = await tx(async (d) => {
      const row = (await one(d.insert(t.rentals).values({ renterId: v.renterId, purpose: v.purpose, dateOut: v.dateOut, dateDue: v.dateDue, fee: v.fee, deposit: v.deposit, notes: v.notes, status: "out", createdBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).returning({ id: t.rentals.id })))!;
      await d.insert(t.rentalItems).values(v.lines.map((l) => ({ rentalId: row.id, itemId: l.itemId, qty: l.qty, conditionOut: l.conditionOut, notesOut: l.notesOut })));
      return row.id;
    });
    await logActivity(me.displayName, "rental", `Rented ${v.lines.reduce((a, l) => a + l.qty, 0)} piece(s) to ${who.name} (rental #${id})`);
    return { id, itemIds: v.lines.map((l) => l.itemId) };
  });
}

const rentalEdit = z.object({ purpose: optText(200), dateDue: optDate(), fee: optNumber({ label: "Enter an amount" }), deposit: optNumber({ label: "Enter an amount" }), notes: optText(2000) });
export function updateRental(me: Me, id: number, input: unknown) {
  return write(async () => {
    const v = rentalEdit.parse(input);
    const r = await one(db().select().from(t.rentals).where(eq(t.rentals.id, id)).limit(1));
    if (!r) throw gone("That rental");
    if (v.dateDue && v.dateDue < r.dateOut) throw bad("The due date is before the checkout date.", { dateDue: "Before the checkout date" });
    await db().update(t.rentals).set({ ...v, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.rentals.id, id));
  });
}

export function returnRental(me: Me, id: number, input: unknown) {
  return write(async () => {
    const v = returnSchema.parse(input);
    const r = await one(db().select({ rental: t.rentals, renter: t.renters }).from(t.rentals).innerJoin(t.renters, eq(t.renters.id, t.rentals.renterId)).where(eq(t.rentals.id, id)).limit(1));
    if (!r) throw gone("That rental");
    if (r.rental.status !== "out") throw bad("This rental has already been checked in.");
    if (v.dateReturned < r.rental.dateOut) throw bad("The return date is before the checkout date.");
    await tx(async (d) => {
      for (const l of v.lines) {
        const line = await one(d.select().from(t.rentalItems).where(and(eq(t.rentalItems.id, l.id), eq(t.rentalItems.rentalId, id))).limit(1));
        if (!line) continue;
        await d.update(t.rentalItems).set({ conditionIn: l.conditionIn, notesIn: l.notesIn, damageCharge: l.damageCharge }).where(eq(t.rentalItems.id, l.id));
        const it = (await one(d.select({ condition: t.items.condition, status: t.items.status }).from(t.items).where(eq(t.items.id, line.itemId)).limit(1)))!;
        const status = l.sendToRepair ? "repair" : it.status;
        if (it.condition !== l.conditionIn || status !== it.status || l.notesIn) {
          await d.update(t.items).set({ condition: l.conditionIn, status, ...(l.notesIn ? { conditionNotes: l.notesIn } : {}), updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.items.id, line.itemId));
          await d.insert(t.conditionLog).values({ itemId: line.itemId, condition: l.conditionIn, notes: l.notesIn, source: `Returned from rental to ${r.renter.name}${l.sendToRepair ? " · sent to repair" : ""}`, user: me.displayName });
        }
      }
      await d.update(t.rentals).set({ status: "returned", dateReturned: v.dateReturned, rating: v.rating, ratingNotes: v.ratingNotes, depositReturned: v.depositReturned ?? null, returnedBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.rentals.id, id));
    });
    await logActivity(me.displayName, "rental", `Checked in rental #${id} from ${r.renter.name}: rated ${v.rating}/5`);
  });
}

/** Undo a rental entered by mistake (only while it's still out). */
export function cancelRental(me: Me, id: number) {
  return write(async () => {
    const r = await one(db().select().from(t.rentals).where(eq(t.rentals.id, id)).limit(1));
    if (!r) throw gone("That rental");
    if (r.status !== "out") throw bad("Only a rental that is still out can be cancelled.");
    await db().delete(t.rentals).where(eq(t.rentals.id, id));
    await logActivity(me.displayName, "rental", `Cancelled rental #${id} (entered by mistake)`);
  });
}
