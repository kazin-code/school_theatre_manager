"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

type Res = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Show a server action's errors on the form. Returns true when the action succeeded. */
export function applyResult<F extends FieldValues>(form: UseFormReturn<F, any, any>, res: Res): boolean {
  if (res.ok) return true;
  for (const [k, m] of Object.entries(res.fieldErrors ?? {})) form.setError(k as Path<F>, { message: m });
  form.setError("root", { message: res.error });
  return false;
}
