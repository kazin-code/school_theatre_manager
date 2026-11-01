import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { listItems } from "@/server/queries/items";
import { listRenters } from "@/server/queries/rentals";
import { PageHeader } from "@/components/app/page-header";
import { NewRental } from "./new-rental";

export const metadata = { title: "Start a rental" };
export default function Page({ searchParams }: PageProps<"/rentals/new">) { return <Suspense><Content searchParams={searchParams} /></Suspense>; }
async function Content({ searchParams }: { searchParams: PageProps<"/rentals/new">["searchParams"] }) {
  await requireUser();
  const sp = await searchParams;
  const [all, renters] = await Promise.all([listItems(), listRenters()]);
  const items = all.filter((i) => i.status === "active").map((i) => ({ ...i, free: i.quantity - i.rentOut - i.showOut }));
  return (
    <>
      <PageHeader eyebrow="Rentals" title="Start a rental" crumbs={[{ href: "/rentals", label: "Rentals" }]} />
      <NewRental items={items} renters={renters.map((r) => ({ id: r.id, name: r.name, organization: r.organization, approved: r.approved, avgRating: r.avgRating, openCount: r.openCount }))}
        renterId={Number(sp.renter) || null} fromPull={sp.from === "pull"} />
    </>
  );
}
