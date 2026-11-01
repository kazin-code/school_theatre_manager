"use client";
import { Check, Circle } from "lucide-react";
import { passwordChecks } from "@stm/core/auth/password";

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-live="polite">
      {passwordChecks(value || "").map((c) => (
        <li key={c.label} className={c.ok ? "flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400" : "flex items-center gap-1"}>
          {c.ok ? <Check className="size-3.5" /> : <Circle className="size-3" />}{c.label}
        </li>
      ))}
    </ul>
  );
}
