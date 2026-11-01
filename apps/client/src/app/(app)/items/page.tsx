import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { listItems } from "@/server/queries/items";
import { listShows } from "@/server/queries/shows";
import { getLists } from "@/server/settings";
import { ItemsBrowser } from "./items-browser";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Inventory" };

export default function Page() {
  return <Suspense fallback={<Skeleton className="h-96 w-full" />}><Content /></Suspense>;
}

async function Content() {
  await requireUser();
  const [items, shows, lists] = await Promise.all([listItems(), listShows(), getLists()]);
  return <ItemsBrowser items={items} shows={shows.map((s) => ({ id: s.id, title: s.title, year: s.year }))} lists={lists} />;
}
