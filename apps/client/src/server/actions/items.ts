"use server";
import { and, asc, eq, like, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { conditionLog, itemPhotos, items } from "@stm/core/db/schema";
import { conditionSchema, itemSchema } from "@stm/core/db/validation";
import { actionUser, ActionError } from "../auth";
import { logActivity } from "../activity";
import { changed, nowIso, run } from "../action";
import { T } from "../tags";
import { filePath } from "../paths";
import { remove } from "../fsx";
import { savePhoto } from "../uploads";

const COND = ["", "Needs repair", "Poor", "Fair", "Good", "Excellent"];

/** Next free tag number for a category, e.g. COS-0042. */
function nextTag(category: string | null): string {
  let prefix = (category ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (prefix.length < 2) prefix = "ITM";
  const rows = db().select({ tag: items.tag }).from(items).where(like(items.tag, `${prefix}-%`)).all();
  const n = rows.reduce((m, r) => Math.max(m, parseInt(r.tag.slice(prefix.length + 1), 10) || 0), 0);
  return `${prefix}-${String(n + 1).padStart(4, "0")}`;
}

function refreshMainPhoto(itemId: number) {
  const it = db().select({ mainPhoto: items.mainPhoto }).from(items).where(eq(items.id, itemId)).get();
  const photos = db().select({ file: itemPhotos.file }).from(itemPhotos).where(eq(itemPhotos.itemId, itemId)).orderBy(asc(itemPhotos.sort), asc(itemPhotos.id)).all();
  if (it?.mainPhoto && photos.some((p) => p.file === it.mainPhoto)) return;
  db().update(items).set({ mainPhoto: photos[0]?.file ?? null }).where(eq(items.id, itemId)).run();
}

export async function saveItemAction(id: number | null, input: unknown) {
  return run(async () => {
    const me = await actionUser();
    const v = itemSchema.parse(input);
    const tag = v.tag || nextTag(v.category);
    if (id) {
      const old = db().select().from(items).where(eq(items.id, id)).get();
      if (!old) throw new ActionError("That item no longer exists.");
      db().update(items).set({ ...v, tag, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(items.id, id)).run();
      if (old.condition !== v.condition) db().insert(conditionLog).values({ itemId: id, condition: v.condition, notes: v.conditionNotes, source: "Edited item record", user: me.displayName }).run();
      logActivity(me.displayName, "item", `Edited ${tag} ${v.name}`);
      changed(T.items);
      return { id };
    }
    const row = db().insert(items).values({ ...v, tag, createdBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).returning({ id: items.id }).get();
    db().insert(conditionLog).values({ itemId: row.id, condition: v.condition, notes: v.conditionNotes, source: "Added to inventory", user: me.displayName }).run();
    logActivity(me.displayName, "item", `Added ${tag} ${v.name}`);
    changed(T.items);
    return { id: row.id };
  });
}

export async function recordConditionAction(id: number, input: unknown) {
  return run(async () => {
    const me = await actionUser();
    const v = conditionSchema.parse(input);
    const it = db().update(items).set({ condition: v.condition, status: v.status, conditionNotes: v.notes, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(items.id, id)).returning({ tag: items.tag, name: items.name }).get();
    if (!it) throw new ActionError("That item no longer exists.");
    db().insert(conditionLog).values({ itemId: id, condition: v.condition, notes: v.notes, source: "Inspection", user: me.displayName }).run();
    logActivity(me.displayName, "condition", `Inspected ${it.tag} ${it.name}: ${COND[v.condition]}`);
    changed(T.items);
  });
}

export async function deleteItemAction(id: number) {
  return run(async () => {
    const me = await actionUser("director");
    const it = db().select().from(items).where(eq(items.id, id)).get();
    if (!it) throw new ActionError("That item no longer exists.");
    const used = db().get<{ n: number }>(sql`SELECT (SELECT COUNT(*) FROM rental_items WHERE item_id=${id}) + (SELECT COUNT(*) FROM show_items WHERE item_id=${id}) AS n`);
    if (used && used.n > 0) throw new ActionError("This item has rental or show history, so it can't be deleted. Set its status to Retired instead to keep the history.");
    const photos = db().select({ file: itemPhotos.file }).from(itemPhotos).where(eq(itemPhotos.itemId, id)).all();
    db().delete(items).where(eq(items.id, id)).run(); // photos and condition log cascade
    for (const p of photos) { const f = filePath("photos", p.file); if (f) remove(f); }
    logActivity(me.displayName, "item", `Deleted ${it.tag} ${it.name}`);
    changed(T.items);
  });
}

export async function addItemPhotosAction(id: number, fd: FormData) {
  return run(async () => {
    const me = await actionUser();
    const it = db().select({ tag: items.tag, name: items.name }).from(items).where(eq(items.id, id)).get();
    if (!it) throw new ActionError("That item no longer exists.");
    const files = fd.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new ActionError("Choose at least one photo.");
    const have = db().select({ n: sql<number>`count(*)` }).from(itemPhotos).where(eq(itemPhotos.itemId, id)).get()!.n;
    if (have + files.length > 40) throw new ActionError(`An item can have up to 40 photos. This one has ${have}.`);
    let sort = (db().select({ m: max(itemPhotos.sort) }).from(itemPhotos).where(eq(itemPhotos.itemId, id)).get()?.m ?? -1) + 1;
    for (const f of files) {
      const name = await savePhoto("photos", `item-${id}`, f);
      db().insert(itemPhotos).values({ itemId: id, file: name, sort: sort++, createdBy: me.displayName }).run();
    }
    refreshMainPhoto(id);
    logActivity(me.displayName, "item", `Added ${files.length} photo(s) to ${it.tag} ${it.name}`);
    changed(T.items);
  });
}

export async function updateItemPhotoAction(photoId: number, change: { caption?: string; main?: boolean; move?: "earlier" | "later" }) {
  return run(async () => {
    await actionUser();
    const p = db().select().from(itemPhotos).where(eq(itemPhotos.id, photoId)).get();
    if (!p) throw new ActionError("That photo no longer exists.");
    if (change.caption !== undefined) db().update(itemPhotos).set({ caption: change.caption.trim() || null }).where(eq(itemPhotos.id, photoId)).run();
    const list = () => db().select().from(itemPhotos).where(eq(itemPhotos.itemId, p.itemId)).orderBy(asc(itemPhotos.sort), asc(itemPhotos.id)).all();
    if (change.main || change.move) {
      const all = list(), i = all.findIndex((x) => x.id === photoId);
      if (change.main) all.unshift(...all.splice(i, 1));
      else { const j = change.move === "earlier" ? i - 1 : i + 1; if (j >= 0 && j < all.length) [all[i], all[j]] = [all[j], all[i]]; }
      db().transaction((tx) => all.forEach((x, k) => tx.update(itemPhotos).set({ sort: k }).where(eq(itemPhotos.id, x.id)).run()));
      db().update(items).set({ mainPhoto: all[0].file }).where(eq(items.id, p.itemId)).run();
    }
    changed(T.items);
  });
}

export async function deleteItemPhotoAction(photoId: number) {
  return run(async () => {
    const me = await actionUser();
    const p = db().select().from(itemPhotos).where(eq(itemPhotos.id, photoId)).get();
    if (!p) throw new ActionError("That photo no longer exists.");
    db().delete(itemPhotos).where(and(eq(itemPhotos.id, photoId))).run();
    const f = filePath("photos", p.file); if (f) remove(f);
    refreshMainPhoto(p.itemId);
    logActivity(me.displayName, "item", `Removed a photo from item #${p.itemId}`);
    changed(T.items);
  });
}
