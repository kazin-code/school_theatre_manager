import { and, asc, desc, eq, getTableColumns, like, max, sql } from "drizzle-orm";
import { conditionSchema, itemSchema } from "@stm/core/db/validation";
import { col, db, int, listOf, nowIso, one, rows, t, tx, write } from "../db";
import { bad, gone } from "../errors";
import { removeFile, savePhoto } from "../files";
import { logActivity } from "../activity";
import type { Me } from "../me";

const COND = ["", "Needs repair", "Poor", "Fair", "Good", "Excellent"];
const ITEM = () => col("items", "id");

/** How many of each item are out right now, and how often it has been used. */
const usage = () => ({
  rentOut: int(sql`(SELECT COALESCE(SUM(ri.qty),0) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE ri.item_id=${ITEM()} AND r.status='out')`).as("rent_out"),
  showOut: int(sql`(SELECT COALESCE(SUM(si.qty),0) FROM show_items si WHERE si.item_id=${ITEM()} AND si.date_returned IS NULL)`).as("show_out"),
  showCount: int(sql`(SELECT COUNT(DISTINCT si.show_id) FROM show_items si WHERE si.item_id=${ITEM()})`).as("show_count"),
  rentalCount: int(sql`(SELECT COUNT(*) FROM rental_items ri WHERE ri.item_id=${ITEM()})`).as("rental_count"),
  photoCount: int(sql`(SELECT COUNT(*) FROM item_photos p WHERE p.item_id=${ITEM()})`).as("photo_count"),
  showTitles: sql<string | null>`(SELECT ${listOf(sql`s.title || ' ' || COALESCE(si.character,'')`, " | ")} FROM show_items si JOIN shows s ON s.id=si.show_id WHERE si.item_id=${ITEM()})`.as("show_titles"),
  showIds: sql<string | null>`(SELECT ${listOf(sql`si.show_id`, ",", true)} FROM show_items si WHERE si.item_id=${ITEM()})`.as("show_ids"),
});

export async function listItems() {
  const i = t.items;
  return db().select({
    id: i.id, tag: i.tag, name: i.name, category: i.category, subcategory: i.subcategory, era: i.era, gender: i.gender,
    size: i.size, chest: i.chest, waist: i.waist, hips: i.hips, inseam: i.inseam, color: i.color, material: i.material,
    quantity: i.quantity, condition: i.condition, location: i.location, rentable: i.rentable, status: i.status,
    keywords: i.keywords, description: i.description, notes: i.notes, mainPhoto: i.mainPhoto, createdAt: i.createdAt,
    rentalRate: i.rentalRate, replacementValue: i.replacementValue, ...usage(),
  }).from(i).orderBy(asc(i.name));
}
export type ItemRow = Awaited<ReturnType<typeof listItems>>[number];

export async function getItem(id: number) {
  const item = await one(db().select({ ...getTableColumns(t.items), ...usage() }).from(t.items).where(eq(t.items.id, id)).limit(1));
  if (!item) return null;
  const [photos, conditions, rentals, shows] = await Promise.all([
    db().select().from(t.itemPhotos).where(eq(t.itemPhotos.itemId, id)).orderBy(asc(t.itemPhotos.sort), asc(t.itemPhotos.id)),
    db().select().from(t.conditionLog).where(eq(t.conditionLog.itemId, id)).orderBy(desc(t.conditionLog.id)),
    db().select({ line: t.rentalItems, rental: { id: t.rentals.id, dateOut: t.rentals.dateOut, dateDue: t.rentals.dateDue, dateReturned: t.rentals.dateReturned, status: t.rentals.status, purpose: t.rentals.purpose }, renter: { id: t.renters.id, name: t.renters.name, organization: t.renters.organization } })
      .from(t.rentalItems).innerJoin(t.rentals, eq(t.rentals.id, t.rentalItems.rentalId)).innerJoin(t.renters, eq(t.renters.id, t.rentals.renterId))
      .where(eq(t.rentalItems.itemId, id)).orderBy(desc(t.rentals.dateOut)),
    db().select({ line: t.showItems, show: { id: t.shows.id, title: t.shows.title, type: t.shows.type, season: t.shows.season, year: t.shows.year } })
      .from(t.showItems).innerJoin(t.shows, eq(t.shows.id, t.showItems.showId)).where(eq(t.showItems.itemId, id)).orderBy(desc(t.showItems.dateOut)),
  ]);
  return { item, photos, conditions, rentals, shows };
}
export type ItemDetail = NonNullable<Awaited<ReturnType<typeof getItem>>>;

export async function dashboard() {
  const n = async (q: ReturnType<typeof sql>) => Number((await rows<{ v: number | string }>(sql`SELECT (${q}) AS v`))[0]?.v ?? 0);
  const [pieces, records, inShows, onRental, repair, value] = await Promise.all([
    n(sql`SELECT COALESCE(SUM(quantity),0) FROM items WHERE status!='retired'`),
    n(sql`SELECT COUNT(*) FROM items WHERE status!='retired'`),
    n(sql`SELECT COALESCE(SUM(qty),0) FROM show_items WHERE date_returned IS NULL`),
    n(sql`SELECT COALESCE(SUM(ri.qty),0) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE r.status='out'`),
    n(sql`SELECT COUNT(*) FROM items WHERE status='repair' OR (condition<=1 AND status='active')`),
    n(sql`SELECT COALESCE(SUM(COALESCE(replacement_value,0)*quantity),0) FROM items WHERE status!='retired'`),
  ]);
  const repairs = await db().select({ id: t.items.id, tag: t.items.tag, name: t.items.name, condition: t.items.condition, conditionNotes: t.items.conditionNotes, status: t.items.status })
    .from(t.items).where(sql`${t.items.status}='repair' OR (${t.items.condition}<=1 AND ${t.items.status}='active')`).orderBy(sql`${t.items.updatedAt} DESC NULLS LAST`).limit(12);
  return { stats: { pieces, records, inShows, onRental, repair, value }, repairs };
}

/** Next free tag number for a category, e.g. COS-0042. */
async function nextTag(category: string | null): Promise<string> {
  let prefix = (category ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (prefix.length < 2) prefix = "ITM";
  const tags = await db().select({ tag: t.items.tag }).from(t.items).where(like(t.items.tag, `${prefix}-%`));
  const n = tags.reduce((m, r) => Math.max(m, parseInt(r.tag.slice(prefix.length + 1), 10) || 0), 0);
  return `${prefix}-${String(n + 1).padStart(4, "0")}`;
}

async function refreshMainPhoto(itemId: number) {
  const it = await one(db().select({ mainPhoto: t.items.mainPhoto }).from(t.items).where(eq(t.items.id, itemId)).limit(1));
  const photos = await db().select({ file: t.itemPhotos.file }).from(t.itemPhotos).where(eq(t.itemPhotos.itemId, itemId)).orderBy(asc(t.itemPhotos.sort), asc(t.itemPhotos.id));
  if (it?.mainPhoto && photos.some((p) => p.file === it.mainPhoto)) return;
  await db().update(t.items).set({ mainPhoto: photos[0]?.file ?? null }).where(eq(t.items.id, itemId));
}

export function saveItem(me: Me, id: number | null, input: unknown) {
  return write(async () => {
    const v = itemSchema.parse(input);
    const tag = v.tag || (await nextTag(v.category));
    if (id) {
      const old = await one(db().select().from(t.items).where(eq(t.items.id, id)).limit(1));
      if (!old) throw gone("That item");
      await db().update(t.items).set({ ...v, tag, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.items.id, id));
      if (old.condition !== v.condition) await db().insert(t.conditionLog).values({ itemId: id, condition: v.condition, notes: v.conditionNotes, source: "Edited item record", user: me.displayName });
      await logActivity(me.displayName, "item", `Edited ${tag} ${v.name}`);
      return { id };
    }
    const row = (await one(db().insert(t.items).values({ ...v, tag, createdBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).returning({ id: t.items.id })))!;
    await db().insert(t.conditionLog).values({ itemId: row.id, condition: v.condition, notes: v.conditionNotes, source: "Added to inventory", user: me.displayName });
    await logActivity(me.displayName, "item", `Added ${tag} ${v.name}`);
    return { id: row.id };
  });
}

export function recordCondition(me: Me, id: number, input: unknown) {
  return write(async () => {
    const v = conditionSchema.parse(input);
    const it = await one(db().update(t.items).set({ condition: v.condition, status: v.status, conditionNotes: v.notes, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.items.id, id)).returning({ tag: t.items.tag, name: t.items.name }));
    if (!it) throw gone("That item");
    await db().insert(t.conditionLog).values({ itemId: id, condition: v.condition, notes: v.notes, source: "Inspection", user: me.displayName });
    await logActivity(me.displayName, "condition", `Inspected ${it.tag} ${it.name}: ${COND[v.condition]}`);
  });
}

export function deleteItem(me: Me, id: number) {
  return write(async () => {
    const it = await one(db().select().from(t.items).where(eq(t.items.id, id)).limit(1));
    if (!it) throw gone("That item");
    const used = await rows<{ n: number | string }>(sql`SELECT (SELECT COUNT(*) FROM rental_items WHERE item_id=${id}) + (SELECT COUNT(*) FROM show_items WHERE item_id=${id}) AS n`);
    if (Number(used[0]?.n) > 0) throw bad("This item has rental or show history, so it can't be deleted. Set its status to Retired instead to keep the history.");
    const photos = await db().select({ file: t.itemPhotos.file }).from(t.itemPhotos).where(eq(t.itemPhotos.itemId, id));
    await db().delete(t.items).where(eq(t.items.id, id)); // photos and condition log cascade
    for (const p of photos) removeFile("photos", p.file);
    await logActivity(me.displayName, "item", `Deleted ${it.tag} ${it.name}`);
  });
}

export function addPhotos(me: Me, id: number, files: File[]) {
  return write(async () => {
    const it = await one(db().select({ tag: t.items.tag, name: t.items.name }).from(t.items).where(eq(t.items.id, id)).limit(1));
    if (!it) throw gone("That item");
    files = files.filter((f) => f.size > 0);
    if (!files.length) throw bad("Choose at least one photo.");
    const have = (await one(db().select({ n: int(sql`count(*)`) }).from(t.itemPhotos).where(eq(t.itemPhotos.itemId, id))))!.n;
    if (have + files.length > 40) throw bad(`An item can have up to 40 photos. This one has ${have}.`);
    let sort = ((await one(db().select({ m: max(t.itemPhotos.sort) }).from(t.itemPhotos).where(eq(t.itemPhotos.itemId, id))))?.m ?? -1) + 1;
    for (const f of files) {
      const name = await savePhoto("photos", `item-${id}`, f);
      await db().insert(t.itemPhotos).values({ itemId: id, file: name, sort: sort++, createdBy: me.displayName });
    }
    await refreshMainPhoto(id);
    await logActivity(me.displayName, "item", `Added ${files.length} photo(s) to ${it.tag} ${it.name}`);
  });
}

export function updatePhoto(_me: Me, photoId: number, change: { caption?: string; main?: boolean; move?: "earlier" | "later" }) {
  return write(async () => {
    const p = await one(db().select().from(t.itemPhotos).where(eq(t.itemPhotos.id, photoId)).limit(1));
    if (!p) throw gone("That photo");
    if (change.caption !== undefined) await db().update(t.itemPhotos).set({ caption: String(change.caption).trim().slice(0, 300) || null }).where(eq(t.itemPhotos.id, photoId));
    if (change.main || change.move) {
      const all = await db().select().from(t.itemPhotos).where(eq(t.itemPhotos.itemId, p.itemId)).orderBy(asc(t.itemPhotos.sort), asc(t.itemPhotos.id));
      const i = all.findIndex((x) => x.id === photoId);
      if (change.main) all.unshift(...all.splice(i, 1));
      else { const j = change.move === "earlier" ? i - 1 : i + 1; if (j >= 0 && j < all.length) [all[i], all[j]] = [all[j], all[i]]; }
      await tx(async (d) => { for (const [k, x] of all.entries()) await d.update(t.itemPhotos).set({ sort: k }).where(eq(t.itemPhotos.id, x.id)); });
      await db().update(t.items).set({ mainPhoto: all[0].file }).where(eq(t.items.id, p.itemId));
    }
  });
}

export function deletePhoto(me: Me, photoId: number) {
  return write(async () => {
    const p = await one(db().select().from(t.itemPhotos).where(and(eq(t.itemPhotos.id, photoId))).limit(1));
    if (!p) throw gone("That photo");
    await db().delete(t.itemPhotos).where(eq(t.itemPhotos.id, photoId));
    removeFile("photos", p.file);
    await refreshMainPhoto(p.itemId);
    await logActivity(me.displayName, "item", `Removed a photo from item #${p.itemId}`);
  });
}
