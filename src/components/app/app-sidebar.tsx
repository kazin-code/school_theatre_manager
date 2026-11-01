"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Box, ClipboardList, History, LayoutDashboard, LogOut, Repeat, Settings, Star, Users, Theater } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { logoutAction } from "@/server/actions/auth";
import { usePullList } from "@/lib/pull-list";
import type { SessionUser } from "@/server/auth";
import type { BrandInfo } from "@/server/settings";

const MAIN = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/items", label: "Inventory", icon: Box },
  { href: "/shows", label: "Current shows", icon: Theater },
  { href: "/past-shows", label: "Past shows", icon: Archive },
  { href: "/rentals", label: "Rentals", icon: Repeat },
  { href: "/renters", label: "Renters", icon: Users },
  { href: "/sponsors", label: "Sponsors", icon: Star },
];
const MORE = [
  { href: "/pull-list", label: "Pull list", icon: ClipboardList },
  { href: "/activity", label: "Activity log", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ user, brand }: { user: SessionUser; brand: BrandInfo }) {
  const path = usePathname();
  const pull = usePullList();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const item = ({ href, label, icon: Icon }: (typeof MAIN)[number]) => (
    <SidebarMenuItem key={href}>
      <SidebarMenuButton isActive={active(href)} render={<Link href={href} />}><Icon />{label}</SidebarMenuButton>
      {href === "/pull-list" && pull.items.length > 0 && <SidebarMenuBadge>{pull.items.length}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
  return (
    <Sidebar className="no-print">
      <SidebarHeader>
        <Link href="/" className="flex items-center gap-2.5 rounded-lg p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/branding/logo${brand.logoVersion ? `?v=${brand.logoVersion}` : ""}`} alt="" className="size-10 rounded-lg bg-white object-contain p-0.5 ring-1 ring-border" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-semibold">{brand.name}</span>
            {brand.school && brand.school !== brand.name && <span className="block truncate text-xs text-muted-foreground">{brand.school}</span>}
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup><SidebarGroupContent><SidebarMenu>{MAIN.map(item)}</SidebarMenu></SidebarGroupContent></SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup><SidebarGroupContent><SidebarMenu>{MORE.map(item)}</SidebarMenu></SidebarGroupContent></SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-1">
          <div className="min-w-0 flex-1 text-sm leading-tight">
            <div className="truncate font-medium">{user.displayName}</div>
            <div className="text-xs text-muted-foreground">{user.role === "director" ? "Director" : "Assistant"}</div>
          </div>
          <ThemeToggle />
          <form action={logoutAction}><Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out"><LogOut /></Button></form>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
