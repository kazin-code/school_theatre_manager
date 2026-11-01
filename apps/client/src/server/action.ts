import "server-only";
import { updateTag } from "next/cache";
import { ZodError } from "zod";
import { ActionError } from "./auth";
import { ApiFail } from "./api";
import type { Tag } from "./tags";
import { T } from "./tags";

export type Result<D = undefined> =
  | { ok: true; data: D }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Run a server action body, turning the server's errors into friendly results. */
export async function run<D>(fn: () => Promise<D> | D): Promise<Result<D>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ApiFail) return { ok: false, error: e.message, ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}) };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const i of e.issues) fieldErrors[i.path.join(".")] ??= i.message;
      return { ok: false, error: e.issues[0]?.message ?? "Check the highlighted fields.", fieldErrors };
    }
    if (e instanceof ActionError) return { ok: false, error: e.message };
    // Next.js uses thrown values for redirect()/notFound(); let those through.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { ok: false, error: "Something went wrong saving that: " + (e instanceof Error ? e.message : String(e)) };
  }
}

/** Expire this computer's cached reads after a change, so the next screen shows it straight away. */
export function changed(...tags: Tag[]) {
  for (const t of new Set<Tag>([...tags, T.activity])) updateTag(t);
}
