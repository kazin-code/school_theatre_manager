import "server-only";
import { updateTag } from "next/cache";
import { ZodError } from "zod";
import { ActionError } from "./auth";
import type { Tag } from "./tags";
import { T } from "./tags";
import { scheduleCloud } from "./backup";

export type Result<D = undefined> =
  | { ok: true; data: D }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Run a server action body, turning validation and permission errors into friendly results. */
export async function run<D>(fn: () => Promise<D> | D): Promise<Result<D>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const i of e.issues) fieldErrors[i.path.join(".")] ??= i.message;
      return { ok: false, error: e.issues[0]?.message ?? "Check the highlighted fields.", fieldErrors };
    }
    if (e instanceof ActionError) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE constraint failed: items\.tag/.test(msg)) return { ok: false, error: "That tag number is already used by another item.", fieldErrors: { tag: "Already used" } };
    if (/UNIQUE constraint failed: users\.username/.test(msg)) return { ok: false, error: "That username is already taken.", fieldErrors: { username: "Already taken" } };
    if (/FOREIGN KEY constraint failed/.test(msg)) return { ok: false, error: "This record is still used elsewhere, so it can't be removed." };
    // Next.js uses thrown values for redirect()/notFound(); let those through.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { ok: false, error: "Something went wrong saving that: " + msg };
  }
}

/** Expire cached reads after a change. The activity feed always changes too. */
export function changed(...tags: Tag[]) {
  for (const t of new Set<Tag>([...tags, T.activity])) updateTag(t);
  scheduleCloud();
}

export const nowIso = () => new Date().toISOString();
export const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
