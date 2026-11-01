import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getShow } from "@/server/queries/shows";
import { getBranding } from "@/server/settings";
import { COND, fmtDate } from "@/lib/format";
import { PrintButton } from "../../../items/print-tags/print-button";

export const metadata = { title: "Costume & prop list" };
export default function Page({ params }: PageProps<"/shows/[id]/pull-sheet">) { return <Suspense><Content params={params} /></Suspense>; }

async function Content({ params }: { params: PageProps<"/shows/[id]/pull-sheet">["params"] }) {
  await requireUser();
  const [d, b] = await Promise.all([getShow(Number((await params).id) || 0), getBranding()]);
  if (!d) notFound();
  const groups = new Map<string, typeof d.lines>();
  for (const l of d.lines) { const k = l.line.character || "Not assigned to a character"; groups.set(k, [...(groups.get(k) ?? []), l]); }
  return (
    <div className="mx-auto max-w-4xl text-sm">
      <div className="no-print mb-4"><PrintButton /></div>
      <div className="mb-4 border-b pb-2"><div className="text-xs tracking-widest uppercase">{b.name}</div><h1 className="text-2xl font-semibold">{d.show.title}: costumes, props &amp; set pieces</h1>
        <div className="text-muted-foreground">{d.lines.length} lines · printed {fmtDate(new Date().toISOString().slice(0, 10))}</div></div>
      {[...groups].map(([g, ls]) => (
        <section key={g} className="mb-4 break-inside-avoid"><h2 className="mb-1 font-semibold">{g}</h2>
          <table className="w-full border-collapse"><tbody>{ls.map(({ line: l, item: i }) => (
            <tr key={l.id} className="border-t align-top"><td className="w-5 py-1">☐</td><td className="w-24 py-1 font-mono">{i.tag}</td><td className="py-1">{i.name}{l.qty > 1 ? ` × ${l.qty}` : ""}<div className="text-xs text-muted-foreground">{[l.actor, l.scene, i.size && `Size ${i.size}`, i.location && `from ${i.location}`].filter(Boolean).join(" · ")}</div></td>
              <td className="w-32 py-1 text-right text-xs">{l.dateReturned ? `Returned ${fmtDate(l.dateReturned)}` : `Out · ${COND[l.conditionOut]}`}</td></tr>))}</tbody></table></section>))}
    </div>
  );
}
