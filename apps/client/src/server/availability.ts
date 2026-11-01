import "server-only";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@stm/core/db/schema";
import { ActionError } from "./auth";

const ITEM_ID = sql.raw(`"items"."id"`);

/** Check that every requested quantity is actually on the shelf. Throws a friendly error listing problems. */
export function requireAvailable(want: { itemId: number; qty: number }[], opts: { rentable?: boolean } = {}) {
  const total = new Map<number, number>();
  for (const l of want) total.set(l.itemId, (total.get(l.itemId) ?? 0) + l.qty);
  const rows = db().select({
    id: items.id, tag: items.tag, name: items.name, quantity: items.quantity, status: items.status, condition: items.condition, rentable: items.rentable,
    out: sql<number>`(SELECT COALESCE(SUM(si.qty),0) FROM show_items si WHERE si.item_id=${ITEM_ID} AND si.date_returned IS NULL) + (SELECT COALESCE(SUM(ri.qty),0) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE ri.item_id=${ITEM_ID} AND r.status='out')`,
  }).from(items).where(inArray(items.id, [...total.keys()])).all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const problems: string[] = [];
  for (const [id, qty] of total) {
    const it = byId.get(id);
    if (!it) { problems.push(`Item #${id} no longer exists.`); continue; }
    if (it.status !== "active") problems.push(`${it.tag} ${it.name} is ${it.status === "repair" ? "in repair" : it.status}.`);
    else if (opts.rentable && !it.rentable) problems.push(`${it.tag} ${it.name} is marked as not for rent.`);
    else if (qty > it.quantity - it.out) problems.push(`${it.tag} ${it.name}: only ${Math.max(0, it.quantity - it.out)} of ${it.quantity} available.`);
  }
  if (problems.length) throw new ActionError(problems.join(" "));
  return byId;
}
