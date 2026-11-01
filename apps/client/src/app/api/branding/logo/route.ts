import path from "node:path";
import fs from "node:fs";
import { connection } from "next/server";
import { apiRaw } from "@/server/api";

/** The school's logo, or the built-in stage logo. Public, so the sign-in page can show it. */
export async function GET() {
  await connection();
  const r = await apiRaw("/branding/logo", { token: null }).catch(() => null);
  if (r?.ok) return new Response(r.body, { headers: { "Content-Type": r.headers.get("content-type") ?? "image/png", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" } });
  await r?.arrayBuffer().catch(() => {});
  const f = path.join(process.cwd(), "public", "stage-logo.png");
  return new Response(fs.readFileSync(/*turbopackIgnore: true*/ f), { headers: { "Content-Type": "image/png", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" } });
}
