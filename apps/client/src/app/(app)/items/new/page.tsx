import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getItem } from "@/server/queries/items";
import { PageHeader } from "@/components/app/page-header";
import { ItemForm } from "../item-form";

export const metadata = { title: "Add an item" };

export default function Page({ searchParams }: PageProps<"/items/new">) {
  return <Suspense><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: PageProps<"/items/new">["searchParams"] }) {
  await requireUser();
  const copy = Number((await searchParams).copy) || 0;
  const src = copy ? await getItem(copy) : null;
  if (copy && !src) notFound();
  return (
    <>
      <PageHeader eyebrow="Inventory" title={src ? `Copy of ${src.item.name}` : "Add an item"} crumbs={[{ href: "/items", label: "Inventory" }]} />
      <ItemForm item={src?.item} copy={!!src} />
    </>
  );
}
