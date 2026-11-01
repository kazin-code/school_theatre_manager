import { connection } from "next/server";
import { APP_ID, APP_VERSION } from "@stm/core/version";
import { getBranding } from "@/server/settings";

/** Public: lets other computers on the school network recognize this program (name only, no data). */
export async function GET() {
  await connection();
  const b = await getBranding();
  return Response.json({ app: APP_ID, version: APP_VERSION, name: b.name, school: b.school ?? null }, { headers: { "Cache-Control": "no-store" } });
}
