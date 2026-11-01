import { PageHeader } from "@/components/app/page-header";
import { PullListView } from "./pull-list-view";
export const metadata = { title: "Pull list" };
export default function Page() {
  return (<><PageHeader eyebrow="Inventory" title="Pull list" /><PullListView /></>);
}
