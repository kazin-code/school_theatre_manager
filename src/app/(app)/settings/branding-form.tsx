"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ImageUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { FormError, TextField } from "@/components/app/fields";
import { brandingSchema } from "@/db/validation";
import { removeLogoAction, saveBrandingAction, saveLogoAction } from "@/server/actions/settings";
import { applyResult } from "@/lib/forms";
import { resizeImage } from "@/lib/images";
import type { BrandInfo } from "@/server/settings";

const SWATCHES = ["#c21d2b", "#8a1538", "#e36f1e", "#d4a017", "#2e7d32", "#00695c", "#1565c0", "#0d2c6c", "#5e35b1", "#4a4343"];

export function BrandingForm({ brand }: { brand: BrandInfo }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm({ resolver: zodResolver(brandingSchema), defaultValues: { school: brand.school ?? "", program: brand.program ?? "", short: brand.short ?? "", tagline: brand.tagline ?? "", accent: brand.accent ?? "" } });
  const accent = form.watch("accent") || "";
  const onSubmit = form.handleSubmit(async (v) => {
    if (applyResult(form, await saveBrandingAction(v))) { toast.success("Branding saved"); router.refresh(); }
  });
  async function onLogo(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const [big, icon] = await Promise.all([resizeImage(f, 512, { square: false }), resizeImage(f, 256, { square: true })]);
      const fd = new FormData(); fd.append("logo", big, "logo.png"); fd.append("icon", icon, "icon.png");
      const res = await saveLogoAction(fd);
      if (res.ok) { toast.success("Logo updated"); router.refresh(); } else toast.error(res.error);
    } catch { toast.error("That file couldn't be read as a picture. Try a PNG or JPG."); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  return (
    <Card>
      <CardHeader><CardTitle>School &amp; branding</CardTitle><CardDescription>How the program presents itself: the sign-in screen, sidebar, browser tab, printed tags and programs, and exported file names.</CardDescription></CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-2">
          <div className="grid aspect-square place-items-center overflow-hidden rounded-xl border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/branding/logo${brand.logoVersion ? `?v=${brand.logoVersion}` : ""}`} alt="Current logo" className="max-h-full max-w-full object-contain" />
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><ImageUp />{busy ? "Uploading…" : "Change the logo"}</Button>
          {brand.logoVersion && <Button variant="ghost" size="sm" onClick={async () => { await removeLogoAction(); router.refresh(); }}><RotateCcw />Use the default stage logo</Button>}
          <p className="text-xs text-muted-foreground">PNG, JPG, GIF or WEBP. A square logo looks best.</p>
        </div>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="grid content-start gap-4 sm:grid-cols-2" noValidate>
            <FormError />
            <TextField name="school" label="School name" placeholder="e.g. Lincoln High School" className="sm:col-span-2" />
            <TextField name="program" label="Theatre program name" placeholder="e.g. Lincoln Drama Club" hint="Shown as the program's name." />
            <TextField name="short" label="Short name" placeholder="e.g. LHS" maxLength={12} hint="Used in exported file names." />
            <TextField name="tagline" label="Motto or tagline" placeholder="e.g. All the world's a stage" className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <FieldLabel>Accent color</FieldLabel>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input type="color" aria-label="Accent color" value={accent || "#dca12d"} onChange={(e) => form.setValue("accent", e.target.value, { shouldDirty: true })} className="h-8 w-11 cursor-pointer rounded-md border bg-background p-0.5" />
                {SWATCHES.map((c) => <button key={c} type="button" aria-label={`Use ${c}`} onClick={() => form.setValue("accent", c, { shouldDirty: true })} className="size-6 rounded-full ring-1 ring-border ring-offset-2 ring-offset-background" style={{ background: c }} />)}
                <Button type="button" variant="ghost" size="sm" onClick={() => form.setValue("accent", "", { shouldDirty: true })}>Theme gold</Button>
              </div>
              <FieldDescription className="mt-1">Use your school colors. Saved changes recolor buttons and highlights.</FieldDescription>
            </div>
            <div><Button type="submit" disabled={form.formState.isSubmitting}>Save branding</Button></div>
          </form>
        </FormProvider>
      </CardContent>
    </Card>
  );
}
