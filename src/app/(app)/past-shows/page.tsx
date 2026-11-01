import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { listShows } from "@/server/queries/shows";
import { PageHeader } from "@/components/app/page-header";
import { PastShows } from "./past-shows";

export const metadata = { title: "Past shows" };
export default function Page() { return <Suspense><Content /></Suspense>; }

async function Content() {
  await requireUser();
  const list = (await listShows()).filter((s) => s.status === "past");
  return (<><PageHeader eyebrow="Shows" title="Past shows" /><PastShows shows={list} /></>);
}
