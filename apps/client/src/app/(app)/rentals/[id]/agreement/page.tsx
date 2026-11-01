import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getRental } from "@/server/queries/rentals";
import { getBranding } from "@/server/settings";
import { COND, fmtDate, money } from "@/lib/format";
import { PrintButton } from "../../../items/print-tags/print-button";

export const metadata = { title: "Rental agreement" };
export default function Page({ params }: PageProps<"/rentals/[id]/agreement">) { return <Suspense><Content params={params} /></Suspense>; }

async function Content({ params }: { params: PageProps<"/rentals/[id]/agreement">["params"] }) {
  await requireUser();
  const [d, b] = await Promise.all([getRental(Number((await params).id) || 0), getBranding()]);
  if (!d) notFound();
  const { rental: r, renter: p } = d;
  const value = d.lines.reduce((a, l) => a + (l.item.replacementValue ?? 0) * l.line.qty, 0);
  return (
    <div className="mx-auto max-w-3xl text-sm leading-relaxed">
      <div className="no-print mb-4"><PrintButton /></div>
      <div className="mb-4 flex items-center gap-4 border-b pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/branding/logo?v=${b.logoVersion}`} alt="" className="size-14 object-contain" />
        <div><div className="text-lg font-semibold">{b.name}</div><div className="text-muted-foreground">{b.school}</div></div>
        <div className="ml-auto text-right"><div className="text-lg font-semibold">Rental agreement</div><div>#{r.id}</div></div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div><div className="text-xs font-semibold tracking-wider uppercase">Renter</div><div className="font-medium">{p.name}</div><div>{p.organization}</div><div>{p.contactName}</div><div>{p.email}</div><div>{p.phone}</div><div className="whitespace-pre-wrap">{p.address}</div></div>
        <div><div className="text-xs font-semibold tracking-wider uppercase">Terms</div>{r.purpose && <div>For: {r.purpose}</div>}<div>Out: {fmtDate(r.dateOut)}</div><div>Due back: {fmtDate(r.dateDue)}</div><div>Fee: {money(r.fee)}</div><div>Deposit: {money(r.deposit)}</div>{value > 0 && <div>Total replacement value: {money(value)}</div>}</div>
      </div>
      <table className="mb-4 w-full border-collapse"><thead><tr className="border-b text-left text-xs uppercase"><th className="py-1">Tag</th><th>Item</th><th>Qty</th><th>Condition out</th><th>Condition in</th></tr></thead>
        <tbody>{d.lines.map(({ line: l, item: i }) => (<tr key={l.id} className="border-b align-top"><td className="py-1 font-mono">{i.tag}</td><td>{i.name}{l.notesOut && <div className="text-xs">{l.notesOut}</div>}</td><td>{l.qty}</td><td>{COND[l.conditionOut]}</td><td>{l.conditionIn ? COND[l.conditionIn] : "______________"}</td></tr>))}</tbody></table>
      <p>The renter agrees to return every item listed by the due date in the condition noted above, not to alter, cut, dye or wash items without permission, and to pay for loss or damage up to each item&apos;s replacement value.</p>
      <div className="mt-10 grid grid-cols-2 gap-10"><div className="border-t pt-1">Renter signature &amp; date</div><div className="border-t pt-1">For {b.name}</div></div>
    </div>
  );
}
