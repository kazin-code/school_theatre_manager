"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Archive, ImagePlus, MoreHorizontal, RotateCcw, Trash2, Theater, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteShowAction, removeCoverAction, setCoverAction, setShowStatusAction } from "@/server/actions/shows";
import { resizeImage } from "@/lib/images";
import { showFileUrl } from "@/lib/urls";

export function CoverPicker({ showId, cover, title }: { showId: number; cover: string | null; title: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  function pick(f?: File) {
    if (!f) return;
    start(async () => {
      const fd = new FormData();
      try { fd.append("cover", new File([await resizeImage(f, 2000, { type: "image/jpeg", quality: 0.88 })], "cover.jpg", { type: "image/jpeg" })); }
      catch { toast.error("That file isn't a picture this computer can read. Try a JPG or PNG."); return; }
      const r = await setCoverAction(showId, fd);
      if (!r.ok) toast.error(r.error); else { toast.success("Cover updated."); router.refresh(); }
      if (input.current) input.current.value = "";
    });
  }
  return (
    <Card>
      <CardHeader><CardTitle>Cover picture</CardTitle>
        <CardAction className="flex gap-1">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><ImagePlus />{busy ? "Uploading…" : cover ? "Change" : "Add cover"}</Button>
          {cover && <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(async () => { const r = await removeCoverAction(showId); if (!r.ok) toast.error(r.error); router.refresh(); })}><X />Remove</Button>}
        </CardAction>
      </CardHeader>
      <CardContent>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} aria-label="Cover picture" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover ? <img src={showFileUrl(cover)} alt={`${title} cover`} className="w-full rounded-lg object-cover" />
          : <button type="button" onClick={() => input.current?.click()} className="grid aspect-[3/2] w-full place-items-center rounded-lg border-2 border-dashed text-sm text-muted-foreground hover:border-foreground/30">
              <span className="grid justify-items-center gap-2"><Theater className="size-8" />The show&apos;s poster or key art.<span className="text-xs">Shown on the show list and the program cover.</span></span></button>}
      </CardContent>
    </Card>
  );
}

export function ShowMenu({ id, title, status, outLines, canDelete }: { id: number; title: string; status: string; outLines: number; canDelete: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [archive, setArchive] = useState(false);
  const [del, setDel] = useState(false);
  const [typed, setTyped] = useState("");
  const move = (to: "planning" | "production" | "past", returnAll = false) => start(async () => {
    const r = await setShowStatusAction(id, to, returnAll);
    if (!r.ok) { toast.error(r.error); return; }
    setArchive(false);
    toast.success(to === "past" ? "Moved to past shows." : to === "production" ? (status === "past" ? "Show reopened." : "Show is in production.") : "Back to planning.");
    router.refresh();
  });
  return (
    <>
      {status === "past" ? <Button variant="outline" disabled={busy} onClick={() => move("production")}><RotateCcw />Reopen</Button>
        : <Button variant="outline" disabled={busy} onClick={() => (outLines ? setArchive(true) : move("past"))}><Archive />Move to past shows</Button>}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More show actions" />}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status !== "planning" && <DropdownMenuItem onClick={() => move("planning")}>Move back to planning</DropdownMenuItem>}
          {status === "planning" && <DropdownMenuItem onClick={() => move("production")}>Mark as in production</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => window.open(`/shows/${id}/pull-sheet`, "_blank")}>Print costume &amp; prop list</DropdownMenuItem>
          {canDelete && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => { setTyped(""); setDel(true); }}><Trash2 />Delete show…</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={archive} onOpenChange={setArchive}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Some items are still checked out</AlertDialogTitle>
            <AlertDialogDescription>{outLines} line{outLines === 1 ? " is" : "s are"} still out to {title}. Return them one by one on the Costumes &amp; props tab to record their condition, or return everything now as-is.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Not yet</AlertDialogCancel><Button disabled={busy} onClick={() => move("past", true)}>Return everything &amp; move</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={del} onOpenChange={setDel}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {title}?</AlertDialogTitle>
            <AlertDialogDescription>For a cancelled show. This removes its cast and crew, numbers, materials, photos and the record of what was checked out; items still out go back on the shelf. A safety copy of the database is saved first, and its files go to the recycle folder. To keep a finished show, move it to past shows instead.</AlertDialogDescription></AlertDialogHeader>
          <label className="grid gap-1.5 text-sm">Type <b>{title}</b> to confirm<Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label="Show title" /></label>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={busy || typed.trim().toLowerCase() !== title.trim().toLowerCase()} onClick={() => start(async () => {
              const r = await deleteShowAction(id, typed); if (!r.ok) { toast.error(r.error); return; } toast.success("Show deleted."); router.push("/shows"); })}>Delete show</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
