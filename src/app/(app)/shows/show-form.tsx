"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError, NumberField, SelectField, TextAreaField, TextField } from "@/components/app/fields";
import { showSchema, type ShowInput } from "@/db/validation";
import { saveShowAction } from "@/server/actions/shows";
import { applyResult } from "@/lib/forms";
import type { Show } from "@/db/schema";

type Out = z.output<typeof showSchema>;
const KEYS = ["title", "type", "season", "year", "director", "venue", "openDate", "closeDate", "status", "notes", "writtenBy", "bookBy", "musicBy", "lyricsBy", "basedOn", "additionalCredits", "licensor", "licensingNotice"] as const;

export function ShowForm({ show, types, seasons }: { show?: Show; types: string[]; seasons: string[] }) {
  const router = useRouter();
  const blank = Object.fromEntries(KEYS.map((k) => [k, ""])) as unknown as ShowInput;
  const defaults: ShowInput = show ? (Object.fromEntries(KEYS.map((k) => [k, show[k] ?? ""])) as unknown as ShowInput)
    : { ...blank, type: types[0] ?? "Play", status: "planning", year: new Date().getFullYear() };
  const form = useForm<ShowInput, unknown, Out>({ resolver: zodResolver(showSchema), defaultValues: defaults });
  const type = form.watch("type");
  const musical = /musical|revue|opera/i.test(String(type ?? ""));

  async function onSubmit(v: Out) {
    const res = await saveShowAction(show?.id ?? null, v);
    if (!applyResult(form, res)) return;
    toast.success(show ? "Saved." : "Show created.");
    router.push(`/shows/${res.data.id}`);
  }
  const typeOpts = [...new Set([...types, String(show?.type ?? "")])].filter(Boolean);
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-4xl gap-5" noValidate>
        <FormError />
        <Card>
          <CardHeader><CardTitle>The production</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <TextField name="title" label="Title" className="sm:col-span-2" autoFocus={!show} placeholder="e.g. Into the Woods" />
            <SelectField name="type" label="Type" options={typeOpts} />
            <TextField name="season" label="Season" list="season" placeholder={seasons[0]} />
            <NumberField name="year" label="Year" step={1} min={1950} />
            <SelectField name="status" label="Stage" options={[["planning", "Planning"], ["production", "In production"], ["past", "Past show"]]} />
            <TextField name="director" label="Director" hint={show ? undefined : "Also added to the production team."} />
            <TextField name="venue" label="Venue" placeholder="Auditorium" className="sm:col-span-2" />
            <TextField name="openDate" label="Opening night" type="date" />
            <TextField name="closeDate" label="Closing" type="date" />
            <TextAreaField name="notes" label="Notes" className="sm:col-span-3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Authors &amp; rights</CardTitle><CardDescription>Printed on the program&apos;s title page. Only what you fill in is printed.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {!musical && <TextField name="writtenBy" label="Written by" placeholder="Playwright" className="sm:col-span-2" />}
            {musical && <><TextField name="bookBy" label="Book by" /><TextField name="musicBy" label="Music by" /><TextField name="lyricsBy" label="Lyrics by" /><TextField name="writtenBy" label="Written by" hint="If one credit covers book, music and lyrics." /></>}
            <TextField name="basedOn" label="Based on" placeholder={'e.g. the novel "Little Women" by Louisa May Alcott'} className="sm:col-span-2" />
            <TextAreaField name="additionalCredits" label="Other credits" rows={2} placeholder="Orchestrations by…, Originally produced by…" className="sm:col-span-2" />
            <TextField name="licensor" label="Licensed by" list="licensor" />
            <div />
            <TextAreaField name="licensingNotice" label="Licensing notice" rows={3} className="sm:col-span-2" hint="The exact wording your license requires, e.g. “Produced by special arrangement with…”." />
          </CardContent>
        </Card>
        <div className="sticky bottom-0 z-10 flex gap-2 border-t bg-background/95 py-3 backdrop-blur">
          <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Saving…" : show ? "Save changes" : "Create show"}</Button>
          <Link href={show ? `/shows/${show.id}` : "/shows"} className={buttonVariants({ variant: "ghost" })}>Cancel</Link>
        </div>
      </form>
    </FormProvider>
  );
}
