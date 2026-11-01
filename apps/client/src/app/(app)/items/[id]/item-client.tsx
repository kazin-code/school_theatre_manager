"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ClipboardCheck, ImagePlus, MoreHorizontal, Printer, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormError, SelectField, TextAreaField } from "@/components/app/fields";
import { Thumb } from "@/components/app/bits";
import { conditionSchema } from "@stm/core/db/validation";
import { addItemPhotosAction, deleteItemAction, deleteItemPhotoAction, recordConditionAction, updateItemPhotoAction } from "@/server/actions/items";
import { applyResult } from "@/lib/forms";
import { shrinkPhoto } from "@/lib/images";
import { COND } from "@/lib/format";
import { pullList, type PullItem } from "@/lib/pull-list";
import { photoUrl } from "@/lib/urls";
import type { z } from "zod";
import type { ItemDetail } from "@/server/queries/items";

type Photo = ItemDetail["photos"][number];

export function Gallery({ itemId, name, photos }: { itemId: number; name: string; photos: Photo[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [sel, setSel] = useState(0);
  const [big, setBig] = useState(false);
  const [busy, start] = useTransition();
  const [caption, setCaption] = useState<string | null>(null);
  const cur = photos[Math.min(sel, photos.length - 1)];

  function upload(files: FileList | null) {
    if (!files?.length) return;
    start(async () => {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("photo", await shrinkPhoto(f));
      const res = await addItemPhotosAction(itemId, fd);
      if (!res.ok) toast.error(res.error); else { toast.success(files.length > 1 ? `${files.length} photos added` : "Photo added"); router.refresh(); }
      if (input.current) input.current.value = "";
    });
  }
  function change(c: Parameters<typeof updateItemPhotoAction>[1], after?: () => void) {
    start(async () => { const res = await updateItemPhotoAction(cur.id, c); if (!res.ok) toast.error(res.error); else { after?.(); router.refresh(); } });
  }
  function del() {
    start(async () => { const res = await deleteItemPhotoAction(cur.id); if (!res.ok) toast.error(res.error); else { setSel((s) => Math.max(0, s - 1)); router.refresh(); } });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Photos</CardTitle>
        <CardAction><Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><ImagePlus />{busy ? "Working…" : "Add photos"}</Button></CardAction>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => upload(e.target.files)} aria-label="Add photos" />
      </CardHeader>
      <CardContent>
        {!cur ? (
          <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
            className="grid aspect-[4/3] w-full place-items-center rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:border-foreground/30">
            <span className="grid justify-items-center gap-2"><ImagePlus className="size-8" />Drop photos here or click to choose.<span className="text-xs">Front, back, details, labels: up to 40 per item.</span></span>
          </button>
        ) : (
          <div className="grid gap-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
            <button type="button" onClick={() => setBig(true)} className="overflow-hidden rounded-xl bg-muted" aria-label="Enlarge photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(cur.file)} alt={cur.caption ?? name} className="mx-auto max-h-[460px] object-contain" />
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {caption === null
                ? <button type="button" className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground hover:text-foreground" onClick={() => setCaption(cur.caption ?? "")}>{cur.caption || "Add a caption…"}</button>
                : <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); change({ caption }, () => setCaption(null)); }}>
                    <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} autoFocus aria-label="Caption" className="h-7" /><Button size="sm" type="submit">Save</Button><Button size="sm" variant="ghost" type="button" onClick={() => setCaption(null)}>Cancel</Button></form>}
              <Button size="icon-sm" variant="ghost" disabled={busy || sel === 0} onClick={() => change({ move: "earlier" }, () => setSel(sel - 1))} aria-label="Move earlier"><ArrowLeft /></Button>
              <Button size="icon-sm" variant="ghost" disabled={busy || sel >= photos.length - 1} onClick={() => change({ move: "later" }, () => setSel(sel + 1))} aria-label="Move later"><ArrowRight /></Button>
              <Button size="sm" variant="ghost" disabled={busy || sel === 0} onClick={() => change({ main: true }, () => setSel(0))}><Star />Make main</Button>
              <Button size="icon-sm" variant="ghost" disabled={busy} onClick={del} aria-label="Delete photo"><Trash2 /></Button>
            </div>
            {photos.length > 1 && (
              <div className="flex flex-wrap gap-2">{photos.map((p, i) => (
                <button key={p.id} type="button" onClick={() => { setSel(i); setCaption(null); }} aria-label={`Photo ${i + 1}`} className={`rounded-md ring-offset-2 ring-offset-background ${i === sel ? "ring-2 ring-primary" : ""}`}>
                  <Thumb file={p.file} className="size-16" />
                </button>))}</div>
            )}
          </div>
        )}
      </CardContent>
      {big && cur && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" onClick={() => setBig(false)} role="dialog" aria-label="Photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(cur.file)} alt={cur.caption ?? name} className="max-h-full max-w-full object-contain" />
          <Button size="icon" variant="secondary" className="absolute top-4 right-4" aria-label="Close"><X /></Button>
          {cur.caption && <div className="absolute bottom-4 rounded bg-black/70 px-3 py-1 text-sm text-white">{cur.caption}</div>}
        </div>
      )}
    </Card>
  );
}

type CondIn = z.input<typeof conditionSchema>; type CondOut = z.output<typeof conditionSchema>;
export function ConditionDialog({ id, condition, status, notes }: { id: number; condition: number; status: string; notes: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<CondIn, unknown, CondOut>({ resolver: zodResolver(conditionSchema), defaultValues: { condition, status: status as CondOut["status"], notes: notes ?? "" } });
  async function onSubmit(v: CondOut) {
    const res = await recordConditionAction(id, v);
    if (!applyResult(form, res)) return;
    toast.success("Condition recorded."); setOpen(false); router.refresh();
  }
  return (
    <>
      <Button variant="outline" onClick={() => { form.reset({ condition, status: status as CondOut["status"], notes: notes ?? "" }); setOpen(true); }}><ClipboardCheck />Record condition</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
              <DialogHeader><DialogTitle>Record condition</DialogTitle><DialogDescription>Adds an entry to this item&apos;s condition history.</DialogDescription></DialogHeader>
              <FormError />
              <SelectField name="condition" label="Condition now" numeric options={[5, 4, 3, 2, 1].map((c) => [c, `${c} · ${COND[c]}`] as [number, string])} />
              <SelectField name="status" label="Status" options={[["active", "In stock"], ["repair", "Send to repair"], ["retired", "Retired"], ["lost", "Lost"]]} />
              <TextAreaField name="notes" label="Notes" placeholder="What did you notice? What was fixed?" />
              <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
            </form>
          </FormProvider>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ItemMenu({ pull, canDelete, hasHistory }: { pull: PullItem; canDelete: boolean; hasHistory: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, start] = useTransition();
  return (
    <>
      <Button onClick={() => { const ok = pullList.add(pull); toast[ok ? "success" : "info"](ok ? "Added to the pull list" : "Already on the pull list"); }}>+ Pull list</Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => window.open(`/items/print-tags?ids=${pull.id}`, "_blank")}><Printer />Print tag</DropdownMenuItem>
          {canDelete && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}><Trash2 />Delete item</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {pull.name}?</AlertDialogTitle>
            <AlertDialogDescription>{hasHistory ? "This item has show or rental history, so it can't be deleted. Set its status to Retired instead; it will be hidden from searches but its history is kept." : "This removes the item and its photos for good. To keep its history, set its status to Retired instead."}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            {!hasHistory && <AlertDialogAction variant="destructive" disabled={busy} onClick={() => start(async () => { const r = await deleteItemAction(pull.id); if (!r.ok) toast.error(r.error); else { pullList.remove(pull.id); toast.success("Item deleted."); router.push("/items"); } })}>Delete item</AlertDialogAction>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
