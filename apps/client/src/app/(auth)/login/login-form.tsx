"use client";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { CheckboxField, FormError, TextField } from "@/components/app/fields";
import { loginSchema } from "@stm/core/db/validation";
import { loginAction } from "@/server/actions/auth";
import { applyResult } from "@/lib/forms";

export function LoginForm() {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { username: "", password: "", remember: false } });
  const onSubmit = form.handleSubmit(async (v) => {
    const res = await loginAction(v);
    if (!applyResult(form, res)) { form.setValue("password", ""); return; }
    router.replace(res.ok && res.data.mustChange ? "/change-password" : "/");
    router.refresh();
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
        <div><h2 className="text-xl font-semibold">Sign in</h2><p className="text-sm text-muted-foreground">Use the director or assistant account set up for this computer.</p></div>
        <FormError />
        <TextField name="username" label="Username" autoComplete="username" autoFocus />
        <TextField name="password" label="Password" type="password" autoComplete="current-password" />
        <CheckboxField name="remember" label="Keep me signed in on this computer for 30 days" />
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Signing in…" : "Sign in"}</Button>
        <p className="text-xs text-muted-foreground">Forgot the director password? A Windows administrator can run <b>Reset Director Password</b> from the Start menu.</p>
      </form>
    </FormProvider>
  );
}
