import { asc, eq, ne } from "drizzle-orm";
import { docSchema } from "@stm/core/program/model";
import { db, nowIso, one, t, write } from "../db";
import { gone } from "../errors";
import { logActivity } from "../activity";
import type { Me } from "../me";

export async function getProgram(showId: number) {
  const row = await one(db().select().from(t.programs).where(eq(t.programs.showId, showId)).limit(1));
  const pictures = (await db().select({ id: t.showFiles.id, file: t.showFiles.file, kind: t.showFiles.kind, caption: t.showFiles.caption, originalName: t.showFiles.originalName })
    .from(t.showFiles).where(eq(t.showFiles.showId, showId)).orderBy(asc(t.showFiles.sort), asc(t.showFiles.id))).filter((f) => f.kind === "program" || f.kind === "photo");
  const others = await db().select({ id: t.shows.id, title: t.shows.title, year: t.shows.year, season: t.shows.season }).from(t.programs).innerJoin(t.shows, eq(t.shows.id, t.programs.showId))
    .where(ne(t.programs.showId, showId)).orderBy(asc(t.shows.title));
  return { doc: (row?.doc ?? null) as unknown, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null, pictures, others };
}

export function saveProgram(me: Me, showId: number, doc: unknown) {
  return write(async () => {
    if (!(await one(db().select({ id: t.shows.id }).from(t.shows).where(eq(t.shows.id, showId)).limit(1)))) throw gone("That show");
    const v = docSchema.parse(doc);
    const first = !(await one(db().select({ id: t.programs.showId }).from(t.programs).where(eq(t.programs.showId, showId)).limit(1)));
    const at = nowIso();
    await db().insert(t.programs).values({ showId, doc: v, updatedAt: at, updatedBy: me.displayName })
      .onConflictDoUpdate({ target: t.programs.showId, set: { doc: v, updatedAt: at, updatedBy: me.displayName } });
    if (first) await logActivity(me.displayName, "program", `Started the program for show #${showId}`);
    return { savedAt: at };
  });
}

/** Another show's program, to start from. */
export async function programToCopy(fromShowId: number) {
  const row = await one(db().select().from(t.programs).where(eq(t.programs.showId, fromShowId)).limit(1));
  if (!row) throw gone("That show's program");
  return docSchema.parse(row.doc);
}
