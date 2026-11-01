import path from "node:path";
import { connection } from "next/server";
import { logoFile } from "@/server/settings";
import { readFile } from "@/server/fsx";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

/** The school's logo, or the built-in stage logo. Public, so the sign-in page can show it. */
export async function GET() {
  await connection();
  const f = logoFile() ?? path.join(process.cwd(), "public", "stage-logo.png");
  return new Response(readFile(f), { headers: { "Content-Type": TYPES[path.extname(f).toLowerCase()] ?? "image/png", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" } });
}
