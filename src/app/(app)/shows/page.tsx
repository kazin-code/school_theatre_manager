import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listShows } from "@/server/queries/shows";
import { PageHeader } from "@/components/app/page-header";
import { Empty } from "@/components/app/bits";
import { buttonVariants } from "@/components/ui/button";
import { ShowCard } from "./show-card";

export const metadata = { title: "Current shows" };

export default function Page({ searchParams }: PageProps<"/shows">) {
  return <Suspense><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: PageProps<"/shows">["searchParams"] }) {
  await requireUser();
  const picking = (await searchParams).checkout === "pull";
  const list = (await listShows()).filter((s) => s.status !== "past");
  return (
    <>
      <PageHeader eyebrow="Shows" title={picking ? "Which show is this for?" : "Current shows"} actions={<Link href="/shows/new" className={buttonVariants()}><Plus />Create a show</Link>} />
      {picking && <p className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">Choose the show to check your pull list out to. You can set characters and actors on the next screen.</p>}
      {!list.length ? <Empty>No current shows. <Link href="/shows/new" className="font-medium text-primary underline">Create one</Link> to start planning cast, crew, costumes and props.</Empty> : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {list.map((s) => <ShowCard key={s.id} s={s} href={picking ? `/shows/${s.id}/checkout?from=pull` : undefined} />)}
        </div>
      )}
      {!picking && <p className="mt-6 text-sm text-muted-foreground">Finished productions live in <Link href="/past-shows" className="text-primary underline">Past shows</Link>, with everything that was used.</p>}
    </>
  );
}
