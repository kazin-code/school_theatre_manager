import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { RentalDetail, RentalRow, RenterDetail, RenterRow } from "@stm/server/types";
import { api, ApiFail, cacheKey } from "../api";
import { T } from "../tags";

export type { RentalDetail, RentalRow, RenterDetail, RenterRow };

async function rentersAt(token: string, rev: string) {
  "use cache";
  cacheTag(T.renters, T.rentals);
  cacheLife("max");
  void rev;
  return api<RenterRow[]>("/renters", { token });
}
export async function listRenters() { const k = await cacheKey(); return rentersAt(k.token, k.rev); }

async function rentalsAt(token: string, rev: string) {
  "use cache";
  cacheTag(T.rentals, T.renters);
  cacheLife("max");
  void rev;
  return api<RentalRow[]>("/rentals", { token });
}
export async function listRentals() { const k = await cacheKey(); return rentalsAt(k.token, k.rev); }

async function renterAt(id: number, token: string, rev: string) {
  "use cache";
  cacheTag(T.renters, T.rentals);
  cacheLife("max");
  void rev;
  try { return await api<RenterDetail>(`/renters/${id}`, { token }); } catch (e) { if (e instanceof ApiFail && e.status === 404) return null; throw e; }
}
export async function getRenter(id: number) { const k = await cacheKey(); return renterAt(id, k.token, k.rev); }

async function rentalAt(id: number, token: string, rev: string) {
  "use cache";
  cacheTag(T.rentals, T.renters, T.items);
  cacheLife("max");
  void rev;
  try { return await api<RentalDetail>(`/rentals/${id}`, { token }); } catch (e) { if (e instanceof ApiFail && e.status === 404) return null; throw e; }
}
export async function getRental(id: number) { const k = await cacheKey(); return rentalAt(id, k.token, k.rev); }
