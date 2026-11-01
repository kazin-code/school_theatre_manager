"use server";
import { api } from "../api";
import { changed, run } from "../action";
import { T } from "../tags";

export async function saveItemAction(id: number | null, input: unknown) {
  return run(async () => {
    const r = await api<{ id: number }>(id ? `/items/${id}` : "/items", { method: id ? "PUT" : "POST", json: input });
    changed(T.items);
    return r;
  });
}

export async function recordConditionAction(id: number, input: unknown) {
  return run(async () => { await api(`/items/${id}/condition`, { json: input }); changed(T.items); });
}

export async function deleteItemAction(id: number) {
  return run(async () => { await api(`/items/${id}`, { method: "DELETE" }); changed(T.items); });
}

export async function addItemPhotosAction(id: number, fd: FormData) {
  return run(async () => { await api(`/items/${id}/photos`, { form: fd }); changed(T.items); });
}

export async function updateItemPhotoAction(photoId: number, change: { caption?: string; main?: boolean; move?: "earlier" | "later" }) {
  return run(async () => { await api(`/item-photos/${photoId}`, { method: "PATCH", json: change }); changed(T.items); });
}

export async function deleteItemPhotoAction(photoId: number) {
  return run(async () => { await api(`/item-photos/${photoId}`, { method: "DELETE" }); changed(T.items); });
}
