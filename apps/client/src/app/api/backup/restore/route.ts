import os from "node:os";
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { connection } from "next/server";
import { currentUser } from "@/server/auth";
import { restoreFromZip } from "@/server/backup";
import { logActivity } from "@/server/activity";
import { exists, pjoin, remove } from "@/server/fsx";

/** Restore from an uploaded full-backup zip. The body is streamed to disk, so large backups work. */
export async function POST(req: Request) {
  await connection();
  const me = await currentUser();
  if (!me || me.role !== "director") return Response.json({ ok: false, error: "Only a director can restore a backup." }, { status: 403 });
  if (req.headers.get("x-confirm") !== "RESTORE") return Response.json({ ok: false, error: "Type RESTORE to confirm." }, { status: 400 });
  if (!req.body) return Response.json({ ok: false, error: "Choose a backup file." }, { status: 400 });
  const tmp = pjoin(os.tmpdir(), `stm-upload-${Date.now()}.zip`);
  try {
    await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), fs.createWriteStream(/*turbopackIgnore: true*/ tmp));
    const n = restoreFromZip(tmp);
    logActivity(me.displayName, "backup", `Restored from a backup file (${n} files)`);
    return Response.json({ ok: true, files: n });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  } finally { if (exists(tmp)) remove(tmp); }
}
