import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getShow } from "@/server/queries/shows";
import { getProgram } from "@/server/queries/programs";
import { listSponsors } from "@/server/queries/sponsors";
import { getBranding, getLists } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { docSchema, type Ctx } from "@/lib/program/model";
import { ProgramEditor } from "./program-editor";

export const metadata = { title: "Program" };
export default function Page({ params }: PageProps<"/shows/[id]/program">) { return <Suspense><Content params={params} /></Suspense>; }

async function Content({ params }: { params: PageProps<"/shows/[id]/program">["params"] }) {
  const me = await requireUser();
  const id = Number((await params).id) || 0;
  const [d, p, sponsors, brand, lists] = await Promise.all([getShow(id), getProgram(id), listSponsors(), getBranding(), getLists()]);
  if (!d) notFound();
  const s = d.show;
  const ctx: Ctx = {
    show: { id: s.id, title: s.title, type: s.type, director: s.director, venue: s.venue, openDate: s.openDate, closeDate: s.closeDate, cover: s.cover, writtenBy: s.writtenBy, bookBy: s.bookBy,
      musicBy: s.musicBy, lyricsBy: s.lyricsBy, basedOn: s.basedOn, additionalCredits: s.additionalCredits, licensor: s.licensor, licensingNotice: s.licensingNotice },
    people: d.people.map((x) => ({ kind: x.kind, name: x.name, role: x.role, voicePart: x.voicePart, grade: x.grade })),
    numbers: d.numbers.map((n) => ({ act: n.act, number: n.number, title: n.title, singers: n.singers })),
    sponsors: sponsors.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name, tier: x.tier, adSize: x.adSize, message: x.message, logo: x.logo })),
    tierOrder: lists.sponsor_tier ?? [],
    brand: { name: brand.name, school: brand.school ?? "", program: brand.program ?? "", tagline: brand.tagline ?? "", accent: brand.accent ?? "", logoVersion: brand.logoVersion ?? "0" },
  };
  const saved = docSchema.safeParse(p.doc);
  const past = s.status === "past";
  return (
    <>
      <PageHeader eyebrow="Program" title={s.title} crumbs={[{ href: past ? "/past-shows" : "/shows", label: past ? "Past shows" : "Current shows" }, { href: `/shows/${id}`, label: s.title }]} />
      <ProgramEditor showId={id} ctx={ctx} saved={saved.success ? saved.data : null} pictures={p.pictures} others={p.others} allSponsors={sponsors}
        tiers={lists.sponsor_tier ?? []} adSizes={lists.ad_size ?? []} canDelete={me.role === "director"} />
    </>
  );
}
