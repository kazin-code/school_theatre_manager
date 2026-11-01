import Link from "next/link";
import { Theater } from "lucide-react";
import { Pill } from "@/components/app/bits";
import { fmtDate, plural } from "@/lib/format";
import { showFileUrl } from "@/lib/urls";
import type { ShowRow } from "@/server/queries/shows";

export const STATUS_PILL: Record<string, [string, string]> = { planning: ["Planning", "blue"], production: ["In production", "green"], past: ["Past show", "slate"] };

export function ShowCard({ s, href }: { s: ShowRow; href?: string }) {
  const [label, tone] = STATUS_PILL[s.status];
  return (
    <Link href={href ?? `/shows/${s.id}`} className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/30">
      <div className="relative grid aspect-[3/2] place-items-center overflow-hidden bg-gradient-to-br from-primary/80 to-primary/40 text-primary-foreground">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {s.cover ? <img src={showFileUrl(s.cover)} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
          : <div className="grid justify-items-center gap-1 p-4 text-center"><Theater className="size-8 opacity-80" /><span className="text-lg font-semibold leading-tight">{s.title}</span></div>}
        <Pill tone={tone} className="absolute top-2 left-2">{label}</Pill>
      </div>
      <div className="grid gap-1 p-4">
        <div className="text-lg leading-snug font-semibold">{s.title}</div>
        <div className="text-sm text-muted-foreground">{[s.type, [s.season, s.year].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div>
        {(s.openDate || s.venue) && <div className="text-sm text-muted-foreground">{[s.openDate && `Opens ${fmtDate(s.openDate)}`, s.venue].filter(Boolean).join(" · ")}</div>}
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular">
          <span>{plural(s.castCount, "cast member")}</span><span>{plural(s.crewCount, "team/crew", "team/crew")}</span>
          <span>{s.outPieces ? `${s.outPieces} pieces out` : plural(s.pieces, "piece")} used</span>
        </div>
      </div>
    </Link>
  );
}
