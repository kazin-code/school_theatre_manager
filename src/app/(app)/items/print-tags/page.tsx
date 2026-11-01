import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { listItems } from "@/server/queries/items";
import { getBranding } from "@/server/settings";
import { PrintButton } from "./print-button";

export const metadata = { title: "Print tags" };

export default function Page({ searchParams }: PageProps<"/items/print-tags">) {
  return <Suspense><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: PageProps<"/items/print-tags">["searchParams"] }) {
  await requireUser();
  const ids = new Set(String((await searchParams).ids ?? "").split(",").map(Number).filter(Boolean));
  const [all, b] = await Promise.all([listItems(), getBranding()]);
  const list = all.filter((i) => ids.has(i.id));
  return (
    <div>
      <div className="no-print mb-4 flex items-center gap-3"><h1 className="text-xl font-semibold">Print {list.length} tag{list.length === 1 ? "" : "s"}</h1><PrintButton /></div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.6in,1fr))] gap-3 print:gap-2">
        {list.map((i) => (
          <div key={i.id} className="break-inside-avoid rounded-lg border-2 border-dashed border-foreground/40 p-3 print:border-black">
            <div className="text-[10px] tracking-widest uppercase">{b.name}</div>
            <div className="font-mono text-2xl font-bold">{i.tag}</div>
            <div className="text-sm font-medium">{i.name}</div>
            <div className="text-xs">{[i.category, i.size && `Size ${i.size}`, i.location].filter(Boolean).join(" · ")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
