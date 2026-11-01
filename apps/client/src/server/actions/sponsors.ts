"use server";
import { api } from "../api";
import { changed, run } from "../action";
import { T } from "../tags";

/** Save a sponsor; FormData carries the fields as JSON in "data" and an optional "logo" picture (or "removeLogo"). */
export async function saveSponsorAction(id: number | null, fd: FormData) {
  return run(async () => {
    const r = await api<{ id: number }>(id ? `/sponsors/${id}` : "/sponsors", { method: id ? "PUT" : "POST", form: fd });
    changed(T.sponsors, T.programs);
    return r;
  });
}

export async function deleteSponsorAction(id: number) {
  return run(async () => { await api(`/sponsors/${id}`, { method: "DELETE" }); changed(T.sponsors, T.programs); });
}
