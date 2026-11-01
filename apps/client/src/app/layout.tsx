import type { Metadata } from "next";
import { Suspense } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { connection } from "next/server";
import { getBranding } from "@/server/settings";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  await connection(); // branding is set at install time, after the build
  const b = await getBranding();
  return {
    title: { default: b.name, template: `%s · ${b.name}` },
    description: "Shows, inventory, rentals and programs for your theatre program.",
    icons: { icon: `/api/branding/logo${b.logoVersion ? `?v=${b.logoVersion}` : ""}` },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="bottom-center" />
          {/* Branding is chosen at install time, after the build, so titles are read per request. */}
          <Suspense><DynamicMarker /></Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}

async function DynamicMarker() {
  await connection();
  return null;
}
