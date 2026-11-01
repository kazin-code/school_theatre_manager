import { connection } from "next/server";
import { passThrough } from "@/server/pass";

/** Uploaded photos and files, for signed-in users. Show files download under their original names. */
export async function GET(req: Request, ctx: RouteContext<"/api/files/[kind]/[name]">) {
  await connection();
  const { kind, name } = await ctx.params;
  const q = new URL(req.url).searchParams.has("download") ? "?download=1" : "";
  return passThrough(`/files/${encodeURIComponent(kind)}/${encodeURIComponent(name)}${q}`);
}
