import Link from "next/link";
import { getInvitation } from "@/lib/services/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { InviteForm } from "./form";

export const metadata = { title: "Accept invitation" };

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const inv = await getInvitation(token);
  if (!inv) return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Invitation unavailable</h2>
      <p className="mt-2 text-sm text-muted">This invitation has expired, been revoked or already been used. Ask your administrator to send a new one.</p>
      <Link href="/login" className="mt-6 inline-block text-sm text-brand-600 hover:underline">Go to sign in</Link>
    </>
  );
  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Join {inv.org_name}</h2>
      <p className="mt-1 text-sm text-muted">You’ve been invited as <b>{ROLE_LABELS[inv.role]}</b> using <b>{inv.email}</b>.</p>
      <InviteForm token={token} userExists={inv.user_exists} name={inv.name ?? ""} />
    </>
  );
}
