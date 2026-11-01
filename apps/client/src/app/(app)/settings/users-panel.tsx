"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { FormError, NativeSelect, SelectField, TextField } from "@/components/app/fields";
import { PasswordChecklist } from "@/components/app/password-checklist";
import { userSchema } from "@stm/core/db/validation";
import { createUserAction, updateUserAction } from "@/server/actions/settings";
import { applyResult } from "@/lib/forms";
import { fmtWhen } from "@/lib/format";

type U = { id: number; username: string; displayName: string; role: "director" | "assistant"; active: boolean; mustChangePassword: boolean; lastLoginAt: string | null };

export function UsersPanel({ users, meId }: { users: U[]; meId: number }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<U | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>Directors can do everything. Assistants can add and edit items, renters, rentals, shows, cast and crew, materials and photos, but can&apos;t delete records, change lists or branding, manage users or restore backups.</CardDescription>
        <CardAction><Button onClick={() => setAdding(true)}><Plus />Add user</Button></CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Username</TableHead><TableHead>Role</TableHead><TableHead>Last sign-in</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.displayName}</TableCell>
                <TableCell className="font-mono text-xs">{u.username}</TableCell>
                <TableCell>{u.role === "director" ? "Director" : "Assistant"}</TableCell>
                <TableCell className="tabular">{u.lastLoginAt ? fmtWhen(u.lastLoginAt) : "Never"}</TableCell>
                <TableCell>{!u.active ? <Badge variant="secondary">Turned off</Badge> : u.mustChangePassword ? <Badge variant="outline">Temporary password</Badge> : <Badge variant="outline" className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400">Active</Badge>}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setEditing(u)}>Manage</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <AddUser open={adding} onOpenChange={setAdding} />
      {editing && <EditUser user={editing} self={editing.id === meId} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function AddUser({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(userSchema), defaultValues: { username: "", displayName: "", role: "assistant" as const, password: "" } });
  const onSubmit = form.handleSubmit(async (v) => {
    if (!applyResult(form, await createUserAction(v))) return;
    toast.success("User added"); form.reset(); onOpenChange(false); router.refresh();
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add a user</DialogTitle><DialogDescription>They&apos;ll choose their own password the first time they sign in.</DialogDescription></DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormError />
            <TextField name="displayName" label="Name" placeholder="e.g. Jordan (stage manager)" className="sm:col-span-2" />
            <TextField name="username" label="Username" autoComplete="off" />
            <SelectField name="role" label="Role" options={[["assistant", "Assistant"], ["director", "Director"]]} />
            <div className="flex flex-col gap-2 sm:col-span-2">
              <TextField name="password" label="Temporary password" autoComplete="off" />
              <PasswordChecklist value={form.watch("password")} />
            </div>
            <DialogFooter className="sm:col-span-2"><Button type="submit" disabled={form.formState.isSubmitting}>Add user</Button></DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

function EditUser({ user, self, onClose }: { user: U; self: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(user.displayName);
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.active);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  async function save() {
    const res = await updateUserAction(user.id, { displayName: name, ...(self ? {} : { role, active, password: pw || undefined }) });
    if (!res.ok) { setErr(res.error); return; }
    toast.success("Saved"); onClose(); router.refresh();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Manage {user.displayName}</DialogTitle></DialogHeader>
        {err && <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2"><FieldLabel htmlFor="mu-name">Name</FieldLabel><Input id="mu-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {!self && <>
            <Field><FieldLabel htmlFor="mu-role">Role</FieldLabel><NativeSelect id="mu-role" value={role} onChange={(e) => setRole(e.target.value as U["role"])}><option value="assistant">Assistant</option><option value="director">Director</option></NativeSelect></Field>
            <Field orientation="horizontal" className="self-end"><Checkbox id="mu-active" checked={active} onCheckedChange={(v) => setActive(!!v)} /><FieldLabel htmlFor="mu-active" className="font-normal">Account turned on</FieldLabel></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="mu-pw">Set a new temporary password</FieldLabel><Input id="mu-pw" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Leave blank to keep the current one" autoComplete="off" />{pw && <PasswordChecklist value={pw} />}</Field>
          </>}
          {self && <p className="text-sm text-muted-foreground sm:col-span-2">To change your own password, use the My account tab.</p>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
