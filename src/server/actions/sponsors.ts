"use server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sponsors } from "@/db/schema";
import { sponsorSchema } from "@/db/validation";
import { actionUser, ActionError } from "../auth";
import { logActivity } from "../activity";
import { changed, nowIso, run } from "../action";
import { T } from "../tags";
import { filePath } from "../paths";
import { remove } from "../fsx";
import { savePhoto } from "../uploads";

/** Save a sponsor; FormData carries the fields as JSON in "data" and an optional "logo" picture (or "removeLogo"). */
export async function saveSponsorAction(id: number | null, fd: FormData) {
  return run(async () => {
    const me = await actionUser();
    const v = sponsorSchema.parse(JSON.parse(String(fd.get("data") ?? "{}")));
    const old = id ? db().select().from(sponsors).where(eq(sponsors.id, id)).get() : null;
    if (id && !old) throw new ActionError("That sponsor no longer exists.");
    let logo = old?.logo ?? null;
    const f = fd.get("logo");
    if (f instanceof File && f.size) logo = await savePhoto("sponsors", "sponsor", f, 25);
    else if (fd.get("removeLogo") === "1") logo = null;
    if (old?.logo && old.logo !== logo) { const p = filePath("sponsors", old.logo); if (p) remove(p); }
    let sid = id;
    if (id) db().update(sponsors).set({ ...v, logo, updatedAt: nowIso(), updatedBy: me.displayName }).where(eq(sponsors.id, id)).run();
    else sid = db().insert(sponsors).values({ ...v, logo, createdBy: me.displayName, updatedAt: nowIso(), updatedBy: me.displayName }).returning({ id: sponsors.id }).get().id;
    logActivity(me.displayName, "sponsor", `${id ? "Edited" : "Added"} sponsor ${v.name}`);
    changed(T.sponsors, T.programs);
    return { id: sid! };
  });
}

export async function deleteSponsorAction(id: number) {
  return run(async () => {
    const me = await actionUser("director");
    const s = db().select().from(sponsors).where(eq(sponsors.id, id)).get();
    if (!s) throw new ActionError("That sponsor no longer exists.");
    db().delete(sponsors).where(eq(sponsors.id, id)).run();
    if (s.logo) { const p = filePath("sponsors", s.logo); if (p) remove(p); }
    logActivity(me.displayName, "sponsor", `Deleted sponsor ${s.name}`);
    changed(T.sponsors, T.programs);
  });
}
