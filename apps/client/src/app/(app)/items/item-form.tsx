"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxField, FormError, NumberField, SelectField, TextAreaField, TextField } from "@/components/app/fields";
import { itemSchema, type ItemInput, type ItemValues } from "@stm/core/db/validation";
import { saveItemAction } from "@/server/actions/items";
import { applyResult } from "@/lib/forms";
import { COND } from "@/lib/format";
import type { Item } from "@stm/core/db/schema";

const BLANK: ItemInput = {
  tag: "", name: "", category: "", subcategory: "", description: "", era: "", gender: "", size: "",
  chest: "", waist: "", hips: "", inseam: "", neck: "", sleeve: "", head: "", shoeSize: "", color: "", material: "", pattern: "",
  quantity: 1, condition: 4, conditionNotes: "", location: "", acquiredDate: "", acquiredFrom: "", cost: "", replacementValue: "", rentalRate: "",
  rentable: true, status: "active", keywords: "", notes: "",
};

function toForm(it: Item, copy: boolean): ItemInput {
  const out: Record<string, unknown> = { ...BLANK };
  for (const k of Object.keys(BLANK)) { const v = (it as Record<string, unknown>)[k]; out[k] = v == null ? (BLANK as Record<string, unknown>)[k] : v; }
  if (copy) { out.tag = ""; out.name = `${it.name} (copy)`; }
  return out as ItemInput;
}

export function ItemForm({ item, copy = false }: { item?: Item; copy?: boolean }) {
  const router = useRouter();
  const editing = !!item && !copy;
  const form = useForm<ItemInput, unknown, ItemValues>({ resolver: zodResolver(itemSchema), defaultValues: item ? toForm(item, copy) : BLANK });

  async function onSubmit(v: ItemValues) {
    const res = await saveItemAction(editing ? item!.id : null, v);
    if (!applyResult(form, res)) return;
    toast.success(editing ? "Saved." : "Item added.");
    router.push(`/items/${res.data.id}${editing ? "" : "?added=1"}`);
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-4xl gap-5" noValidate>
        <FormError />
        <Card>
          <CardHeader><CardTitle>What is it?</CardTitle><CardDescription>Only the name is required. Fields suggest values from your dropdown lists, but you can type anything.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField name="name" label="Name" placeholder="e.g. Blue Victorian ball gown" className="sm:col-span-2" autoFocus={!editing} />
            <TextField name="category" label="Category" list="category" placeholder="Costume, Prop, Furniture…" />
            <TextField name="subcategory" label="Type" list="subcategory" placeholder="Dress, Hat, Chair…" />
            <TextField name="tag" label="Tag number" placeholder="Leave blank to assign one" hint="Printed on the item's label, like COS-0042." />
            <NumberField name="quantity" label="How many" min={1} step={1} hint="Identical pieces tracked together." />
            <TextAreaField name="description" label="Description" className="sm:col-span-2" />
            <TextField name="keywords" label="Search keywords" placeholder="ruffles, royalty, Cinderella…" className="sm:col-span-2" hint="Extra words people might search for." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Look &amp; period</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <TextField name="era" label="Era / period" list="era" />
            <TextField name="gender" label="Gender" list="gender" />
            <TextField name="color" label="Color(s)" list="color" />
            <TextField name="material" label="Material" list="material" />
            <TextField name="pattern" label="Pattern / details" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Size &amp; measurements</CardTitle><CardDescription>In inches. Leave blank if it doesn&apos;t apply.</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <TextField name="size" label="Size" list="size" />
            <TextField name="shoeSize" label="Shoe size" />
            <NumberField name="chest" label="Chest / bust" step={0.25} />
            <NumberField name="waist" label="Waist" step={0.25} />
            <NumberField name="hips" label="Hips" step={0.25} />
            <NumberField name="inseam" label="Inseam" step={0.25} />
            <NumberField name="neck" label="Neck" step={0.25} />
            <NumberField name="sleeve" label="Sleeve" step={0.25} />
            <NumberField name="head" label="Head" step={0.25} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Condition &amp; storage</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <SelectField name="condition" label="Condition" numeric options={[5, 4, 3, 2, 1].map((c) => [c, `${c} · ${COND[c]}`] as [number, string])} />
            <SelectField name="status" label="Status" options={[["active", "In stock"], ["repair", "In repair"], ["retired", "Retired"], ["lost", "Lost"]]} />
            <TextField name="location" label="Storage location" list="location" placeholder="Costume loft, rack B…" />
            <TextAreaField name="conditionNotes" label="Condition notes" rows={2} className="sm:col-span-3" placeholder="Small tear on left sleeve…" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Value &amp; rentals</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <TextField name="acquiredDate" label="Acquired" type="date" />
            <TextField name="acquiredFrom" label="Acquired from" placeholder="Donated by…, bought at…" className="sm:col-span-2" />
            <NumberField name="cost" label="Cost ($)" step={0.01} />
            <NumberField name="replacementValue" label="Replacement value ($)" step={0.01} />
            <NumberField name="rentalRate" label="Rental rate ($)" step={0.01} hint="Per rental, for outside groups." />
            <CheckboxField name="rentable" label="Can be rented to outside groups" className="sm:col-span-3" />
            <TextAreaField name="notes" label="Private notes" className="sm:col-span-3" />
          </CardContent>
        </Card>
        <div className="sticky bottom-0 z-10 -mx-1 flex gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
          <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Saving…" : editing ? "Save changes" : "Add to inventory"}</Button>
          <Link href={item ? `/items/${item.id}` : "/items"} className={buttonVariants({ variant: "ghost" })}>Cancel</Link>
          {!editing && <span className="ml-auto self-center text-sm text-muted-foreground">You can add photos on the next screen.</span>}
        </div>
      </form>
    </FormProvider>
  );
}
