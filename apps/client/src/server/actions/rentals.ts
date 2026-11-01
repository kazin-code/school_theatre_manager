"use server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conditionLog, items, rentalItems, rentals, renters } from "@stm/core/db/schema";
import { optDate, optNumber, optText, renterSchema, rentalSchema, returnSchema } from "@stm/core/db/validation";
import { actionUser, ActionError } from "../auth";
import { logActivity } from "../activity";
import { changed, nowIso, run, today } from "../action";
import { T } from "../tags";
import { requireAvailable } from "../availability";

// ---------- renters ----------
export async function saveRenterAction(id: number | null, input: unknown) {
  return run(async () => {
    const me = await actionUser();
    const v = renterSchema.parse(input);
    if (id) {
      const old = db().select().from(renters).where(eq(renters.id, id)).get();
      if (!old) throw new ActionError("That renter no longer exists.");
      db().update(renters).set({ ...v, approvedDate: v.approved && !old.approved ? today() : old.approvedDate, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(renters.id, id)).run();
      logActivity(me.displayName, "renter", `Edited renter ${v.name}${old.approved !== v.approved ? (v.approved ? " (approved)" : " (approval removed)") : ""}`);
      changed(T.renters);
      return { id };
    }
    const row = db().insert(renters).values({ ...v, approvedDate: v.approved ? today() : null, createdBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).returning({ id: renters.id }).get();
    logActivity(me.displayName, "renter", `Added renter ${v.name}`);
    changed(T.renters);
    return { id: row.id };
  });
}

export async function deleteRenterAction(id: number) {
  return run(async () => {
    const me = await actionUser("director");
    const r = db().select().from(renters).where(eq(renters.id, id)).get();
    if (!r) throw new ActionError("That renter no longer exists.");
    const n = db().select({ n: sql<number>`count(*)` }).from(rentals).where(eq(rentals.renterId, id)).get()!.n;
    if (n) throw new ActionError("This renter has rental history, so they can't be deleted. Remove their approval instead to keep the history.");
    db().delete(renters).where(eq(renters.id, id)).run();
    logActivity(me.displayName, "renter", `Deleted renter ${r.name}`);
    changed(T.renters);
  });
}

// ---------- rentals ----------
export async function createRentalAction(input: unknown) {
  return run(async () => {
    const me = await actionUser();
    const v = rentalSchema.parse(input);
    const who = db().select().from(renters).where(eq(renters.id, v.renterId)).get();
    if (!who) throw new ActionError("Choose a renter.");
    if (!who.approved) throw new ActionError(`${who.name} isn't on the approved renters list. Approve them first.`);
    requireAvailable(v.lines, { rentable: true });
    const id = db().transaction((tx) => {
      const row = tx.insert(rentals).values({ renterId: v.renterId, purpose: v.purpose, dateOut: v.dateOut, dateDue: v.dateDue, fee: v.fee, deposit: v.deposit, notes: v.notes, status: "out", createdBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).returning({ id: rentals.id }).get();
      for (const l of v.lines) tx.insert(rentalItems).values({ rentalId: row.id, itemId: l.itemId, qty: l.qty, conditionOut: l.conditionOut, notesOut: l.notesOut }).run();
      return row.id;
    });
    logActivity(me.displayName, "rental", `Rented ${v.lines.reduce((a, l) => a + l.qty, 0)} piece(s) to ${who.name} (rental #${id})`);
    changed(T.rentals, T.items, T.renters);
    return { id, itemIds: v.lines.map((l) => l.itemId) };
  });
}

const rentalEdit = z.object({ purpose: optText(200), dateDue: optDate(), fee: optNumber({ label: "Enter an amount" }), deposit: optNumber({ label: "Enter an amount" }), notes: optText(2000) });
export async function updateRentalAction(id: number, input: unknown) {
  return run(async () => {
    const me = await actionUser();
    const v = rentalEdit.parse(input);
    const r = db().select().from(rentals).where(eq(rentals.id, id)).get();
    if (!r) throw new ActionError("That rental no longer exists.");
    if (v.dateDue && v.dateDue < r.dateOut) throw new ActionError("The due date is before the checkout date.");
    db().update(rentals).set({ ...v, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(rentals.id, id)).run();
    changed(T.rentals);
  });
}

export async function returnRentalAction(id: number, input: unknown) {
  return run(async () => {
    const me = await actionUser();
    const v = returnSchema.parse(input);
    const r = db().select({ rental: rentals, renter: renters }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(rentals.id, id)).get();
    if (!r) throw new ActionError("That rental no longer exists.");
    if (r.rental.status !== "out") throw new ActionError("This rental has already been checked in.");
    if (v.dateReturned < r.rental.dateOut) throw new ActionError("The return date is before the checkout date.", );
    db().transaction((tx) => {
      for (const l of v.lines) {
        const line = tx.select().from(rentalItems).where(and(eq(rentalItems.id, l.id), eq(rentalItems.rentalId, id))).get();
        if (!line) continue;
        tx.update(rentalItems).set({ conditionIn: l.conditionIn, notesIn: l.notesIn, damageCharge: l.damageCharge }).where(eq(rentalItems.id, l.id)).run();
        const it = tx.select({ condition: items.condition, status: items.status }).from(items).where(eq(items.id, line.itemId)).get()!;
        const status = l.sendToRepair ? "repair" : it.status;
        if (it.condition !== l.conditionIn || status !== it.status || l.notesIn) {
          tx.update(items).set({ condition: l.conditionIn, status, ...(l.notesIn ? { conditionNotes: l.notesIn } : {}), updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(items.id, line.itemId)).run();
          tx.insert(conditionLog).values({ itemId: line.itemId, condition: l.conditionIn, notes: l.notesIn, source: `Returned from rental to ${r.renter.name}${l.sendToRepair ? " · sent to repair" : ""}`, user: me.displayName }).run();
        }
      }
      tx.update(rentals).set({ status: "returned", dateReturned: v.dateReturned, rating: v.rating, ratingNotes: v.ratingNotes, depositReturned: v.depositReturned ?? null, returnedBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(rentals.id, id)).run();
    });
    logActivity(me.displayName, "rental", `Checked in rental #${id} from ${r.renter.name}: rated ${v.rating}/5`);
    changed(T.rentals, T.items, T.renters);
  });
}

/** Undo a rental entered by mistake (only while it's still out). */
export async function cancelRentalAction(id: number) {
  return run(async () => {
    const me = await actionUser();
    const r = db().select().from(rentals).where(eq(rentals.id, id)).get();
    if (!r) throw new ActionError("That rental no longer exists.");
    if (r.status !== "out") throw new ActionError("Only a rental that is still out can be cancelled.");
    db().delete(rentals).where(eq(rentals.id, id)).run();
    logActivity(me.displayName, "rental", `Cancelled rental #${id} (entered by mistake)`);
    changed(T.rentals, T.items, T.renters);
  });
}
