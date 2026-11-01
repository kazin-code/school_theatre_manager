import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { getActivity } from "@/server/queries/settings";
import { PageHeader } from "@/components/app/page-header";
import { ActivityTable } from "./activity-table";

export const metadata = { title: "Activity log" };
export default function Page() { return <Suspense><Content /></Suspense>; }

async function Content() {
  await requireUser();
  const rows = await getActivity(1000);
  return (<><PageHeader eyebrow="Records" title="Activity log" /><p className="mb-4 text-sm text-muted-foreground">Every change made in the app, newest first (last 1,000 entries).</p><ActivityTable rows={rows} /></>);
}
