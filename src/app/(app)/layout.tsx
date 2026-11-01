import { Suspense } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/app/app-sidebar";
import { Datalists } from "@/components/app/fields";
import { requireUser } from "@/server/auth";
import { getBranding, getLists } from "@/server/settings";
import { accentCss } from "@/lib/accent";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  // Check the session first, so nothing reads the database while the app is being built.
  const user = await requireUser();
  const [brand, lists] = await Promise.all([getBranding(), getLists()]);
  return (
    <SidebarProvider>
      {brand.accent && <style>{accentCss(brand.accent)}</style>}
      <AppSidebar user={user} brand={brand} />
      <SidebarInset>
        <header className="no-print flex h-12 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
          <span className="font-semibold">{brand.name}</span>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8">{children}</main>
      </SidebarInset>
      <Datalists lists={lists} />
    </SidebarProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-svh">
      <div className="hidden w-64 border-r bg-sidebar md:block" />
      <div className="flex-1 space-y-4 p-8"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>
    </div>
  );
}
