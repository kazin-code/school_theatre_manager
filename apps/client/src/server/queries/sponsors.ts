import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { sponsors } from "@stm/core/db/schema";
import { T } from "../tags";

export async function listSponsors() {
  "use cache";
  cacheTag(T.sponsors);
  cacheLife("max");
  return db().select().from(sponsors).orderBy(sql`${sponsors.active} DESC`, asc(sponsors.sort), sql`${sponsors.name} COLLATE NOCASE`).all();
}
