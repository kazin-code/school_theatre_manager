import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChangePasswordForm } from "@/components/app/change-password-form";
import { requireUser } from "@/server/auth";
import { netState } from "@/server/net-state";
import { NetworkPanel } from "@/components/app/network-panel";
import { getBranding, getLists } from "@/server/settings";
import { getUsers } from "@/server/queries/settings";
import { LIST_LABELS } from "@stm/core/db/seed";
import { BrandingForm } from "./branding-form";
import { UsersPanel } from "./users-panel";
import { ListsPanel } from "./lists-panel";
import { SystemPanels } from "./system-panels";

export const metadata = { title: "Settings" };

export default function Page({ searchParams }: PageProps<"/settings">) {
  return <Suspense><Content searchParams={searchParams} /></Suspense>;
}

const TABS = ["school", "account", "users", "lists", "system", "network"];

async function Content({ searchParams }: Pick<PageProps<"/settings">, "searchParams">) {
  const me = await requireUser(); // before any data read
  const director = me.role === "director";
  const [brand, users, lists, net] = await Promise.all([getBranding(), director ? getUsers() : Promise.resolve([]), getLists(), netState()]);
  const asked = (await searchParams).tab;
  const tab = typeof asked === "string" && TABS.includes(asked) ? asked : director ? "school" : "account";
  return (
    <>
      <PageHeader eyebrow="Settings" title={director ? "Settings" : "My account"} />
      <Tabs defaultValue={tab}>
        <TabsList className="mb-4 flex-wrap">
          {director && <TabsTrigger value="school">School &amp; branding</TabsTrigger>}
          <TabsTrigger value="account">My account</TabsTrigger>
          {director && <TabsTrigger value="users">Users</TabsTrigger>}
          {director && <TabsTrigger value="lists">Dropdown lists</TabsTrigger>}
          <TabsTrigger value="system">Backups &amp; data</TabsTrigger>
          <TabsTrigger value="network">School network</TabsTrigger>
        </TabsList>
        {director && <TabsContent value="school"><BrandingForm brand={brand} /></TabsContent>}
        <TabsContent value="account">
          <Card className="max-w-xl">
            <CardHeader><CardTitle>Change your password</CardTitle><CardDescription>Signed in as <b>{me.username}</b> ({me.role === "director" ? "Director" : "Assistant"}).</CardDescription></CardHeader>
            <CardContent><ChangePasswordForm /></CardContent>
          </Card>
        </TabsContent>
        {director && <TabsContent value="users"><UsersPanel users={users} meId={me.id} /></TabsContent>}
        {director && <TabsContent value="lists"><ListsPanel lists={lists} labels={LIST_LABELS} /></TabsContent>}
        <TabsContent value="system"><SystemPanels director={director} /></TabsContent>
        <TabsContent value="network">
          {director ? <NetworkPanel net={net} canCopy={net.kind === "local"} /> : (
            <p className="text-sm text-muted-foreground">{net.kind === "school" ? `Records come from the school's server${net.name ? `, ${net.name}` : ""}.` : "Records are kept on this computer."} A director can change this.</p>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
