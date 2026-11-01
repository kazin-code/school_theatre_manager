import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { programs, showFiles, shows } from "@/db/schema";
import { T } from "../tags";

export async function getProgram(showId: number) {
  "use cache";
  cacheTag(T.programs, T.shows);
  cacheLife("max");
  const row = db().select().from(programs).where(eq(programs.showId, showId)).get();
  const pictures = db().select({ id: showFiles.id, file: showFiles.file, kind: showFiles.kind, caption: showFiles.caption, originalName: showFiles.originalName })
    .from(showFiles).where(and(eq(showFiles.showId, showId))).orderBy(asc(showFiles.sort), asc(showFiles.id)).all().filter((f) => f.kind === "program" || f.kind === "photo");
  const others = db().select({ id: shows.id, title: shows.title, year: shows.year, season: shows.season }).from(programs).innerJoin(shows, eq(shows.id, programs.showId))
    .where(ne(programs.showId, showId)).orderBy(asc(shows.title)).all();
  return { doc: (row?.doc ?? null) as unknown, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null, pictures, others };
}
