import { connection, type NextRequest } from "next/server";
import { passThrough } from "@/server/pass";

/** Download a file from the backups folder (directors only). */
export async function GET(req: NextRequest) {
  await connection();
  return passThrough(`/backups/${encodeURIComponent(req.nextUrl.searchParams.get("name") ?? "")}`);
}
