import { connection } from "next/server";
import { passThrough } from "@/server/pass";

/** Public: lets other computers on the school network recognize this program (name only, no data). */
export async function GET() {
  await connection();
  return passThrough("/server-info", { token: null });
}
