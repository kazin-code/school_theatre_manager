import { connection } from "next/server";
import { api, ApiFail } from "@/server/api";

/** Restore from an uploaded full-backup zip. The upload streams straight through to the server. */
export async function POST(req: Request) {
  await connection();
  if (!req.body) return Response.json({ ok: false, error: "Choose a backup file." }, { status: 400 });
  try {
    const r = await api<{ files: number }>("/backups/restore", { method: "POST", body: req.body, headers: { "x-confirm": req.headers.get("x-confirm") ?? "", "content-type": "application/zip" } });
    return Response.json({ ok: true, files: r.files });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: e instanceof ApiFail ? e.status : 500 });
  }
}
