"use server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { programs, shows } from "@stm/core/db/schema";
import { docSchema } from "@stm/core/program/model";
import { actionUser, ActionError } from "../auth";
import { changed, nowIso, run } from "../action";
import { logActivity } from "../activity";
import { T } from "../tags";

export async function saveProgramAction(showId: number, doc: unknown) {
  return run(async () => {
    const me = await actionUser();
    if (!db().select({ id: shows.id }).from(shows).where(eq(shows.id, showId)).get()) throw new ActionError("That show no longer exists.");
    const v = docSchema.parse(doc);
    const first = !db().select({ id: programs.showId }).from(programs).where(eq(programs.showId, showId)).get();
    db().insert(programs).values({ showId, doc: v, updatedAt: nowIso(), updatedBy: me.displayName })
      .onConflictDoUpdate({ target: programs.showId, set: { doc: v, updatedAt: nowIso(), updatedBy: me.displayName } }).run();
    if (first) logActivity(me.displayName, "program", `Started the program for show #${showId}`);
    changed(T.programs);
    return { savedAt: nowIso() };
  });
}

/** Another show's program, to start from. Lists (cast, songs…) fill in from this show when drawn. */
export async function programToCopyAction(fromShowId: number) {
  return run(async () => {
    await actionUser();
    const row = db().select().from(programs).where(eq(programs.showId, fromShowId)).get();
    if (!row) throw new ActionError("That show has no program to copy.");
    return docSchema.parse(row.doc);
  });
}
