"use client";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckboxField, FormError, TextAreaField, TextField } from "@/components/app/fields";
import { renterSchema } from "@/db/validation";
import { saveRenterAction } from "@/server/actions/rentals";
import { applyResult } from "@/lib/forms";
import type { Renter } from "@/db/schema";

type In = z.input<typeof renterSchema>; type Out = z.output<typeof renterSchema>;
const BLANK: In = { name: "", organization: "", contactName: "", email: "", phone: "", address: "", approved: true, notes: "" };

export function RenterDialog({ open, renter, onClose, onSaved }: { open: boolean; renter?: Renter; onClose: () => void; onSaved?: (id: number) => void }) {
  const router = useRouter();
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(renterSchema), values: renter ? (Object.fromEntries(Object.keys(BLANK).map((k) => [k, renter[k as keyof Renter] ?? (k === "approved" ? false : "")])) as In) : BLANK });
  async function onSubmit(v: Out) {
    const r = await saveRenterAction(renter?.id ?? null, v);
    if (!applyResult(form, r)) return;
    toast.success(renter ? "Saved." : `Added ${v.name}.`);
    onClose(); form.reset(BLANK); router.refresh(); onSaved?.(r.data.id);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <DialogHeader><DialogTitle>{renter ? `Edit ${renter.name}` : "Add a renter"}</DialogTitle><DialogDescription>Another school, a community theatre, or a person who borrows from your stock.</DialogDescription></DialogHeader>
            <FormError />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="name" label="Name" autoFocus placeholder="e.g. Riverside Middle School" className="sm:col-span-2" />
              <TextField name="organization" label="Organization" />
              <TextField name="contactName" label="Contact person" />
              <TextField name="email" label="Email" type="email" />
              <TextField name="phone" label="Phone" type="tel" />
              <TextAreaField name="address" label="Address" rows={2} className="sm:col-span-2" />
              <CheckboxField name="approved" label="Approved to rent" className="sm:col-span-2" />
              <TextAreaField name="notes" label="Notes" rows={2} className="sm:col-span-2" />
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>{renter ? "Save" : "Add renter"}</Button></DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
