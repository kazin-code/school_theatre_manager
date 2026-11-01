"use client";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, TextField } from "./fields";
import { PasswordChecklist } from "./password-checklist";
import { changePasswordSchema } from "@/db/validation";
import { changePasswordAction } from "@/server/actions/auth";
import { applyResult } from "@/lib/forms";

export function ChangePasswordForm({ after }: { after?: string }) {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(changePasswordSchema), defaultValues: { current: "", next: "", confirm: "" } });
  const onSubmit = form.handleSubmit(async (v) => {
    if (!applyResult(form, await changePasswordAction(v))) return;
    toast.success("Password changed");
    form.reset();
    if (after) { router.replace(after); router.refresh(); }
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError />
        <TextField name="current" label="Current password" type="password" autoComplete="current-password" />
        <div className="flex flex-col gap-2">
          <TextField name="next" label="New password" type="password" autoComplete="new-password" />
          <PasswordChecklist value={form.watch("next")} />
        </div>
        <TextField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" />
        <div><Button type="submit" disabled={form.formState.isSubmitting}>Save password</Button></div>
      </form>
    </FormProvider>
  );
}
