"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { saveListAction } from "@/server/actions/settings";

export function ListsPanel({ lists, labels }: { lists: Record<string, string[]>; labels: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  return (
    <Card>
      <CardHeader><CardTitle>Dropdown lists</CardTitle><CardDescription>Suggestions offered on forms and the choices in search filters. Add any positions or categories your program needs; people can always type a one-off value too.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {Object.entries(labels).map(([k, label]) => (
          <Button key={k} variant="outline" size="sm" onClick={() => { setOpen(k); setText((lists[k] || []).join("\n")); }}>
            {label} <span className="text-muted-foreground">({(lists[k] || []).length})</span>
          </Button>
        ))}
      </CardContent>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{open ? labels[open] : ""}</DialogTitle><DialogDescription>One per line, in the order you want them shown.</DialogDescription></DialogHeader>
          <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} aria-label="List values" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
            <Button onClick={async () => { const res = await saveListAction(open!, text.split("\n")); if (res.ok) { toast.success("List saved"); setOpen(null); router.refresh(); } else toast.error(res.error); }}>Save list</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
