"use client";
import Link from "next/link";
import { Printer, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, TagChip, Thumb } from "@/components/app/bits";
import { usePullList } from "@/lib/pull-list";

export function PullListView() {
  const pull = usePullList();
  if (!pull.items.length) return <Empty>Your pull list is empty. While browsing the <Link href="/items" className="font-medium text-primary underline">inventory</Link>, click <b>+ Pull</b> on anything you want to set aside, then check it all out to a show or a rental at once.</Empty>;
  const ids = pull.items.map((p) => p.id).join(",");
  return (
    <div className="grid max-w-3xl gap-4">
      <p className="text-sm text-muted-foreground">Items you&apos;ve set aside on this computer. Check them out to a show or rental in one step, or print their tags.</p>
      <ul className="divide-y rounded-xl border bg-card">
        {pull.items.map((p) => (
          <li key={p.id} className="flex items-center gap-3 p-3">
            <Thumb file={p.photo} />
            <div className="min-w-0 flex-1"><Link href={`/items/${p.id}`} className="font-medium hover:underline">{p.name}</Link><div className="flex items-center gap-2 text-xs text-muted-foreground"><TagChip tag={p.tag} />{[p.category, p.size && `Size ${p.size}`].filter(Boolean).join(" · ")}</div></div>
            {p.max > 1 && <label className="flex items-center gap-1.5 text-sm">Qty<Input type="number" min={1} max={p.max} value={p.qty} onChange={(e) => pull.setQty(p.id, Number(e.target.value) || 1)} className="h-7 w-16" /><span className="text-muted-foreground">of {p.max}</span></label>}
            <Button size="icon-sm" variant="ghost" onClick={() => pull.remove(p.id)} aria-label={`Remove ${p.name}`}><X /></Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Link href="/shows?checkout=pull" className={buttonVariants()}>Check out to a show…</Link>
        <Link href="/rentals/new?from=pull" className={buttonVariants({ variant: "outline" })}>Start a rental…</Link>
        <a href={`/items/print-tags?ids=${ids}`} target="_blank" className={buttonVariants({ variant: "outline" })}><Printer />Print tags</a>
        <Button variant="ghost" className="ml-auto" onClick={() => pull.clear()}><Trash2 />Clear list</Button>
      </div>
    </div>
  );
}
