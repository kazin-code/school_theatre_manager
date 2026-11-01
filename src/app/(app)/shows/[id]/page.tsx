import Link from "next/link";
import { Fragment, Suspense } from "react";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Pencil, ShoppingBag } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getShow } from "@/server/queries/shows";
import { getLists } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { Pill } from "@/components/app/bits";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate } from "@/lib/format";
import { STATUS_PILL } from "../show-card";
import { CoverPicker, ShowMenu } from "./show-actions";
import { PeoplePanel } from "./people-panel";
import { NumbersPanel } from "./numbers-panel";
import { LinesPanel } from "./lines-panel";
import { FilesPanel, PhotosPanel } from "./files-panel";

export default function Page({ params, searchParams }: PageProps<"/shows/[id]">) {
  return <Suspense><Content params={params} searchParams={searchParams} /></Suspense>;
}

async function Content({ params, searchParams }: Pick<PageProps<"/shows/[id]">, "params" | "searchParams">) {
  const me = await requireUser();
  const [d, lists] = await Promise.all([getShow(Number((await params).id) || 0), getLists()]);
  if (!d) notFound();
  const tab = String((await searchParams).tab ?? "overview");
  const { show: s } = d;
  const musical = /musical|revue|opera/i.test(s.type) || d.numbers.length > 0;
  const [label, tone] = STATUS_PILL[s.status];
  const credits: [string, string | null][] = [["Written by", s.writtenBy], ["Book by", s.bookBy], ["Music by", s.musicBy], ["Lyrics by", s.lyricsBy], ["Based on", s.basedOn]];
  const past = s.status === "past";
  return (
    <>
      <PageHeader eyebrow={<span className="flex items-center gap-2">{s.type}<Pill tone={tone} className="tracking-normal normal-case">{label}</Pill></span>} title={s.title}
        crumbs={[{ href: past ? "/past-shows" : "/shows", label: past ? "Past shows" : "Current shows" }]}
        actions={<>
          {!past && <Link href={`/shows/${s.id}/checkout`} className={buttonVariants()}><ShoppingBag />Check out items</Link>}
          <Link href={`/shows/${s.id}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil />Edit</Link>
          <ShowMenu id={s.id} title={s.title} status={s.status} outLines={d.lines.filter((l) => !l.line.dateReturned).length} canDelete={me.role === "director"} />
        </>}>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {(s.season || s.year) && <span>{[s.season, s.year].filter(Boolean).join(" ")}</span>}
          {s.openDate && <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{fmtDate(s.openDate)}{s.closeDate && s.closeDate !== s.openDate ? ` – ${fmtDate(s.closeDate)}` : ""}</span>}
          {s.venue && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{s.venue}</span>}
          {s.director && <span>Directed by {s.director}</span>}
        </div>
      </PageHeader>

      <Tabs defaultValue={tab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="people">Cast &amp; crew <span className="text-muted-foreground tabular">{d.people.length || ""}</span></TabsTrigger>
          {musical && <TabsTrigger value="numbers">Musical numbers <span className="text-muted-foreground tabular">{d.numbers.length || ""}</span></TabsTrigger>}
          <TabsTrigger value="items">Costumes &amp; props <span className="text-muted-foreground tabular">{d.lines.length || ""}</span></TabsTrigger>
          <TabsTrigger value="materials">Materials <span className="text-muted-foreground tabular">{s.materialCount || ""}</span></TabsTrigger>
          <TabsTrigger value="photos">Photos <span className="text-muted-foreground tabular">{s.photoCount || ""}</span></TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <CoverPicker showId={s.id} cover={s.cover} title={s.title} />
            <div className="grid gap-5">
              <Card><CardHeader><CardTitle>Authors &amp; rights</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm">
                {credits.some(([, v]) => v) || s.licensor || s.additionalCredits ? (
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
                    {credits.filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></Fragment>)}
                    {s.licensor && <><dt className="text-muted-foreground">Licensed by</dt><dd>{s.licensor}</dd></>}
                  </dl>) : <p className="text-muted-foreground">Not filled in yet. <Link href={`/shows/${s.id}/edit`} className="text-primary underline">Add the authors</Link> so they print in the program.</p>}
                {s.additionalCredits && <p className="whitespace-pre-wrap">{s.additionalCredits}</p>}
                {s.licensingNotice && <p className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{s.licensingNotice}</p>}
              </CardContent></Card>
              <Card><CardHeader><CardTitle>At a glance</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3 text-center">
                {[["Cast", s.castCount], ["Team & crew", s.crewCount], ["Pieces used", s.pieces], ["Still out", s.outPieces], ["Materials", s.materialCount], ["Photos", s.photoCount]].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg border p-3"><div className="text-2xl font-semibold tabular">{v}</div><div className="text-xs text-muted-foreground">{k}</div></div>))}
              </CardContent></Card>
              {s.notes && <Card><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-wrap">{s.notes}</CardContent></Card>}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="people"><PeoplePanel showId={s.id} people={d.people} musical={musical} lists={lists} /></TabsContent>
        {musical && <TabsContent value="numbers"><NumbersPanel showId={s.id} numbers={d.numbers} /></TabsContent>}
        <TabsContent value="items"><LinesPanel showId={s.id} title={s.title} past={past} lines={d.lines} /></TabsContent>
        <TabsContent value="materials"><FilesPanel showId={s.id} files={d.files.filter((f) => f.kind === "material")} categories={lists.material_type ?? []} /></TabsContent>
        <TabsContent value="photos"><PhotosPanel showId={s.id} photos={d.files.filter((f) => f.kind === "photo")} /></TabsContent>
      </Tabs>
    </>
  );
}
