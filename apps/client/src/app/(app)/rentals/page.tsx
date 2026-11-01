import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Plus } from "lucide-react";
import { requireUser } from "@/server/auth";
import { listRentals } from "@/server/queries/rentals";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { RentalsTable } from "./rentals-table";

export const metadata = { title: "Rentals" };
export default function Page() { return <Suspense><Content /></Suspense>; }
async function Content() {
  await requireUser();
  await connection();
  const rows = await listRentals();
  return (<><PageHeader eyebrow="Rentals" title="Rentals" actions={<Link href="/rentals/new" className={buttonVariants()}><Plus />Start a rental</Link>} /><RentalsTable rows={rows} /></>);
}
