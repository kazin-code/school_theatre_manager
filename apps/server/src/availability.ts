import { inArray, sql } from "drizzle-orm";
import { col, db, int, t } from "./db";
import { bad } from "./errors";

/** Check that every requested quantity is actually on the shelf. Throws a friendly error listing problems. */
export async function requireAvailable(want: { itemId: number; qty: number }[], opts: { rentable?: boolean } = {}) {
  const total = new Map<number, number>();
  for (const l of want) total.set(l.itemId, (total.get(l.itemId) ?? 0) + l.qty);
  if (!total.size) return new Map();
  const ITEM = col("items", "id");
  const found = await db().select({
    id: t.items.id, tag: t.items.tag, name: t.items.name, quantity: t.items.quantity, status: t.items.status, condition: t.items.condition, rentable: t.items.rentable,
    out: int(sql`(SELECT COALESCE(SUM(si.qty),0) FROM show_items si WHERE si.item_id=${ITEM} AND si.date_returned IS NULL) + (SELECT COALESCE(SUM(ri.qty),0) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE ri.item_id=${ITEM} AND r.status='out')`),
  }).from(t.items).where(inArray(t.items.id, [...total.keys()]));
  const byId = new Map(found.map((r) => [r.id, r]));
  const problems: string[] = [];
  for (const [id, qty] of total) {
    const it = byId.get(id);
    if (!it) { problems.push(`Item #${id} no longer exists.`); continue; }
    if (it.status !== "active") problems.push(`${it.tag} ${it.name} is ${it.status === "repair" ? "in repair" : it.status}.`);
    else if (opts.rentable && !it.rentable) problems.push(`${it.tag} ${it.name} is marked as not for rent.`);
    else if (qty > it.quantity - it.out) problems.push(`${it.tag} ${it.name}: only ${Math.max(0, it.quantity - it.out)} of ${it.quantity} available.`);
  }
  if (problems.length) throw bad(problems.join(" "));
  return byId;
}
