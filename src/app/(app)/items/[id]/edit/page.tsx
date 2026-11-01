import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getItem } from "@/server/queries/items";
import { PageHeader } from "@/components/app/page-header";
import { ItemForm } from "../../item-form";

export const metadata = { title: "Edit item" };

export default function Page({ params }: PageProps<"/items/[id]/edit">) {
  return <Suspense><Content params={params} /></Suspense>;
}

async function Content({ params }: { params: PageProps<"/items/[id]/edit">["params"] }) {
  await requireUser();
  const d = await getItem(Number((await params).id) || 0);
  if (!d) notFound();
  return (
    <>
      <PageHeader eyebrow={d.item.tag} title={`Edit ${d.item.name}`} crumbs={[{ href: "/items", label: "Inventory" }, { href: `/items/${d.item.id}`, label: d.item.name }]} />
      <ItemForm item={d.item} />
    </>
  );
}
