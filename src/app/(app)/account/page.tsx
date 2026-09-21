import { requireCtx } from "@/lib/auth/context";
import { withSystem } from "@/lib/db";
import { PageHeader } from "@/components/crm/bits";
import { Badge, Card, CardHeader } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { fmtDateTime } from "@/lib/utils";
import { PasswordCard, CreateOrgCard, RevokeSession } from "./client";

export const metadata = { title: "Account & security" };

export default async function AccountPage(props: PageProps<"/account">) {
  const ctx = await requireCtx();
  const sp = await props.searchParams;
  const sessions = await withSystem((db) => db.many<{ id: string; ip: string | null; user_agent: string | null; created_at: string; last_seen_at: string }>(
    "select id, ip, user_agent, created_at, last_seen_at from sessions where user_id = $1 and revoked_at is null and expires_at > now() order by last_seen_at desc", [ctx.userId]));
  return (
    <div className="pb-10">
      <PageHeader title="Account & security" description={`${ctx.user.name} · ${ctx.user.email} · ${ROLE_LABELS[ctx.role]} in ${ctx.org.name}`} />
      <div className="grid gap-4 px-4 sm:px-6 xl:grid-cols-2">
        <PasswordCard />
        <Card><CardHeader title="Active sessions" description="Sign out devices you don’t recognise." />
          <ul className="divide-y divide-line text-sm">{sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0"><p className="truncate">{(s.user_agent ?? "Unknown device").slice(0, 70)}</p><p className="text-xs text-muted">{s.ip} · signed in {fmtDateTime(s.created_at)} · last seen {fmtDateTime(s.last_seen_at)}</p></div>
              {s.id === ctx.sessionId ? <Badge tone="green">This device</Badge> : <RevokeSession id={s.id} />}
            </li>))}</ul>
        </Card>
        <Card><CardHeader title="Multi-factor authentication" /><p className="p-4 text-sm text-muted">TOTP-based MFA is modelled in the database and scheduled for Phase 2. Until then, use a strong unique password; accounts lock for 15 minutes after 10 failed attempts.</p></Card>
        <CreateOrgCard open={sp["new-org"] === "1"} />
      </div>
    </div>
  );
}
