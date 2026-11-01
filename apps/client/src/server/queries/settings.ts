import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { activity, users } from "@stm/core/db/schema";
import { T } from "../tags";

export async function getUsers() {
  "use cache";
  cacheTag(T.users);
  cacheLife("max");
  return db().select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, active: users.active, mustChangePassword: users.mustChangePassword, lastLoginAt: users.lastLoginAt })
    .from(users).orderBy(users.role, users.username).all();
}

export async function getActivity(limit = 300) {
  "use cache";
  cacheTag(T.activity);
  cacheLife("max");
  return db().select().from(activity).orderBy(desc(activity.id)).limit(limit).all();
}
