"use server";
import { and, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conditionLog, items, showFiles, showItems, showNumbers, showPeople, shows, PEOPLE_KINDS, SHOW_FILE_KINDS, SHOW_STATUSES } from "@/db/schema";
import { checkoutSchema, numberSchema, optText, personSchema, showSchema } from "@/db/validation";
import { actionUser, ActionError } from "../auth";
import { logActivity } from "../activity";
import { changed, nowIso, run, today } from "../action";
import { T } from "../tags";
import { dir, filePath } from "../paths";
import { copy, exists, mkdirp, pjoin, remove, rename } from "../fsx";
import { saveDocument, savePhoto } from "../uploads";
import { safetySnapshot } from "../snapshot";
import { requireAvailable } from "../availability";

const showOrThrow = (id: number) => {
  const s = db().select().from(shows).where(eq(shows.id, id)).get();
  if (!s) throw new ActionError("That show no longer exists.");
  return s;
};
const nextSort = (t: typeof showPeople | typeof showNumbers | typeof showFiles, showId: number) =>
  (db().select({ m: max(t.sort) }).from(t).where(eq(t.showId, showId)).get()?.m ?? -1) + 1;

// ---------- the show itself ----------
export async function saveShowAction(id: number | null, input: unknown) {
  return run(async () => {
    const me = await actionUser();
    const v = showSchema.parse(input);
    if (id) {
      showOrThrow(id);
      db().update(shows).set({ ...v, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(shows.id, id)).run();
      logActivity(me.displayName, "show", `Edited ${v.title}`);
      changed(T.shows);
      return { id };
    }
    const row = db().insert(shows).values({ ...v, createdBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).returning({ id: shows.id }).get();
    if (v.director) db().insert(showPeople).values({ showId: row.id, kind: "team", name: v.director, role: "Director" }).run();
    logActivity(me.displayName, "show", `Created ${v.title}`);
    changed(T.shows);
    return { id: row.id };
  });
}

export async function setCoverAction(showId: number, fd: FormData) {
  return run(async () => {
    const me = await actionUser();
    const s = showOrThrow(showId);
    const f = fd.get("cover");
    if (!(f instanceof File) || !f.size) throw new ActionError("Choose a picture.");
    const name = await savePhoto("showfiles", `cover-${showId}`, f);
    if (s.cover) { const old = filePath("showfiles", s.cover); if (old) remove(old); }
    db().update(shows).set({ cover: name, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(shows.id, showId)).run();
    logActivity(me.displayName, "show", `New cover picture for ${s.title}`);
    changed(T.shows);
  });
}

export async function removeCoverAction(showId: number) {
  return run(async () => {
    const me = await actionUser();
    const s = showOrThrow(showId);
    if (s.cover) { const old = filePath("showfiles", s.cover); if (old) remove(old); }
    db().update(shows).set({ cover: null, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(shows.id, showId)).run();
    changed(T.shows);
  });
}

/** Move a show between planning, in production and past. Moving to past can return everything still checked out. */
export async function setShowStatusAction(id: number, status: (typeof SHOW_STATUSES)[number], returnAll = false) {
  return run(async () => {
    const me = await actionUser();
    const s = showOrThrow(id);
    z.enum(SHOW_STATUSES).parse(status);
    const out = db().select().from(showItems).where(and(eq(showItems.showId, id), isNull(showItems.dateReturned))).all();
    if (status === "past" && out.length && !returnAll) throw new ActionError(`${out.length} item line(s) are still checked out to this show. Return them first, or choose to return everything.`);
    db().transaction((tx) => {
      if (status === "past" && returnAll) for (const l of out) {
        tx.update(showItems).set({ dateReturned: today(), conditionIn: l.conditionOut, notesIn: "Returned when the show was moved to past shows", returnedBy: me.displayName }).where(eq(showItems.id, l.id)).run();
      }
      tx.update(shows).set({ status, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(shows.id, id)).run();
    });
    const words = { planning: "Moved back to planning", production: s.status === "past" ? "Reopened" : "Moved into production", past: "Moved to past shows" };
    logActivity(me.displayName, "show", `${words[status]}: ${s.title}${status === "past" && out.length ? ` (returned ${out.length} line(s))` : ""}`);
    changed(T.shows, T.items);
  });
}

/** Delete a cancelled show. Takes a database snapshot first and moves its files to the recycle folder. */
export async function deleteShowAction(id: number, typedTitle: string) {
  return run(async () => {
    const me = await actionUser("director");
    const s = showOrThrow(id);
    if (typedTitle.trim().toLowerCase() !== s.title.trim().toLowerCase()) throw new ActionError("Type the show's title exactly to confirm.");
    const snap = await safetySnapshot(`delete-show-${id}`);
    const files = db().select({ file: showFiles.file }).from(showFiles).where(eq(showFiles.showId, id)).all().map((f) => f.file);
    if (s.cover) files.push(s.cover);
    db().delete(shows).where(eq(shows.id, id)).run(); // people, numbers, files, item lines cascade
    const bin = pjoin(dir("recycle"), `show-${id}-${Date.now()}`);
    for (const f of files) { const p = filePath("showfiles", f); if (p && exists(p)) { mkdirp(bin); rename(p, pjoin(bin, f)); } }
    logActivity(me.displayName, "show", `Deleted ${s.title}${s.year ? ` (${s.year})` : ""}. Safety copy: ${snap}`);
    changed(T.shows, T.items, T.programs);
  });
}

// ---------- cast, crew, team, pit ----------
export async function savePersonAction(showId: number, id: number | null, input: unknown) {
  return run(async () => {
    const me = await actionUser();
    const s = showOrThrow(showId);
    const v = personSchema.parse(input);
    if (id) db().update(showPeople).set(v).where(and(eq(showPeople.id, id), eq(showPeople.showId, showId))).run();
    else db().insert(showPeople).values({ ...v, showId, sort: nextSort(showPeople, showId) }).run();
    logActivity(me.displayName, "show", `${id ? "Updated" : "Added"} ${v.name}${v.role ? ` (${v.role})` : ""} in ${s.title}`);
    changed(T.shows);
  });
}

export async function deletePersonAction(showId: number, id: number) {
  return run(async () => {
    await actionUser();
    db().delete(showPeople).where(and(eq(showPeople.id, id), eq(showPeople.showId, showId))).run();
    changed(T.shows);
  });
}

/** Paste a list: one person per line, "Name, Role" or "Name - Role" or tab separated (straight from a spreadsheet). */
export async function importPeopleAction(showId: number, kind: (typeof PEOPLE_KINDS)[number], text: string) {
  return run(async () => {
    const me = await actionUser();
    const s = showOrThrow(showId);
    z.enum(PEOPLE_KINDS).parse(kind);
    const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500).map((l) => {
      const parts = l.includes("\t") ? l.split("\t") : l.split(/\s+[-–—]\s+|,\s*|\s+as\s+/i);
      const [name, role, extra] = parts.map((p) => p.trim());
      return { name: name.slice(0, 120), role: role?.slice(0, 120) || null, voicePart: kind === "cast" ? extra?.slice(0, 40) || null : null, grade: kind !== "cast" ? extra?.slice(0, 20) || null : null };
    }).filter((r) => r.name);
    if (!rows.length) throw new ActionError("Paste at least one name.");
    let sort = nextSort(showPeople, showId);
    db().transaction((tx) => { for (const r of rows) tx.insert(showPeople).values({ ...r, kind, showId, sort: sort++ }).run(); });
    logActivity(me.displayName, "show", `Added ${rows.length} ${kind === "pit" ? "pit musicians" : kind} to ${s.title}`);
    changed(T.shows);
    return { count: rows.length };
  });
}

// ---------- musical numbers ----------
export async function saveNumberAction(showId: number, id: number | null, input: unknown) {
  return run(async () => {
    await actionUser();
    showOrThrow(showId);
    const v = numberSchema.parse(input);
    if (id) db().update(showNumbers).set(v).where(and(eq(showNumbers.id, id), eq(showNumbers.showId, showId))).run();
    else db().insert(showNumbers).values({ ...v, showId, sort: nextSort(showNumbers, showId) }).run();
    changed(T.shows);
  });
}

export async function deleteNumberAction(showId: number, id: number) {
  return run(async () => {
    await actionUser();
    db().delete(showNumbers).where(and(eq(showNumbers.id, id), eq(showNumbers.showId, showId))).run();
    changed(T.shows);
  });
}

/** Reorder people or numbers: pass the ids in their new order. */
export async function reorderAction(showId: number, what: "people" | "numbers", ids: number[]) {
  return run(async () => {
    await actionUser();
    const t = what === "people" ? showPeople : showNumbers;
    db().transaction((tx) => ids.forEach((id, i) => tx.update(t).set({ sort: i }).where(and(eq(t.id, id), eq(t.showId, showId))).run()));
    changed(T.shows);
  });
}

// ---------- materials & photos ----------
export async function addShowFilesAction(showId: number, kind: "material" | "photo", fd: FormData) {
  return run(async () => {
    const me = await actionUser();
    const s = showOrThrow(showId);
    z.enum(SHOW_FILE_KINDS).parse(kind);
    const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new ActionError("Choose at least one file.");
    if (files.length > 100) throw new ActionError("Add up to 100 files at a time.");
    const category = optText(80).parse(fd.get("category"));
    let sort = nextSort(showFiles, showId);
    for (const f of files) {
      if (kind === "photo") {
        const name = await savePhoto("showfiles", `show-${showId}-photo`, f);
        db().insert(showFiles).values({ showId, kind, file: name, originalName: f.name.slice(0, 200), size: f.size, sort: sort++, createdBy: me.displayName }).run();
      } else {
        const { name, size } = await saveDocument("showfiles", `show-${showId}-doc`, f);
        db().insert(showFiles).values({ showId, kind, file: name, originalName: f.name.slice(0, 200), size, category, sort: sort++, createdBy: me.displayName }).run();
      }
    }
    logActivity(me.displayName, "show", `Added ${files.length} ${kind === "photo" ? "photo(s)" : "file(s)"} to ${s.title}`);
    changed(T.shows);
  });
}

export async function updateShowFileAction(id: number, change: { caption?: string; category?: string }) {
  return run(async () => {
    await actionUser();
    const set: Partial<typeof showFiles.$inferInsert> = {};
    if (change.caption !== undefined) set.caption = optText(300).parse(change.caption);
    if (change.category !== undefined) set.category = optText(80).parse(change.category);
    db().update(showFiles).set(set).where(eq(showFiles.id, id)).run();
    changed(T.shows);
  });
}

export async function deleteShowFileAction(id: number) {
  return run(async () => {
    const me = await actionUser();
    const f = db().select().from(showFiles).where(eq(showFiles.id, id)).get();
    if (!f) throw new ActionError("That file no longer exists.");
    db().delete(showFiles).where(eq(showFiles.id, id)).run();
    const p = filePath("showfiles", f.file); if (p) remove(p);
    logActivity(me.displayName, "show", `Removed ${f.originalName ?? "a file"} from show #${f.showId}`);
    changed(T.shows);
  });
}

/** Use one of the show's photos as its cover. */
export async function photoAsCoverAction(showId: number, fileId: number) {
  return run(async () => {
    await actionUser();
    const f = db().select().from(showFiles).where(and(eq(showFiles.id, fileId), eq(showFiles.showId, showId), eq(showFiles.kind, "photo"))).get();
    if (!f) throw new ActionError("That photo no longer exists.");
    const s = showOrThrow(showId);
    const src = filePath("showfiles", f.file)!;
    const name = `cover-${showId}-${Date.now()}${f.file.slice(f.file.lastIndexOf("."))}`;
    copy(src, pjoin(dir("showfiles"), name));
    if (s.cover) { const old = filePath("showfiles", s.cover); if (old) remove(old); }
    db().update(shows).set({ cover: name }).where(eq(shows.id, showId)).run();
    changed(T.shows);
  });
}

// ---------- costumes, props & set pieces checked out to the show ----------
export async function checkoutAction(showId: number, input: unknown) {
  return run(async () => {
    const me = await actionUser();
    const s = showOrThrow(showId);
    if (s.status === "past") throw new ActionError("This show is in past shows. Reopen it before checking items out.");
    const v = checkoutSchema.parse(input);
    const ids = [...new Set(v.lines.map((l) => l.itemId))];
    const avail = requireAvailable(v.lines);
    db().transaction((tx) => {
      for (const l of v.lines) tx.insert(showItems).values({ showId, itemId: l.itemId, qty: l.qty, character: l.character, actor: l.actor, scene: l.scene, usageNotes: l.usageNotes,
        dateOut: v.dateOut, conditionOut: avail.get(l.itemId)!.condition, createdBy: me.displayName }).run();
      if (s.status === "planning") tx.update(shows).set({ status: "production" }).where(eq(shows.id, showId)).run();
    });
    const pieces = v.lines.reduce((a, l) => a + l.qty, 0);
    logActivity(me.displayName, "checkout", `Checked out ${pieces} piece(s) to ${s.title}`);
    changed(T.shows, T.items);
    return { ids };
  });
}

const lineEdit = z.object({ character: optText(120), actor: optText(120), scene: optText(120), usageNotes: optText(300), alterations: optText(500) });
export async function updateLineAction(lineId: number, input: unknown) {
  return run(async () => {
    await actionUser();
    db().update(showItems).set(lineEdit.parse(input)).where(eq(showItems.id, lineId)).run();
    changed(T.shows, T.items);
  });
}

const returnSchema = z.object({
  dateReturned: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(z.object({ id: z.number().int(), conditionIn: z.coerce.number().int().min(1).max(5), notesIn: optText(500), sendToRepair: z.boolean() })).min(1, "Choose items to return."),
});
export async function returnLinesAction(showId: number, input: unknown) {
  return run(async () => {
    const me = await actionUser();
    const s = showOrThrow(showId);
    const v = returnSchema.parse(input);
    let n = 0;
    db().transaction((tx) => {
      for (const r of v.lines) {
        const l = tx.select().from(showItems).where(and(eq(showItems.id, r.id), eq(showItems.showId, showId), isNull(showItems.dateReturned))).get();
        if (!l) continue;
        n += l.qty;
        tx.update(showItems).set({ dateReturned: v.dateReturned, conditionIn: r.conditionIn, notesIn: r.notesIn, returnedBy: me.displayName }).where(eq(showItems.id, l.id)).run();
        const it = tx.select({ condition: items.condition, status: items.status }).from(items).where(eq(items.id, l.itemId)).get()!;
        const status = r.sendToRepair ? "repair" : it.status;
        if (it.condition !== r.conditionIn || status !== it.status || r.notesIn) {
          tx.update(items).set({ condition: r.conditionIn, status, ...(r.notesIn ? { conditionNotes: r.notesIn } : {}), updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(items.id, l.itemId)).run();
          tx.insert(conditionLog).values({ itemId: l.itemId, condition: r.conditionIn, notes: r.notesIn, source: `Returned from ${s.title}${r.sendToRepair ? " · sent to repair" : ""}`, user: me.displayName }).run();
        }
      }
    });
    logActivity(me.displayName, "return", `Returned ${n} piece(s) from ${s.title}`);
    changed(T.shows, T.items);
  });
}

/** Remove a line checked out by mistake (it was never really used). */
export async function removeLineAction(lineId: number) {
  return run(async () => {
    const me = await actionUser();
    const l = db().select().from(showItems).where(eq(showItems.id, lineId)).get();
    if (!l) throw new ActionError("That line no longer exists.");
    db().delete(showItems).where(eq(showItems.id, lineId)).run();
    logActivity(me.displayName, "checkout", `Removed a mistaken checkout line from show #${l.showId}`);
    changed(T.shows, T.items);
  });
}

