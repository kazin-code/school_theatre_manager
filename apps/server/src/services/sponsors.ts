import { asc, eq, sql } from "drizzle-orm";
import { sponsorSchema } from "@stm/core/db/validation";
import { db, nocase, nowIso, one, t, write } from "../db";
import { gone } from "../errors";
import { removeFile, savePhoto } from "../files";
import { logActivity } from "../activity";
import type { Me } from "../me";

export async function listSponsors() {
  return db().select().from(t.sponsors).orderBy(sql`CASE WHEN ${t.sponsors.active} THEN 0 ELSE 1 END`, asc(t.sponsors.sort), nocase(t.sponsors.name));
}

/** Save a sponsor, with an optional new logo/ad picture (or removeLogo). */
export function saveSponsor(me: Me, id: number | null, input: unknown, logo: unknown, removeLogo: boolean) {
  return write(async () => {
    const v = sponsorSchema.parse(input);
    const old = id ? await one(db().select().from(t.sponsors).where(eq(t.sponsors.id, id)).limit(1)) : null;
    if (id && !old) throw gone("That sponsor");
    let file = old?.logo ?? null;
    if (logo instanceof File && logo.size) file = await savePhoto("sponsors", "sponsor", logo, 25);
    else if (removeLogo) file = null;
    if (old?.logo && old.logo !== file) removeFile("sponsors", old.logo);
    let sid = id;
    if (id) await db().update(t.sponsors).set({ ...v, logo: file, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(t.sponsors.id, id));
    else sid = (await one(db().insert(t.sponsors).values({ ...v, logo: file, createdBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).returning({ id: t.sponsors.id })))!.id;
    await logActivity(me.displayName, "sponsor", `${id ? "Edited" : "Added"} sponsor ${v.name}`);
    return { id: sid! };
  });
}

export function deleteSponsor(me: Me, id: number) {
  return write(async () => {
    const s = await one(db().select().from(t.sponsors).where(eq(t.sponsors.id, id)).limit(1));
    if (!s) throw gone("That sponsor");
    await db().delete(t.sponsors).where(eq(t.sponsors.id, id));
    removeFile("sponsors", s.logo);
    await logActivity(me.displayName, "sponsor", `Deleted sponsor ${s.name}`);
  });
}
