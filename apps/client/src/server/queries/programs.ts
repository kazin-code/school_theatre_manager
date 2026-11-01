import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Program } from "@stm/server/types";
import { api, cacheKey } from "../api";
import { T } from "../tags";

async function programAt(showId: number, token: string, rev: string) {
  "use cache";
  cacheTag(T.programs, T.shows);
  cacheLife("max");
  void rev;
  return api<Program>(`/shows/${showId}/program`, { token });
}
export async function getProgram(showId: number) { const k = await cacheKey(); return programAt(showId, k.token, k.rev); }
