import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ActivityRow, UserRow } from "@stm/server/types";
import { api, cacheKey } from "../api";
import { T } from "../tags";

async function usersAt(token: string, rev: string) {
  "use cache";
  cacheTag(T.users);
  cacheLife("max");
  void rev;
  return api<UserRow[]>("/users", { token });
}
export async function getUsers() { const k = await cacheKey(); return usersAt(k.token, k.rev); }

async function activityAt(limit: number, token: string, rev: string) {
  "use cache";
  cacheTag(T.activity);
  cacheLife("max");
  void rev;
  return api<ActivityRow[]>(`/activity?limit=${limit}`, { token });
}
export async function getActivity(limit = 300) { const k = await cacheKey(); return activityAt(limit, k.token, k.rev); }
