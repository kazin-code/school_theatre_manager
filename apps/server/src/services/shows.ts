import fs from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, getTableColumns, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { PEOPLE_KINDS, SHOW_STATUSES } from "@stm/core/db/schema";
import { checkoutSchema, numberSchema, optText, personSchema, showSchema } from "@stm/core/db/validation";
import { col, db, int, nocase, nowIso, one, t, today, tx, write } from "../db";
import { bad, gone } from "../errors";
import { dir, filePath, removeFile, saveDocument, savePhoto } from "../files";
import { logActivity } from "../activity";
import { requireAvailable } from "../availability";
import { safetySnapshot } from "./backup";
import type { Me } from "../me";

const SHOW = () => col("shows", "id");
const counts = () => ({
  pieces: int(sql`(SELECT COALESCE(SUM(qty),0) FROM show_items WHERE show_id=${SHOW()})`).as("pieces"),
  outPieces: int(sql`(SELECT COALESCE(SUM(qty),0) FROM show_items WHERE show_id=${SHOW()} AND date_returned IS NULL)`).as("out_pieces"),
  castCount: int(sql`(SELECT COUNT(*) FROM show_people WHERE show_id=${SHOW()} AND kind='cast')`).as("cast_count"),
  crewCount: int(sql`(SELECT COUNT(*) FROM show_people WHERE show_id=${SHOW()} AND kind!='cast')`).as("crew_count"),
  photoCount: int(sql`(SELECT COUNT(*) FROM show_files WHERE show_id=${SHOW()} AND kind='photo')`).as("photo_count"),
  materialCount: int(sql`(SELECT COUNT(*) FROM show_files WHERE show_id=${SHOW()} AND kind='material')`).as("material_count"),
  numberCount: int(sql`(SELECT COUNT(*) FROM show_numbers WHERE show_id=${SHOW()})`).as("number_count"),
});

export async function listShows() {
  return db().select({ ...getTableColumns(t.shows), ...counts() }).from(t.shows)
    .orderBy(sql`COALESCE(${t.shows.openDate}, ${t.shows.year} || '-12-31') DESC`, desc(t.shows.id));
}
export type ShowRow = Awaited<ReturnType<typeof listShows>>[number];

export async function getShow(id: number) {
  const show = await one(db().select({ ...getTableColumns(t.shows), ...counts() }).from(t.shows).where(eq(t.shows.id, id)).limit(1));
  if (!show) return null;
  const [people, numbers, files, lines, prog] = await Promise.all([
    db().select().from(t.showPeople).where(eq(t.showPeople.showId, id)).orderBy(sql`CASE ${t.showPeople.kind} WHEN 'team' THEN 0 WHEN 'cast' THEN 1 WHEN 'pit' THEN 2 ELSE 3 END`, asc(t.showPeople.sort), asc(t.showPeople.id)),
    db().select().from(t.showNumbers).where(eq(t.showNumbers.showId, id)).orderBy(asc(t.showNumbers.sort), asc(t.showNumbers.id)),
    db().select().from(t.showFiles).where(eq(t.showFiles.showId, id)).orderBy(asc(t.showFiles.sort), asc(t.showFiles.id)),
    db().select({ line: t.showItems, item: { id: t.items.id, tag: t.items.tag, name: t.items.name, category: t.items.category, size: t.items.size, location: t.items.location, mainPhoto: t.items.mainPhoto, condition: t.items.condition } })
      .from(t.showItems).innerJoin(t.items, eq(t.items.id, t.showItems.itemId)).where(eq(t.showItems.showId, id))
      .orderBy(sql`${t.showItems.character} IS NULL`, nocase(t.showItems.character), asc(t.items.category), asc(t.items.name)),
    one(db().select({ id: t.programs.showId }).from(t.programs).where(eq(t.programs.showId, id)).limit(1)),
  ]);
  return { show, people, numbers, files, lines, hasProgram: !!prog };
}
export type ShowDetail = NonNullable<Awaited<ReturnType<typeof getShow>>>;

async function showOrThrow(id: number) {
  const s = await one(db().select().from(t.shows).where(eq(t.shows.id, id)).limit(1));
  if (!s) throw gone("That show");
  return s;
}
async function nextSort(table: typeof t.showPeople | typeof t.showNumbers | typeof t.showFiles, showId: number) {
  return ((await one(db().select({ m: max(table.sort) }).from(table).where(eq(table.showId, showId))))?.m ?? -1) + 1;
}

// ---------- the show itself ----------
/** The name a show file was uploaded with, for downloads. */
export async function originalName(file: string) {
  return (await one(db().select({ n: t.showFiles.originalName }).from(t.showFiles).where(eq(t.showFiles.file, file)).limit(1)))?.n ?? null;
}

export function saveShow(me: Me, id: number | null, input: unknown) {
  return write(async () => {
    const v = showSchema.parse(input);
    if (id) {
      await showOrThrow(id);
      await db().update(t.shows).set({ ...v, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.shows.id, id));
      await logActivity(me.displayName, "show", `Edited ${v.title}`);
      return { id };
    }
    const row = (await one(db().insert(t.shows).values({ ...v, createdBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).returning({ id: t.shows.id })))!;
    if (v.director) await db().insert(t.showPeople).values({ showId: row.id, kind: "team", name: v.director, role: "Director" });
    await logActivity(me.displayName, "show", `Created ${v.title}`);
    return { id: row.id };
  });
}

export function setCover(me: Me, showId: number, f: unknown) {
  return write(async () => {
    const s = await showOrThrow(showId);
    if (!(f instanceof File) || !f.size) throw bad("Choose a picture.");
    const name = await savePhoto("showfiles", `cover-${showId}`, f);
    removeFile("showfiles", s.cover);
    await db().update(t.shows).set({ cover: name, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.shows.id, showId));
    await logActivity(me.displayName, "show", `New cover picture for ${s.title}`);
  });
}

export function removeCover(me: Me, showId: number) {
  return write(async () => {
    const s = await showOrThrow(showId);
    removeFile("showfiles", s.cover);
    await db().update(t.shows).set({ cover: null, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.shows.id, showId));
  });
}

/** Move a show between planning, in production and past. Moving to past can return everything still checked out. */
export function setStatus(me: Me, id: number, status: unknown, returnAll = false) {
  return write(async () => {
    const s = await showOrThrow(id);
    const to = z.enum(SHOW_STATUSES).parse(status);
    const out = await db().select().from(t.showItems).where(and(eq(t.showItems.showId, id), isNull(t.showItems.dateReturned)));
    if (to === "past" && out.length && !returnAll) throw bad(`${out.length} item line(s) are still checked out to this show. Return them first, or choose to return everything.`);
    await tx(async (d) => {
      if (to === "past" && returnAll) for (const l of out) {
        await d.update(t.showItems).set({ dateReturned: today(), conditionIn: l.conditionOut, notesIn: "Returned when the show was moved to past shows", returnedBy: me.displayName }).where(eq(t.showItems.id, l.id));
      }
      await d.update(t.shows).set({ status: to, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.shows.id, id));
    });
    const words = { planning: "Moved back to planning", production: s.status === "past" ? "Reopened" : "Moved into production", past: "Moved to past shows" };
    await logActivity(me.displayName, "show", `${words[to]}: ${s.title}${to === "past" && out.length ? ` (returned ${out.length} line(s))` : ""}`);
  });
}

/** Delete a cancelled show. A copy of everything about it is saved first, and its files go to the recycle folder. */
export function deleteShow(me: Me, id: number, typedTitle: string) {
  return write(async () => {
    const s = await showOrThrow(id);
    if (String(typedTitle ?? "").trim().toLowerCase() !== s.title.trim().toLowerCase()) throw bad("Type the show's title exactly to confirm.");
    const snap = await safetySnapshot(`delete-show-${id}`);
    const detail = await getShow(id);
    const bin = path.join(dir("recycle"), `show-${id}-${Date.now()}`);
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, "show.json"), JSON.stringify(detail, null, 2));
    const files = (detail?.files ?? []).map((f) => f.file);
    if (s.cover) files.push(s.cover);
    await db().delete(t.shows).where(eq(t.shows.id, id)); // people, numbers, files, item lines and program cascade
    for (const f of files) { const p = filePath("showfiles", f); if (p && fs.existsSync(p)) fs.renameSync(p, path.join(bin, f)); }
    await logActivity(me.displayName, "show", `Deleted ${s.title}${s.year ? ` (${s.year})` : ""}.${snap ? ` Safety copy: ${snap}` : ""}`);
  });
}

// ---------- cast, crew, team, pit ----------
export function savePerson(me: Me, showId: number, id: number | null, input: unknown) {
  return write(async () => {
    const s = await showOrThrow(showId);
    const v = personSchema.parse(input);
    if (id) await db().update(t.showPeople).set(v).where(and(eq(t.showPeople.id, id), eq(t.showPeople.showId, showId)));
    else await db().insert(t.showPeople).values({ ...v, showId, sort: await nextSort(t.showPeople, showId) });
    await logActivity(me.displayName, "show", `${id ? "Updated" : "Added"} ${v.name}${v.role ? ` (${v.role})` : ""} in ${s.title}`);
  });
}
export function deletePerson(_me: Me, showId: number, id: number) {
  return write(async () => { await db().delete(t.showPeople).where(and(eq(t.showPeople.id, id), eq(t.showPeople.showId, showId))); });
}
/** Paste a list: one person per line, "Name, Role" or "Name - Role" or tab separated (straight from a spreadsheet). */
export function importPeople(me: Me, showId: number, kind: unknown, text: unknown) {
  return write(async () => {
    const s = await showOrThrow(showId);
    const k = z.enum(PEOPLE_KINDS).parse(kind);
    const people = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500).map((l) => {
      const parts = l.includes("\t") ? l.split("\t") : l.split(/\s+[-–—]\s+|,\s*|\s+as\s+/i);
      const [name, role, extra] = parts.map((p) => p.trim());
      return { name: name.slice(0, 120), role: role?.slice(0, 120) || null, voicePart: k === "cast" ? extra?.slice(0, 40) || null : null, grade: k !== "cast" ? extra?.slice(0, 20) || null : null };
    }).filter((r) => r.name);
    if (!people.length) throw bad("Paste at least one name.");
    let sort = await nextSort(t.showPeople, showId);
    await tx(async (d) => { await d.insert(t.showPeople).values(people.map((r) => ({ ...r, kind: k, showId, sort: sort++ }))); });
    await logActivity(me.displayName, "show", `Added ${people.length} ${k === "pit" ? "pit musicians" : k} to ${s.title}`);
    return { count: people.length };
  });
}

// ---------- musical numbers ----------
export function saveNumber(_me: Me, showId: number, id: number | null, input: unknown) {
  return write(async () => {
    await showOrThrow(showId);
    const v = numberSchema.parse(input);
    if (id) await db().update(t.showNumbers).set(v).where(and(eq(t.showNumbers.id, id), eq(t.showNumbers.showId, showId)));
    else await db().insert(t.showNumbers).values({ ...v, showId, sort: await nextSort(t.showNumbers, showId) });
  });
}
export function deleteNumber(_me: Me, showId: number, id: number) {
  return write(async () => { await db().delete(t.showNumbers).where(and(eq(t.showNumbers.id, id), eq(t.showNumbers.showId, showId))); });
}
/** Reorder people or numbers: the ids in their new order. */
export function reorder(_me: Me, showId: number, what: unknown, ids: unknown) {
  return write(async () => {
    const table = what === "people" ? t.showPeople : what === "numbers" ? t.showNumbers : null;
    if (!table || !Array.isArray(ids)) throw bad("Send what to reorder and the new order.");
    await tx(async (d) => { for (const [i, id] of ids.entries()) await d.update(table).set({ sort: i }).where(and(eq(table.id, Number(id)), eq(table.showId, showId))); });
  });
}

// ---------- materials & photos ----------
export function addFiles(me: Me, showId: number, kind: unknown, files: File[], category: unknown) {
  return write(async () => {
    const s = await showOrThrow(showId);
    const k = z.enum(["material", "photo", "program"]).parse(kind);
    files = files.filter((f) => f.size > 0);
    if (!files.length) throw bad("Choose at least one file.");
    if (files.length > 100) throw bad("Add up to 100 files at a time.");
    const cat = optText(80).parse(category);
    let sort = await nextSort(t.showFiles, showId);
    for (const f of files) {
      if (k === "material") {
        const { name, size } = await saveDocument("showfiles", `show-${showId}-doc`, f);
        await db().insert(t.showFiles).values({ showId, kind: k, file: name, originalName: f.name.slice(0, 200), size, category: cat, sort: sort++, createdBy: me.displayName });
      } else {
        const name = await savePhoto("showfiles", `show-${showId}-${k}`, f);
        await db().insert(t.showFiles).values({ showId, kind: k, file: name, originalName: f.name.slice(0, 200), size: f.size, sort: sort++, createdBy: me.displayName });
      }
    }
    await logActivity(me.displayName, "show", `Added ${files.length} ${k === "material" ? "file(s)" : k === "program" ? "program picture(s)" : "photo(s)"} to ${s.title}`);
  });
}
export function updateFile(_me: Me, id: number, change: { caption?: string; category?: string }) {
  return write(async () => {
    const set: Partial<typeof t.showFiles.$inferInsert> = {};
    if (change.caption !== undefined) set.caption = optText(300).parse(change.caption);
    if (change.category !== undefined) set.category = optText(80).parse(change.category);
    if (Object.keys(set).length) await db().update(t.showFiles).set(set).where(eq(t.showFiles.id, id));
  });
}
export function deleteFile(me: Me, id: number) {
  return write(async () => {
    const f = await one(db().select().from(t.showFiles).where(eq(t.showFiles.id, id)).limit(1));
    if (!f) throw gone("That file");
    await db().delete(t.showFiles).where(eq(t.showFiles.id, id));
    removeFile("showfiles", f.file);
    await logActivity(me.displayName, "show", `Removed ${f.originalName ?? "a file"} from show #${f.showId}`);
  });
}
/** Use one of the show's photos as its cover. */
export function photoAsCover(_me: Me, showId: number, fileId: number) {
  return write(async () => {
    const f = await one(db().select().from(t.showFiles).where(and(eq(t.showFiles.id, fileId), eq(t.showFiles.showId, showId), eq(t.showFiles.kind, "photo"))).limit(1));
    if (!f) throw gone("That photo");
    const s = await showOrThrow(showId);
    const name = `cover-${showId}-${Date.now()}${f.file.slice(f.file.lastIndexOf("."))}`;
    fs.copyFileSync(filePath("showfiles", f.file)!, path.join(dir("showfiles"), name));
    removeFile("showfiles", s.cover);
    await db().update(t.shows).set({ cover: name }).where(eq(t.shows.id, showId));
  });
}

// ---------- costumes, props & set pieces checked out to the show ----------
export function checkout(me: Me, showId: number, input: unknown) {
  return write(async () => {
    const s = await showOrThrow(showId);
    if (s.status === "past") throw bad("This show is in past shows. Reopen it before checking items out.");
    const v = checkoutSchema.parse(input);
    const avail = await requireAvailable(v.lines);
    await tx(async (d) => {
      await d.insert(t.showItems).values(v.lines.map((l) => ({ showId, itemId: l.itemId, qty: l.qty, character: l.character, actor: l.actor, scene: l.scene, usageNotes: l.usageNotes,
        dateOut: v.dateOut, conditionOut: avail.get(l.itemId)!.condition, createdBy: me.displayName })));
      if (s.status === "planning") await d.update(t.shows).set({ status: "production" }).where(eq(t.shows.id, showId));
    });
    await logActivity(me.displayName, "checkout", `Checked out ${v.lines.reduce((a, l) => a + l.qty, 0)} piece(s) to ${s.title}`);
    return { ids: [...new Set(v.lines.map((l) => l.itemId))] };
  });
}

const lineEdit = z.object({ character: optText(120), actor: optText(120), scene: optText(120), usageNotes: optText(300), alterations: optText(500) });
export function updateLine(_me: Me, lineId: number, input: unknown) {
  return write(async () => { await db().update(t.showItems).set(lineEdit.parse(input)).where(eq(t.showItems.id, lineId)); });
}

const returnSchema = z.object({
  dateReturned: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(z.object({ id: z.number().int(), conditionIn: z.coerce.number().int().min(1).max(5), notesIn: optText(500), sendToRepair: z.boolean() })).min(1, "Choose items to return."),
});
export function returnLines(me: Me, showId: number, input: unknown) {
  return write(async () => {
    const s = await showOrThrow(showId);
    const v = returnSchema.parse(input);
    let n = 0;
    await tx(async (d) => {
      for (const r of v.lines) {
        const l = await one(d.select().from(t.showItems).where(and(eq(t.showItems.id, r.id), eq(t.showItems.showId, showId), isNull(t.showItems.dateReturned))).limit(1));
        if (!l) continue;
        n += l.qty;
        await d.update(t.showItems).set({ dateReturned: v.dateReturned, conditionIn: r.conditionIn, notesIn: r.notesIn, returnedBy: me.displayName }).where(eq(t.showItems.id, l.id));
        const it = (await one(d.select({ condition: t.items.condition, status: t.items.status }).from(t.items).where(eq(t.items.id, l.itemId)).limit(1)))!;
        const status = r.sendToRepair ? "repair" : it.status;
        if (it.condition !== r.conditionIn || status !== it.status || r.notesIn) {
          await d.update(t.items).set({ condition: r.conditionIn, status, ...(r.notesIn ? { conditionNotes: r.notesIn } : {}), updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.items.id, l.itemId));
          await d.insert(t.conditionLog).values({ itemId: l.itemId, condition: r.conditionIn, notes: r.notesIn, source: `Returned from ${s.title}${r.sendToRepair ? " · sent to repair" : ""}`, user: me.displayName });
        }
      }
    });
    await logActivity(me.displayName, "return", `Returned ${n} piece(s) from ${s.title}`);
  });
}

/** Remove a line checked out by mistake (it was never really used). */
export function removeLine(me: Me, lineId: number) {
  return write(async () => {
    const l = await one(db().select().from(t.showItems).where(eq(t.showItems.id, lineId)).limit(1));
    if (!l) throw gone("That line");
    await db().delete(t.showItems).where(eq(t.showItems.id, lineId));
    await logActivity(me.displayName, "checkout", `Removed a mistaken checkout line from show #${l.showId}`);
  });
}
