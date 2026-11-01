"use server";
import type { PEOPLE_KINDS, SHOW_STATUSES } from "@stm/core/db/schema";
import type { Checkout } from "@stm/server/types";
import { api } from "../api";
import { changed, run } from "../action";
import { T } from "../tags";

// ---------- the show itself ----------
export async function saveShowAction(id: number | null, input: unknown) {
  return run(async () => {
    const r = await api<{ id: number }>(id ? `/shows/${id}` : "/shows", { method: id ? "PUT" : "POST", json: input });
    changed(T.shows);
    return r;
  });
}

export async function setCoverAction(showId: number, fd: FormData) {
  return run(async () => { await api(`/shows/${showId}/cover`, { form: fd }); changed(T.shows); });
}

export async function removeCoverAction(showId: number) {
  return run(async () => { await api(`/shows/${showId}/cover`, { method: "DELETE" }); changed(T.shows); });
}

/** Move a show between planning, in production and past. Moving to past can return everything still checked out. */
export async function setShowStatusAction(id: number, status: (typeof SHOW_STATUSES)[number], returnAll = false) {
  return run(async () => { await api(`/shows/${id}/status`, { method: "PUT", json: { status, returnAll } }); changed(T.shows, T.items); });
}

/** Delete a cancelled show (the server takes a safety copy first and keeps its files in the recycle folder). */
export async function deleteShowAction(id: number, typedTitle: string) {
  return run(async () => { await api(`/shows/${id}/delete`, { json: { title: typedTitle } }); changed(T.shows, T.items, T.programs); });
}

// ---------- cast, crew, team, pit ----------
export async function savePersonAction(showId: number, id: number | null, input: unknown) {
  return run(async () => { await api(id ? `/shows/${showId}/people/${id}` : `/shows/${showId}/people`, { method: id ? "PUT" : "POST", json: input }); changed(T.shows); });
}

export async function deletePersonAction(showId: number, id: number) {
  return run(async () => { await api(`/shows/${showId}/people/${id}`, { method: "DELETE" }); changed(T.shows); });
}

/** Paste a list: one person per line, "Name, Role" or "Name - Role" or tab separated (straight from a spreadsheet). */
export async function importPeopleAction(showId: number, kind: (typeof PEOPLE_KINDS)[number], text: string) {
  return run(async () => {
    const r = await api<{ count: number }>(`/shows/${showId}/people/import`, { json: { kind, text } });
    changed(T.shows);
    return r;
  });
}

// ---------- musical numbers ----------
export async function saveNumberAction(showId: number, id: number | null, input: unknown) {
  return run(async () => { await api(id ? `/shows/${showId}/numbers/${id}` : `/shows/${showId}/numbers`, { method: id ? "PUT" : "POST", json: input }); changed(T.shows); });
}

export async function deleteNumberAction(showId: number, id: number) {
  return run(async () => { await api(`/shows/${showId}/numbers/${id}`, { method: "DELETE" }); changed(T.shows); });
}

/** Reorder people or numbers: pass the ids in their new order. */
export async function reorderAction(showId: number, what: "people" | "numbers", ids: number[]) {
  return run(async () => { await api(`/shows/${showId}/order`, { method: "PUT", json: { what, ids } }); changed(T.shows); });
}

// ---------- materials & photos ----------
export async function addShowFilesAction(showId: number, kind: "material" | "photo" | "program", fd: FormData) {
  return run(async () => {
    fd.set("kind", kind);
    await api(`/shows/${showId}/files`, { form: fd });
    changed(T.shows, T.programs);
  });
}

export async function updateShowFileAction(id: number, change: { caption?: string; category?: string }) {
  return run(async () => { await api(`/show-files/${id}`, { method: "PATCH", json: change }); changed(T.shows); });
}

export async function deleteShowFileAction(id: number) {
  return run(async () => { await api(`/show-files/${id}`, { method: "DELETE" }); changed(T.shows); });
}

/** Use one of the show's photos as its cover. */
export async function photoAsCoverAction(showId: number, fileId: number) {
  return run(async () => { await api(`/shows/${showId}/cover-from/${fileId}`, { method: "POST" }); changed(T.shows); });
}

// ---------- costumes, props & set pieces checked out to the show ----------
export async function checkoutAction(showId: number, input: unknown) {
  return run(async () => {
    const r = await api<Checkout>(`/shows/${showId}/checkout`, { json: input });
    changed(T.shows, T.items);
    return r;
  });
}

export async function updateLineAction(lineId: number, input: unknown) {
  return run(async () => { await api(`/show-lines/${lineId}`, { method: "PATCH", json: input }); changed(T.shows, T.items); });
}

export async function returnLinesAction(showId: number, input: unknown) {
  return run(async () => { await api(`/shows/${showId}/returns`, { json: input }); changed(T.shows, T.items); });
}

/** Remove a line checked out by mistake (it was never really used). */
export async function removeLineAction(lineId: number) {
  return run(async () => { await api(`/show-lines/${lineId}`, { method: "DELETE" }); changed(T.shows, T.items); });
}
