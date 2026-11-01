"use server";
import { api } from "../api";
import { changed, run } from "../action";
import { T } from "../tags";

// ---------- renters ----------
export async function saveRenterAction(id: number | null, input: unknown) {
  return run(async () => {
    const r = await api<{ id: number }>(id ? `/renters/${id}` : "/renters", { method: id ? "PUT" : "POST", json: input });
    changed(T.renters);
    return r;
  });
}

export async function deleteRenterAction(id: number) {
  return run(async () => { await api(`/renters/${id}`, { method: "DELETE" }); changed(T.renters); });
}

// ---------- rentals ----------
export async function createRentalAction(input: unknown) {
  return run(async () => {
    const r = await api<{ id: number; itemIds: number[] }>("/rentals", { json: input });
    changed(T.rentals, T.items, T.renters);
    return r;
  });
}

export async function updateRentalAction(id: number, input: unknown) {
  return run(async () => { await api(`/rentals/${id}`, { method: "PATCH", json: input }); changed(T.rentals); });
}

export async function returnRentalAction(id: number, input: unknown) {
  return run(async () => { await api(`/rentals/${id}/return`, { json: input }); changed(T.rentals, T.items, T.renters); });
}

/** Undo a rental entered by mistake (only while it's still out). */
export async function cancelRentalAction(id: number) {
  return run(async () => { await api(`/rentals/${id}/cancel`, { method: "POST" }); changed(T.rentals, T.items, T.renters); });
}
