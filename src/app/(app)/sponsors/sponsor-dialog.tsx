"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckboxField, FormError, NumberField, SelectField, TextAreaField, TextField } from "@/components/app/fields";
import { sponsorSchema } from "@/db/validation";
import { deleteSponsorAction, saveSponsorAction } from "@/server/actions/sponsors";
import { applyResult } from "@/lib/forms";
import { resizeImage } from "@/lib/images";
import { sponsorUrl } from "@/lib/urls";
import type { Sponsor } from "@/db/schema";

type In = z.input<typeof sponsorSchema>; type Out = z.output<typeof sponsorSchema>;
const KEYS = ["name", "tier", "adSize", "message", "website", "contactName", "email", "phone", "amount", "notes", "active"] as const;

export function SponsorDialog({ open, sponsor, tiers, adSizes, canDelete, onClose }: { open: boolean; sponsor?: Sponsor | null; tiers: string[]; adSizes: string[]; canDelete?: boolean; onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const blank: In = { name: "", tier: tiers[0] ?? "", adSize: adSizes.includes("Quarter page") ? "Quarter page" : adSizes[0] ?? "", message: "", website: "", contactName: "", email: "", phone: "", amount: "", notes: "", active: true };
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(sponsorSchema), values: sponsor ? (Object.fromEntries(KEYS.map((k) => [k, sponsor[k] ?? (k === "active" ? false : "")])) as In) : blank });
  // start each opening of the dialog without a picture picked
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) { setLogo(null); setPreview(null); setRemoveLogo(false); } }
  const current = preview ?? (!removeLogo && sponsor?.logo ? sponsorUrl(sponsor.logo) : null);

  async function onSubmit(v: Out) {
    const fd = new FormData();
    fd.append("data", JSON.stringify(v));
    if (logo) { try { fd.append("logo", new File([await resizeImage(logo, 2400, { type: logo.type === "image/png" ? "image/png" : "image/jpeg", quality: 0.9 })], logo.type === "image/png" ? "logo.png" : "logo.jpg", { type: logo.type === "image/png" ? "image/png" : "image/jpeg" })); } catch { fd.append("logo", logo); } }
    else if (removeLogo) fd.append("removeLogo", "1");
    const r = await saveSponsorAction(sponsor?.id ?? null, fd);
    if (!applyResult(form, r)) return;
    toast.success("Sponsor saved."); onClose(); router.refresh();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <DialogHeader><DialogTitle>{sponsor ? `Edit ${sponsor.name}` : "Add a sponsor"}</DialogTitle><DialogDescription>A business with a logo or ad, or a family sending a message to the cast.</DialogDescription></DialogHeader>
            <FormError />
            <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
              <div className="grid content-start gap-2">
                <button type="button" onClick={() => input.current?.click()} className="grid aspect-square place-items-center overflow-hidden rounded-lg border border-dashed bg-muted/40 text-xs text-muted-foreground hover:border-foreground/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {current ? <img src={current} alt="" className="max-h-full max-w-full object-contain" /> : <span className="grid justify-items-center gap-1 p-2 text-center"><ImagePlus className="size-6" />Logo or ad</span>}
                </button>
                <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden aria-label="Logo or ad" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setLogo(f); setPreview(URL.createObjectURL(f)); setRemoveLogo(false); } }} />
                {current && <Button type="button" size="sm" variant="ghost" onClick={() => { setLogo(null); setPreview(null); setRemoveLogo(true); }}><Trash2 />Remove picture</Button>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="name" label="Name" autoFocus placeholder="e.g. Main Street Bakery or The Lopez Family" className="sm:col-span-2" />
                <TextField name="tier" label="Tier" list="sponsor_tier" />
                <SelectField name="adSize" label="Ad size" options={[...new Set([...adSizes, String(sponsor?.adSize ?? "")])].filter(Boolean)} hint="Name listings print as text only." />
                <TextField name="message" label="Message (optional)" placeholder="e.g. Break a leg, Emma! Love, Mom & Dad" className="sm:col-span-2" />
                <NumberField name="amount" label="Amount ($)" step={0.01} />
                <TextField name="website" label="Website" />
                <TextField name="contactName" label="Contact" />
                <TextField name="email" label="Email" type="email" />
                <TextField name="phone" label="Phone" type="tel" />
                <CheckboxField name="active" label="Show in programs" className="self-end" />
                <TextAreaField name="notes" label="Notes" rows={2} placeholder="e.g. Paid by check #1043; renew each fall" className="sm:col-span-2" />
              </div>
            </div>
            <DialogFooter className="sm:justify-between">
              {sponsor && canDelete ? <Button type="button" variant="ghost" className="text-destructive" onClick={async () => { const r = await deleteSponsorAction(sponsor.id); if (!r.ok) toast.error(r.error); else { toast.success("Sponsor deleted."); onClose(); router.refresh(); } }}><Trash2 />Delete sponsor</Button> : <span />}
              <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Saving…" : "Save sponsor"}</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
