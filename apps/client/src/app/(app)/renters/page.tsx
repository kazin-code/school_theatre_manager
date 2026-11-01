import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { listRenters } from "@/server/queries/rentals";
import { PageHeader } from "@/components/app/page-header";
import { RentersTable } from "./renters-table";

export const metadata = { title: "Renters" };
export default function Page() { return <Suspense><Content /></Suspense>; }
async function Content() {
  await requireUser();
  const rows = await listRenters();
  return (<><PageHeader eyebrow="Rentals" title="Renters" /><RentersTable rows={rows} /></>);
}
