import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { getLists } from "@/server/settings";
import { PageHeader } from "@/components/app/page-header";
import { ShowForm } from "../show-form";

export const metadata = { title: "Create a show" };
export default function Page() { return <Suspense><Content /></Suspense>; }
async function Content() {
  await requireUser();
  const l = await getLists();
  return (<><PageHeader eyebrow="Shows" title="Create a show" crumbs={[{ href: "/shows", label: "Current shows" }]} /><ShowForm types={l.show_type ?? []} seasons={l.season ?? []} /></>);
}
