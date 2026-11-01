import { Suspense } from "react";
import Link from "next/link";
import { Box, Plus, Repeat, Theater } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { requireUser } from "@/server/auth";
import { getBranding } from "@/server/settings";

export const metadata = { title: "Dashboard" };

export default function Page() {
  return <Suspense><Dashboard /></Suspense>;
}

async function Dashboard() {
  const user = await requireUser();
  const brand = await getBranding();
  return (
    <>
      <PageHeader eyebrow={brand.school || brand.name} title={`Welcome back, ${user.displayName}`} />
      <div className="flex flex-wrap gap-2">
        <Link href="/items/new" className={buttonVariants()}><Plus />Add an item</Link>
        <Link href="/items" className={buttonVariants({ variant: "outline" })}><Box />Search inventory</Link>
        <Link href="/shows/new" className={buttonVariants({ variant: "outline" })}><Theater />Create a show</Link>
        <Link href="/rentals/new" className={buttonVariants({ variant: "outline" })}><Repeat />Start a rental</Link>
      </div>
    </>
  );
}
