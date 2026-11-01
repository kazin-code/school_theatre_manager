import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { SponsorRow } from "@stm/server/types";
import { api, cacheKey } from "../api";
import { T } from "../tags";

async function sponsorsAt(token: string, rev: string) {
  "use cache";
  cacheTag(T.sponsors);
  cacheLife("max");
  void rev;
  return api<SponsorRow[]>("/sponsors", { token });
}
export async function listSponsors() { const k = await cacheKey(); return sponsorsAt(k.token, k.rev); }
