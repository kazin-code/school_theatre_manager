import { connection } from "next/server";
import { passThrough } from "@/server/pass";

/** Spreadsheet (CSV) exports that open in Excel or Google Sheets. */
export async function GET(_req: Request, ctx: RouteContext<"/api/export/[what]">) {
  await connection();
  return passThrough(`/exports/${encodeURIComponent((await ctx.params).what)}`);
}
