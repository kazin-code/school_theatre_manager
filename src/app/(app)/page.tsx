import { Suspense } from "react";
import Link from "next/link";
import { Box, Plus, Repeat, Theater } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { Condition, Empty, Pill, TagChip } from "@/components/app/bits";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth";
import { getBranding } from "@/server/settings";
import { dashboardStats, repairList } from "@/server/queries/items";
import { getActivity } from "@/server/queries/settings";
import { fmtWhen, money } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default function Page() {
  return <Suspense fallback={<Skeleton className="h-64 w-full" />}><Dashboard /></Suspense>;
}

function Stat({ label, value, href, sub }: { label: string; value: React.ReactNode; href: string; sub?: string }) {
  return (
    <Link href={href} className="rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Link>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const [brand, s, repairs, recent] = await Promise.all([getBranding(), dashboardStats(), repairList(), getActivity(8)]);
  return (
    <>
      <PageHeader eyebrow={brand.school || brand.name} title={`Welcome back, ${user.displayName}`} />
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/items/new" className={buttonVariants()}><Plus />Add an item</Link>
        <Link href="/items" className={buttonVariants({ variant: "outline" })}><Box />Search inventory</Link>
        <Link href="/shows/new" className={buttonVariants({ variant: "outline" })}><Theater />Create a show</Link>
        <Link href="/rentals/new" className={buttonVariants({ variant: "outline" })}><Repeat />Start a rental</Link>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Pieces" value={s.pieces.toLocaleString()} sub={`${s.records.toLocaleString()} records`} href="/items" />
        <Stat label="Out to shows" value={s.inShows} href="/shows" />
        <Stat label="On rental" value={s.onRental} href="/rentals" />
        <Stat label="Need repair" value={s.repair} href="/items" />
        <Stat label="Replacement value" value={money(s.value)} href="/items" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Repair queue</CardTitle></CardHeader><CardContent>
          {!repairs.length ? <Empty>Nothing waiting for repair.</Empty> : (
            <ul className="divide-y">{repairs.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <TagChip tag={r.tag} />
                <div className="min-w-0 flex-1"><Link href={`/items/${r.id}`} className="font-medium hover:underline">{r.name}</Link>{r.conditionNotes && <div className="truncate text-xs text-muted-foreground">{r.conditionNotes}</div>}</div>
                {r.status === "repair" ? <Pill tone="amber">In repair</Pill> : <Condition value={r.condition} />}
              </li>))}</ul>)}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Recent activity</CardTitle><CardAction><Link href="/activity" className="text-sm text-primary hover:underline">See all</Link></CardAction></CardHeader><CardContent>
          {!recent.length ? <Empty>No activity yet.</Empty> : (
            <ul className="grid gap-2 text-sm">{recent.map((a) => (
              <li key={a.id}><span>{a.details}</span><div className="text-xs text-muted-foreground">{fmtWhen(a.at)}{a.user ? ` · ${a.user}` : ""}</div></li>))}</ul>)}
        </CardContent></Card>
      </div>
    </>
  );
}
