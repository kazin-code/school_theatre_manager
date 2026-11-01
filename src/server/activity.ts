import "server-only";
import { db } from "@/db";
import { activity } from "@/db/schema";

export function logActivity(user: string | null | undefined, action: string, details: string) {
  db().insert(activity).values({ user: user ?? null, action, details }).run();
}
