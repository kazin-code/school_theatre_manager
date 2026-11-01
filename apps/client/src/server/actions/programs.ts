"use server";
import type { Doc } from "@stm/core/program/model";
import { api } from "../api";
import { changed, run } from "../action";
import { T } from "../tags";

export async function saveProgramAction(showId: number, doc: unknown) {
  return run(async () => {
    const r = await api<{ savedAt: string }>(`/shows/${showId}/program`, { method: "PUT", json: { doc } });
    changed(T.programs);
    return r;
  });
}

/** Another show's program, to start from. Lists (cast, songs…) fill in from this show when drawn. */
export async function programToCopyAction(fromShowId: number) {
  return run(() => api<Doc>(`/programs/${fromShowId}`));
}
