import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db";
import { items, rentalItems, rentals, renters } from "@/db/schema";
import { T } from "../tags";

const RENTER_ID = sql.raw(`"renters"."id"`);
const RENTAL_ID = sql.raw(`"rentals"."id"`);

const renterStats = {
  rentalCount: sql<number>`(SELECT COUNT(*) FROM rentals r WHERE r.renter_id=${RENTER_ID})`.as("rental_count"),
  openCount: sql<number>`(SELECT COUNT(*) FROM rentals r WHERE r.renter_id=${RENTER_ID} AND r.status='out')`.as("open_count"),
  avgRating: sql<number | null>`(SELECT ROUND(AVG(r.rating),1) FROM rentals r WHERE r.renter_id=${RENTER_ID} AND r.rating IS NOT NULL)`.as("avg_rating"),
  ratingCount: sql<number>`(SELECT COUNT(r.rating) FROM rentals r WHERE r.renter_id=${RENTER_ID})`.as("rating_count"),
  damage: sql<number>`(SELECT COALESCE(SUM(ri.damage_charge),0) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE r.renter_id=${RENTER_ID})`.as("damage"),
  lastRental: sql<string | null>`(SELECT MAX(r.date_out) FROM rentals r WHERE r.renter_id=${RENTER_ID})`.as("last_rental"),
};

export async function listRenters() {
  "use cache";
  cacheTag(T.renters, T.rentals);
  cacheLife("max");
  return db().select({ ...getTableColumns(renters), ...renterStats }).from(renters).orderBy(sql`${renters.name} COLLATE NOCASE`).all();
}
export type RenterRow = Awaited<ReturnType<typeof listRenters>>[number];

const rentalStats = {
  renterName: renters.name, organization: renters.organization,
  pieces: sql<number>`(SELECT COALESCE(SUM(qty),0) FROM rental_items WHERE rental_id=${RENTAL_ID})`.as("pieces"),
  lineCount: sql<number>`(SELECT COUNT(*) FROM rental_items WHERE rental_id=${RENTAL_ID})`.as("line_count"),
  damage: sql<number>`(SELECT COALESCE(SUM(damage_charge),0) FROM rental_items WHERE rental_id=${RENTAL_ID})`.as("damage"),
  summary: sql<string | null>`(SELECT GROUP_CONCAT(i.name, ', ') FROM rental_items ri JOIN items i ON i.id=ri.item_id WHERE ri.rental_id=${RENTAL_ID})`.as("summary"),
};

export async function listRentals() {
  "use cache";
  cacheTag(T.rentals, T.renters);
  cacheLife("max");
  return db().select({ ...getTableColumns(rentals), ...rentalStats }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId))
    .orderBy(sql`${rentals.status}='out' DESC`, desc(rentals.dateOut), desc(rentals.id)).all();
}
export type RentalRow = Awaited<ReturnType<typeof listRentals>>[number];

export async function getRenter(id: number) {
  "use cache";
  cacheTag(T.renters, T.rentals);
  cacheLife("max");
  const renter = db().select({ ...getTableColumns(renters), ...renterStats }).from(renters).where(eq(renters.id, id)).get();
  if (!renter) return null;
  const history = db().select({ ...getTableColumns(rentals), ...rentalStats }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId))
    .where(eq(rentals.renterId, id)).orderBy(desc(rentals.dateOut), desc(rentals.id)).all();
  return { renter, history };
}
export type RenterDetail = NonNullable<Awaited<ReturnType<typeof getRenter>>>;

export async function getRental(id: number) {
  "use cache";
  cacheTag(T.rentals, T.renters, T.items);
  cacheLife("max");
  const r = db().select({ rental: rentals, renter: renters }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(rentals.id, id)).get();
  if (!r) return null;
  const lines = db().select({ line: rentalItems, item: { id: items.id, tag: items.tag, name: items.name, category: items.category, size: items.size, mainPhoto: items.mainPhoto, condition: items.condition, replacementValue: items.replacementValue, rentalRate: items.rentalRate } })
    .from(rentalItems).innerJoin(items, eq(items.id, rentalItems.itemId)).where(eq(rentalItems.rentalId, id)).orderBy(asc(items.category), asc(items.name)).all();
  return { ...r, lines };
}
export type RentalDetail = NonNullable<Awaited<ReturnType<typeof getRental>>>;
