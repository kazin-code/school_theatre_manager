import { eq } from "drizzle-orm";
import { db } from "@/db";
import { showFiles } from "@/db/schema";
import { currentUser } from "@/server/auth";
import { filePath } from "@/server/paths";
import { exists, readFile } from "@/server/fsx";
import { extOf } from "@/server/uploads";

const KINDS = { photos: "photos", show: "showfiles", sponsor: "sponsors" } as const;
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".mp4": "video/mp4", ".mov": "video/quicktime", ".txt": "text/plain; charset=utf-8" };

/** Serves uploaded photos and files to signed-in users. Show files download under their original names. */
export async function GET(req: Request, ctx: RouteContext<"/api/files/[kind]/[name]">) {
  const { kind, name } = await ctx.params;
  if (!(await currentUser())) return new Response("Please sign in.", { status: 401 });
  const sub = KINDS[kind as keyof typeof KINDS];
  const f = sub ? filePath(sub, name) : null;
  if (!f || !exists(f)) return new Response("Not found", { status: 404 });
  const ext = extOf(name), type = TYPES[ext] ?? "application/octet-stream";
  const headers: Record<string, string> = { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400" };
  if (kind === "show") {
    const row = db().select({ originalName: showFiles.originalName }).from(showFiles).where(eq(showFiles.file, name)).get();
    const orig = row?.originalName ?? name;
    const inline = (type.startsWith("image/") || type === "application/pdf") && !new URL(req.url).searchParams.has("download");
    headers["Content-Disposition"] = `${inline ? "inline" : "attachment"}; filename="${orig.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(orig)}`;
  }
  return new Response(readFile(f), { headers });
}
