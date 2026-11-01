import "server-only";
import { sqlite } from "@/db";
import { dir } from "./paths";
import { list, pjoin, remove, stat } from "./fsx";

/** A copy of the database taken right before something hard to undo (e.g. deleting a show). Keeps the newest 20. */
export async function safetySnapshot(reason: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = `before-${reason.replace(/[^a-z0-9-]/gi, "-").slice(0, 40)}-${stamp}.db`;
  await sqlite().backup(pjoin(dir("backups"), name));
  const old = list(dir("backups")).filter((f) => f.startsWith("before-") && f.endsWith(".db"))
    .map((f) => ({ f, t: stat(pjoin(dir("backups"), f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(20);
  for (const o of old) remove(pjoin(dir("backups"), o.f));
  return name;
}
