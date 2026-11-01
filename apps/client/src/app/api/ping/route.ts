/** Used by the Windows launcher to see whether the program is already running. */
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ app: "school-theatre-manager" });
}
