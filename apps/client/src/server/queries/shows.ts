import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db";
import { items, programs, showFiles, showItems, showNumbers, showPeople, shows } from "@stm/core/db/schema";
import { T } from "../tags";

/** Qualified, so it is not confused with the subquery tables' own id columns. */
const SHOW_ID = sql.raw(`"shows"."id"`);

const counts = {
  pieces: sql<number>`(SELECT COALESCE(SUM(qty),0) FROM show_items WHERE show_id=${SHOW_ID})`.as("pieces"),
  outPieces: sql<number>`(SELECT COALESCE(SUM(qty),0) FROM show_items WHERE show_id=${SHOW_ID} AND date_returned IS NULL)`.as("out_pieces"),
  castCount: sql<number>`(SELECT COUNT(*) FROM show_people WHERE show_id=${SHOW_ID} AND kind='cast')`.as("cast_count"),
  crewCount: sql<number>`(SELECT COUNT(*) FROM show_people WHERE show_id=${SHOW_ID} AND kind!='cast')`.as("crew_count"),
  photoCount: sql<number>`(SELECT COUNT(*) FROM show_files WHERE show_id=${SHOW_ID} AND kind='photo')`.as("photo_count"),
  materialCount: sql<number>`(SELECT COUNT(*) FROM show_files WHERE show_id=${SHOW_ID} AND kind='material')`.as("material_count"),
  numberCount: sql<number>`(SELECT COUNT(*) FROM show_numbers WHERE show_id=${SHOW_ID})`.as("number_count"),
};

export async function listShows() {
  "use cache";
  cacheTag(T.shows);
  cacheLife("max");
  return db().select({ ...getTableColumns(shows), ...counts }).from(shows)
    .orderBy(sql`COALESCE(${shows.openDate}, ${shows.year} || '-12-31') DESC`, desc(shows.id)).all();
}
export type ShowRow = Awaited<ReturnType<typeof listShows>>[number];

export async function getShow(id: number) {
  "use cache";
  cacheTag(T.shows, T.items);
  cacheLife("max");
  const show = db().select({ ...getTableColumns(shows), ...counts }).from(shows).where(eq(shows.id, id)).get();
  if (!show) return null;
  return {
    show,
    people: db().select().from(showPeople).where(eq(showPeople.showId, id)).orderBy(sql`CASE ${showPeople.kind} WHEN 'team' THEN 0 WHEN 'cast' THEN 1 WHEN 'pit' THEN 2 ELSE 3 END`, asc(showPeople.sort), asc(showPeople.id)).all(),
    numbers: db().select().from(showNumbers).where(eq(showNumbers.showId, id)).orderBy(asc(showNumbers.sort), asc(showNumbers.id)).all(),
    files: db().select().from(showFiles).where(eq(showFiles.showId, id)).orderBy(asc(showFiles.sort), asc(showFiles.id)).all(),
    lines: db().select({ line: showItems, item: { id: items.id, tag: items.tag, name: items.name, category: items.category, size: items.size, location: items.location, mainPhoto: items.mainPhoto, condition: items.condition } })
      .from(showItems).innerJoin(items, eq(items.id, showItems.itemId)).where(eq(showItems.showId, id))
      .orderBy(sql`${showItems.character} IS NULL`, sql`${showItems.character} COLLATE NOCASE`, asc(items.category), asc(items.name)).all(),
    hasProgram: !!db().select({ id: programs.showId }).from(programs).where(eq(programs.showId, id)).get(),
  };
}
export type ShowDetail = NonNullable<Awaited<ReturnType<typeof getShow>>>;
