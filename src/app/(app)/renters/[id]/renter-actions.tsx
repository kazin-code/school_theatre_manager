"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteRenterAction } from "@/server/actions/rentals";
import type { Renter } from "@/db/schema";
import { RenterDialog } from "../renter-dialog";

export function RenterActions({ renter, canDelete }: { renter: Renter; canDelete: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Pencil />Edit</Button>
      {canDelete && <Button variant="ghost" disabled={busy} onClick={() => start(async () => { const r = await deleteRenterAction(renter.id); if (!r.ok) toast.error(r.error); else { toast.success("Renter deleted."); router.push("/renters"); } })}><Trash2 />Delete</Button>}
      <RenterDialog open={open} renter={renter} onClose={() => setOpen(false)} />
    </>
  );
}
