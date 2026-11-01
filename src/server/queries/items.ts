import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db";
import { conditionLog, itemPhotos, items, rentalItems, rentals, renters, showItems, shows } from "@/db/schema";
import { T } from "../tags";

/** Qualified, so it is not confused with the subquery tables' own id columns. */
const ITEM_ID = sql.raw(`"items"."id"`);

/** How many of each item are out right now, and how often it has been used. */
const usage = {
  rentOut: sql<number>`(SELECT COALESCE(SUM(ri.qty),0) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE ri.item_id=${ITEM_ID} AND r.status='out')`.as("rent_out"),
  showOut: sql<number>`(SELECT COALESCE(SUM(si.qty),0) FROM show_items si WHERE si.item_id=${ITEM_ID} AND si.date_returned IS NULL)`.as("show_out"),
  showCount: sql<number>`(SELECT COUNT(DISTINCT si.show_id) FROM show_items si WHERE si.item_id=${ITEM_ID})`.as("show_count"),
  rentalCount: sql<number>`(SELECT COUNT(*) FROM rental_items ri WHERE ri.item_id=${ITEM_ID})`.as("rental_count"),
  photoCount: sql<number>`(SELECT COUNT(*) FROM item_photos p WHERE p.item_id=${ITEM_ID})`.as("photo_count"),
  showTitles: sql<string | null>`(SELECT GROUP_CONCAT(s.title || ' ' || COALESCE(si.character,''), ' | ') FROM show_items si JOIN shows s ON s.id=si.show_id WHERE si.item_id=${ITEM_ID})`.as("show_titles"),
  showIds: sql<string | null>`(SELECT GROUP_CONCAT(DISTINCT si.show_id) FROM show_items si WHERE si.item_id=${ITEM_ID})`.as("show_ids"),
};

export async function listItems() {
  "use cache";
  cacheTag(T.items, T.rentals, T.shows);
  cacheLife("max");
  return db().select({
    id: items.id, tag: items.tag, name: items.name, category: items.category, subcategory: items.subcategory, era: items.era, gender: items.gender,
    size: items.size, chest: items.chest, waist: items.waist, hips: items.hips, inseam: items.inseam, color: items.color, material: items.material,
    quantity: items.quantity, condition: items.condition, location: items.location, rentable: items.rentable, status: items.status,
    keywords: items.keywords, description: items.description, notes: items.notes, mainPhoto: items.mainPhoto, createdAt: items.createdAt,
    rentalRate: items.rentalRate, replacementValue: items.replacementValue, ...usage,
  }).from(items).orderBy(asc(items.name)).all();
}
export type ItemRow = Awaited<ReturnType<typeof listItems>>[number];

export async function getItem(id: number) {
  "use cache";
  cacheTag(T.items, T.rentals, T.shows);
  cacheLife("max");
  const item = db().select({ ...getTableColumns(items), ...usage }).from(items).where(eq(items.id, id)).get();
  if (!item) return null;
  return {
    item,
    photos: db().select().from(itemPhotos).where(eq(itemPhotos.itemId, id)).orderBy(asc(itemPhotos.sort), asc(itemPhotos.id)).all(),
    conditions: db().select().from(conditionLog).where(eq(conditionLog.itemId, id)).orderBy(desc(conditionLog.id)).all(),
    rentals: db().select({ line: rentalItems, rental: { id: rentals.id, dateOut: rentals.dateOut, dateDue: rentals.dateDue, dateReturned: rentals.dateReturned, status: rentals.status, purpose: rentals.purpose }, renter: { id: renters.id, name: renters.name, organization: renters.organization } })
      .from(rentalItems).innerJoin(rentals, eq(rentals.id, rentalItems.rentalId)).innerJoin(renters, eq(renters.id, rentals.renterId))
      .where(eq(rentalItems.itemId, id)).orderBy(desc(rentals.dateOut)).all(),
    shows: db().select({ line: showItems, show: { id: shows.id, title: shows.title, type: shows.type, season: shows.season, year: shows.year } })
      .from(showItems).innerJoin(shows, eq(shows.id, showItems.showId)).where(eq(showItems.itemId, id)).orderBy(desc(showItems.dateOut)).all(),
  };
}
export type ItemDetail = NonNullable<Awaited<ReturnType<typeof getItem>>>;

export async function dashboardStats() {
  "use cache";
  cacheTag(T.items, T.rentals, T.shows);
  cacheLife("max");
  const n = (q: ReturnType<typeof sql>) => Number(db().get<{ v: number }>(sql`SELECT (${q}) AS v`)?.v ?? 0);
  return {
    pieces: n(sql`SELECT COALESCE(SUM(quantity),0) FROM items WHERE status!='retired'`),
    records: n(sql`SELECT COUNT(*) FROM items WHERE status!='retired'`),
    inShows: n(sql`SELECT COALESCE(SUM(qty),0) FROM show_items WHERE date_returned IS NULL`),
    onRental: n(sql`SELECT COALESCE(SUM(ri.qty),0) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE r.status='out'`),
    repair: n(sql`SELECT COUNT(*) FROM items WHERE status='repair' OR (condition<=1 AND status='active')`),
    value: n(sql`SELECT COALESCE(SUM(COALESCE(replacement_value,0)*quantity),0) FROM items WHERE status!='retired'`),
  };
}

export async function repairList() {
  "use cache";
  cacheTag(T.items);
  cacheLife("max");
  return db().select({ id: items.id, tag: items.tag, name: items.name, condition: items.condition, conditionNotes: items.conditionNotes, status: items.status })
    .from(items).where(sql`${items.status}='repair' OR (${items.condition}<=1 AND ${items.status}='active')`).orderBy(desc(items.updatedAt)).limit(12).all();
}
