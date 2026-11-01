import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getShow } from "@/server/queries/shows";
import { getLists } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { ShowForm } from "../../show-form";

export const metadata = { title: "Edit show" };
export default function Page({ params }: PageProps<"/shows/[id]/edit">) { return <Suspense><Content params={params} /></Suspense>; }
async function Content({ params }: { params: PageProps<"/shows/[id]/edit">["params"] }) {
  await requireUser();
  const [d, l] = await Promise.all([getShow(Number((await params).id) || 0), getLists()]);
  if (!d) notFound();
  return (<><PageHeader eyebrow="Shows" title={`Edit ${d.show.title}`} crumbs={[{ href: d.show.status === "past" ? "/past-shows" : "/shows", label: d.show.status === "past" ? "Past shows" : "Current shows" }, { href: `/shows/${d.show.id}`, label: d.show.title }]} />
    <ShowForm show={d.show} types={l.show_type ?? []} seasons={l.season ?? []} /></>);
}
