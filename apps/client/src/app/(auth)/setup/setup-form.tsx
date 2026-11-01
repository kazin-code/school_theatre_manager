"use client";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { FormError, TextField } from "@/components/app/fields";
import { PasswordChecklist } from "@/components/app/password-checklist";
import { setupSchema } from "@stm/core/db/validation";
import { setupAction } from "@/server/actions/auth";
import { applyResult } from "@/lib/forms";

export function SetupForm() {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(setupSchema), defaultValues: { displayName: "", username: "", password: "", confirm: "" } });
  const onSubmit = form.handleSubmit(async (v) => {
    if (applyResult(form, await setupAction(v))) { router.replace("/"); router.refresh(); }
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
        <div><h2 className="text-xl font-semibold">Create the director account</h2><p className="text-sm text-muted-foreground">This account owns the program. It can add other users, change settings and restore backups.</p></div>
        <FormError />
        <TextField name="displayName" label="Your name" placeholder="e.g. Ms. Rivera" autoFocus />
        <TextField name="username" label="Username" autoComplete="username" hint="Letters, numbers, dots or dashes." />
        <div className="flex flex-col gap-2">
          <TextField name="password" label="Password" type="password" autoComplete="new-password" />
          <PasswordChecklist value={form.watch("password")} />
        </div>
        <TextField name="confirm" label="Confirm password" type="password" autoComplete="new-password" />
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>Create account</Button>
      </form>
    </FormProvider>
  );
}
