"use server";
import { api } from "../api";
import { changed, run } from "../action";
import { T } from "../tags";

export async function saveBrandingAction(input: unknown) {
  return run(async () => { await api("/branding", { method: "PUT", json: input }); changed(T.settings); });
}

/** Logo from Settings: the browser sends a 512px PNG ("logo") and a 256px PNG ("icon", for the Windows icon). */
export async function saveLogoAction(fd: FormData) {
  return run(async () => { await api("/branding/logo", { form: fd }); changed(T.settings); });
}

export async function removeLogoAction() {
  return run(async () => { await api("/branding/logo", { method: "DELETE" }); changed(T.settings); });
}

export async function saveListAction(list: string, values: string[]) {
  return run(async () => { await api(`/lists/${encodeURIComponent(list)}`, { method: "PUT", json: { values } }); changed(T.lookups); });
}

export async function createUserAction(input: unknown) {
  return run(async () => { await api("/users", { json: input }); changed(T.users); });
}

export async function updateUserAction(id: number, input: { displayName?: string; role?: "director" | "assistant"; active?: boolean; password?: string }) {
  return run(async () => { await api(`/users/${id}`, { method: "PATCH", json: input }); changed(T.users); });
}
