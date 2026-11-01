import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { AuthFrame } from "../auth-frame";
import { ChangePasswordForm } from "@/components/app/change-password-form";

export const metadata = { title: "Choose a new password" };

export default function Page() {
  return <Suspense><Gate /></Suspense>;
}

async function Gate() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return (
    <AuthFrame>
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div><h2 className="text-xl font-semibold">Choose a new password</h2><p className="text-sm text-muted-foreground">Your password is temporary or doesn&apos;t meet the security rule. Pick a new one only you know.</p></div>
        <ChangePasswordForm after="/" />
      </div>
    </AuthFrame>
  );
}
