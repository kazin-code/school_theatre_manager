"use client";
/**
 * Form fields for react-hook-form, built on shadcn's Field components.
 * Wrap a form in <FormProvider {...form}> and use these with a field name.
 */
import * as React from "react";
import { Controller, get, useFormContext } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Base = { name: string; label: React.ReactNode; hint?: React.ReactNode; className?: string };

function useErr(name: string) {
  const { formState: { errors } } = useFormContext();
  const e = get(errors, name) as { message?: string } | undefined;
  return e?.message;
}

export function TextField({ name, label, hint, className, list, type = "text", ...rest }: Base & { list?: string } & Omit<React.ComponentProps<"input">, "name">) {
  const { register } = useFormContext();
  const err = useErr(name);
  const id = `f-${name.replace(/\./g, "-")}`;
  return (
    <Field data-invalid={!!err || undefined} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type={type} list={list ? `dl-${list}` : undefined} aria-invalid={!!err || undefined} autoComplete={list ? "off" : rest.autoComplete} {...rest} {...register(name)} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
      <FieldError errors={err ? [{ message: err }] : undefined} />
    </Field>
  );
}

export function NumberField(props: Base & Omit<React.ComponentProps<"input">, "name">) {
  return <TextField type="number" inputMode="decimal" step="any" min={0} {...props} />;
}

export function TextAreaField({ name, label, hint, className, rows = 3, ...rest }: Base & Omit<React.ComponentProps<"textarea">, "name">) {
  const { register } = useFormContext();
  const err = useErr(name);
  const id = `f-${name.replace(/\./g, "-")}`;
  return (
    <Field data-invalid={!!err || undefined} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea id={id} rows={rows} aria-invalid={!!err || undefined} {...rest} {...register(name)} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
      <FieldError errors={err ? [{ message: err }] : undefined} />
    </Field>
  );
}

/** A plain <select>, styled like the inputs. Reliable with forms and keyboards. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn("h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground", className)}
      {...props}
    />
  );
}

export function SelectField({ name, label, hint, className, options, placeholder, numeric }: Base & { options: (string | [string | number, string])[]; placeholder?: string; numeric?: boolean }) {
  const { register } = useFormContext();
  const err = useErr(name);
  const id = `f-${name.replace(/\./g, "-")}`;
  return (
    <Field data-invalid={!!err || undefined} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} aria-invalid={!!err || undefined} {...register(name, numeric ? { valueAsNumber: true } : undefined)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return <option key={String(v)} value={v}>{t}</option>; })}
      </NativeSelect>
      {hint && <FieldDescription>{hint}</FieldDescription>}
      <FieldError errors={err ? [{ message: err }] : undefined} />
    </Field>
  );
}

export function CheckboxField({ name, label, hint, className }: Base) {
  const { control } = useFormContext();
  const id = `f-${name.replace(/\./g, "-")}`;
  return (
    <Controller control={control} name={name} render={({ field }) => (
      <Field orientation="horizontal" className={className}>
        <Checkbox id={id} checked={!!field.value} onCheckedChange={(v) => field.onChange(!!v)} />
        <FieldLabel htmlFor={id} className="font-normal">{label}</FieldLabel>
        {hint && <FieldDescription>{hint}</FieldDescription>}
      </Field>
    )} />
  );
}

/** Error shown for the whole form (from the server). */
export function FormError() {
  const { formState: { errors } } = useFormContext();
  const msg = (errors.root as { message?: string } | undefined)?.message;
  if (!msg) return null;
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{msg}</div>;
}

/** Dropdown suggestions for text inputs (rendered once by the app shell). */
export function Datalists({ lists }: { lists: Record<string, string[]> }) {
  return <>{Object.entries(lists).map(([k, vals]) => <datalist key={k} id={`dl-${k}`}>{vals.map((v) => <option key={v} value={v} />)}</datalist>)}</>;
}
