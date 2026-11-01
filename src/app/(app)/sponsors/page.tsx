import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { listSponsors } from "@/server/queries/sponsors";
import { getLists } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { SponsorsTable } from "./sponsors-table";

export const metadata = { title: "Sponsors" };
export default function Page() { return <Suspense><Content /></Suspense>; }
async function Content() {
  const me = await requireUser();
  const [rows, lists] = await Promise.all([listSponsors(), getLists()]);
  return (<><PageHeader eyebrow="Programs" title="Sponsors" /><SponsorsTable rows={rows} tiers={lists.sponsor_tier ?? []} adSizes={lists.ad_size ?? []} canDelete={me.role === "director"} /></>);
}
