import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getShow } from "@/server/queries/shows";
import { listItems } from "@/server/queries/items";
import { PageHeader } from "@/components/app/page-header";
import { Checkout } from "./checkout";

export const metadata = { title: "Check out items" };
export default function Page({ params, searchParams }: PageProps<"/shows/[id]/checkout">) { return <Suspense><Content params={params} searchParams={searchParams} /></Suspense>; }

async function Content({ params, searchParams }: Pick<PageProps<"/shows/[id]/checkout">, "params" | "searchParams">) {
  await requireUser();
  const id = Number((await params).id) || 0;
  const [d, all] = await Promise.all([getShow(id), listItems()]);
  if (!d) notFound();
  if (d.show.status === "past") redirect(`/shows/${id}?tab=items`);
  const items = all.filter((i) => i.status === "active" || i.status === "repair").map((i) => ({ ...i, free: i.quantity - i.rentOut - i.showOut }));
  const cast = d.people.filter((p) => p.kind === "cast");
  return (
    <>
      <PageHeader eyebrow={d.show.title} title="Check out items" crumbs={[{ href: "/shows", label: "Current shows" }, { href: `/shows/${id}?tab=items`, label: d.show.title }]} />
      <Checkout showId={id} fromPull={(await searchParams).from === "pull"} items={items} cast={cast.map((p) => ({ name: p.name, role: p.role }))} />
    </>
  );
}
