import { db, t } from "./db";
/** Add a line to the activity log ("who did what"). */
export async function logActivity(user: string | null, action: string, details: string) {
  await db().insert(t.activity).values({ user, action, details });
}
