import { connection } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { currentUser } from "@/server/auth";
import { toCsv } from "@/server/csv";

export async function GET() {
  await connection();
  if (!(await currentUser())) return new Response("Sign in first.", { status: 401 });
  const rows = db().select().from(items).orderBy(items.tag).all();
  const cols = Object.keys(items).filter((k) => !["mainPhoto"].includes(k)) as (keyof typeof rows[number])[];
  const csv = toCsv(cols as string[], rows.map((r) => cols.map((c) => r[c])));
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inventory-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
