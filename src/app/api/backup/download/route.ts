import { connection, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { currentUser } from "@/server/auth";
import { filePath } from "@/server/paths";
import { exists, openRead, stat } from "@/server/fsx";

/** Download a file from the backups folder (directors only). */
export async function GET(req: NextRequest) {
  await connection();
  const me = await currentUser();
  if (!me || me.role !== "director") return new Response("Only a director can download backups.", { status: 403 });
  const name = req.nextUrl.searchParams.get("name") ?? "";
  const p = /\.(db|zip)$/.test(name) ? filePath("backups", name) : null;
  if (!p || !exists(p)) return new Response("Not found", { status: 404 });
  return new Response(Readable.toWeb(openRead(p)) as ReadableStream, { headers: {
    "Content-Type": name.endsWith(".zip") ? "application/zip" : "application/octet-stream", "Content-Length": String(stat(p).size), "Content-Disposition": `attachment; filename="${name}"` } });
}
