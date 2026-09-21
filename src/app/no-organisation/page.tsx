import { redirect } from "next/navigation";
import { getSessionUser, getCtx } from "@/lib/auth/context";
import { Card } from "@/components/ui";
import { Logo } from "@/components/logo";
import { CreateOrgCard } from "../(app)/account/client";
import Link from "next/link";

export default async function NoOrg() {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  if (await getCtx()) redirect("/home");
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        <Card className="p-6"><Logo className="mb-3 size-8" /><h1 className="text-lg font-semibold">You’re not in an active organisation</h1>
          <p className="mt-1 text-sm text-muted">Your membership may have been deactivated or the organisation suspended. Ask an administrator to re-invite you, or create your own organisation below.</p>
          {su.is_platform_admin && <Link href="/platform" className="mt-3 inline-block text-sm text-brand-600 underline">Open platform administration</Link>}</Card>
        <CreateOrgCard open />
      </div>
    </div>
  );
}
