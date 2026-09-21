import { Forbidden } from "@/components/forbidden";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/services/lookups";
import { listApiKeys, listAudit, listSettingsLists, loginHistory, outbox } from "@/lib/services/settings";
import { withSystem } from "@/lib/db";
import { mergeScoring, DIMENSION_LABELS } from "@/lib/scoring";
import { PageHeader } from "@/components/crm/bits";
import { Badge, Card, CardHeader } from "@/components/ui";
import { cn, fmtDateTime } from "@/lib/utils";
import { ROLE_LABELS, ROLES, STAGE_REQUIRABLE_FIELDS } from "@/lib/constants";
import { OrgForm, PipelinesEditor, ListsEditor, ScoringForm, FxForm, ApiKeys } from "./client";

export const metadata = { title: "Settings" };
const SECTIONS = [["organisation", "Organisation"], ["pipelines", "Pipelines & stages"], ["lists", "Sources, campaigns & lists"], ["scoring", "Lead scoring"], ["currencies", "Currencies"], ["api", "API & webhooks"], ["plan", "Plan & billing"], ["audit", "Audit log"], ["logins", "Login history"], ["outbox", "Email outbox"]] as const;

export default async function SettingsPage(props: PageProps<"/settings">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "settings", "manage")) return <Forbidden />;
  const sp = await props.searchParams;
  const section = (typeof sp.section === "string" ? sp.section : "organisation");
  const s = ctx.org.settings as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div className="pb-10">
      <PageHeader title="Settings" description={`${ctx.org.name} · ${ctx.org.plan_code} plan`} />
      <div className="grid gap-4 px-4 sm:px-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Settings sections">
          {SECTIONS.map(([k, l]) => <Link key={k} href={`/settings?section=${k}`} className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm", section === k ? "bg-white font-medium shadow-card" : "text-muted hover:bg-white/60 hover:text-ink")}>{l}</Link>)}
        </nav>
        <div className="min-w-0 space-y-4">
          {section === "organisation" && <OrgForm org={{ name: ctx.org.name, currency: ctx.org.currency, timezone: ctx.org.timezone, date_format: ctx.org.date_format }} settings={s} terminology={ctx.org.terminology} />}
          {section === "pipelines" && <PipelinesEditor pipelines={(await getLookups(ctx)).pipelines} fields={STAGE_REQUIRABLE_FIELDS} roles={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r]! }))} />}
          {section === "lists" && <ListsEditor lists={await listSettingsLists(ctx)} currency={ctx.org.currency} />}
          {section === "scoring" && <ScoringForm cfg={mergeScoring(s.scoring)} labels={DIMENSION_LABELS} currency={ctx.org.currency} />}
          {section === "currencies" && <FxForm fx={(await listSettingsLists(ctx)).fx} base={ctx.org.currency} />}
          {section === "api" && <ApiKeys keys={await listApiKeys(ctx)} appUrl={process.env.APP_URL ?? ""} />}
          {section === "plan" && <PlanCard orgId={ctx.orgId} plan={ctx.org.plan_code} />}
          {section === "audit" && <AuditCard ctx={ctx} action={typeof sp.action === "string" ? sp.action : undefined} />}
          {section === "logins" && <LoginsCard ctx={ctx} />}
          {section === "outbox" && <OutboxCard ctx={ctx} />}
        </div>
      </div>
    </div>
  );
}

async function PlanCard({ orgId, plan }: { orgId: string; plan: string }) {
  const [plans, usage] = await Promise.all([
    withSystem((db) => db.many<{ code: string; name: string; price_monthly: string | null; limits: Record<string, number> }>("select * from plans order by price_monthly nulls last")),
    withSystem((db) => db.one<{ users: number; contacts: number; pipelines: number; leads: number }>(`select (select count(*)::int from memberships where org_id = $1 and status='active') users,
      (select count(*)::int from contacts where org_id = $1) contacts, (select count(*)::int from pipelines where org_id = $1 and archived_at is null) pipelines, (select count(*)::int from leads where org_id = $1) leads`, [orgId])),
  ]);
  const cur = plans.find((p) => p.code === plan)!;
  const bar = (label: string, used: number, limit: number) => (
    <div key={label}><div className="flex justify-between text-sm"><span>{label}</span><span className="tabular text-muted">{used.toLocaleString("en-GB")} / {limit.toLocaleString("en-GB")}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", used / limit > 0.9 ? "bg-red-500" : "bg-brand-500")} style={{ width: `${Math.min(100, (100 * used) / limit)}%` }} /></div></div>);
  return (<>
    <Card><CardHeader title={`Current plan: ${cur.name}`} description="Usage against plan limits. Limits are enforced for users and pipelines in Phase 1." />
      <div className="grid gap-4 p-4 md:grid-cols-2">{bar("Users", usage!.users, cur.limits.users!)}{bar("Contacts", usage!.contacts, cur.limits.contacts!)}{bar("Pipelines", usage!.pipelines, cur.limits.pipelines!)}{bar("Leads (counted as contacts)", usage!.leads, cur.limits.contacts!)}</div></Card>
    <div className="grid gap-3 md:grid-cols-4">{plans.map((p) => (
      <Card key={p.code} className={cn("p-4", p.code === plan && "ring-2 ring-brand-500")}>
        <p className="font-semibold">{p.name}</p><p className="tabular text-xl font-semibold">{p.price_monthly == null ? "Custom" : `$${Number(p.price_monthly)}`}<span className="text-xs font-normal text-muted">{p.price_monthly != null && " /month"}</span></p>
        <ul className="mt-2 space-y-0.5 text-xs text-muted"><li>{p.limits.users} users</li><li>{p.limits.contacts?.toLocaleString("en-GB")} contacts</li><li>{p.limits.pipelines} pipelines</li><li>{p.limits.automations} automations</li><li>{p.limits.ai_credits?.toLocaleString("en-GB")} AI credits</li></ul>
      </Card>))}</div>
    <p className="text-sm text-muted">Online checkout is not connected yet (Stripe integration is scheduled for Phase 2). Plan changes are made by the platform administrator.</p>
  </>);
}

async function AuditCard({ ctx, action }: { ctx: Awaited<ReturnType<typeof requireCtx>>; action?: string }) {
  const rows = await listAudit(ctx, { action });
  const filters = ["login", "export", "record.transferred", "record.archived", "permission.changed", "member.", "import.", "settings.", "discount.", "integration."];
  return (
    <Card><CardHeader title="Audit log" description="Append-only. The database rejects any update or deletion of audit entries." />
      <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">{[undefined, ...filters].map((f) => <Link key={f ?? "all"} href={`/settings?section=audit${f ? `&action=${f}` : ""}`} className={cn("rounded-full border px-2 py-0.5 text-xs", action === f ? "border-navy-900 bg-navy-900 text-white" : "border-line")}>{f ?? "All"}</Link>)}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b border-line text-left text-[11.5px] uppercase text-muted"><th className="px-4 py-2">When</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Record</th><th className="px-3 py-2">Details</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-line/60 align-top"><td className="whitespace-nowrap px-4 py-1.5 text-muted">{fmtDateTime(r.at)}</td><td className="px-3 py-1.5">{r.actor_name ?? "System"}</td><td className="px-3 py-1.5"><Badge>{r.action}</Badge></td><td className="px-3 py-1.5 text-xs">{r.entity_type}</td><td className="max-w-[360px] truncate px-3 py-1.5 font-mono text-[11px] text-muted" title={JSON.stringify(r.changes)}>{JSON.stringify(r.changes)}</td></tr>)}</tbody></table></div>
    </Card>
  );
}
async function LoginsCard({ ctx }: { ctx: Awaited<ReturnType<typeof requireCtx>> }) {
  const rows = await loginHistory(ctx);
  return <Card><CardHeader title="Login history" description="Successful and failed sign-in attempts for members of this organisation." />
    <ul className="divide-y divide-line text-sm">{rows.map((r, i) => <li key={i} className="flex justify-between px-4 py-2"><span>{r.email} {r.success ? <Badge tone="green">Success</Badge> : <Badge tone="red">{r.reason ?? "Failed"}</Badge>}</span><span className="text-xs text-muted">{r.ip} · {fmtDateTime(r.at)}</span></li>)}</ul></Card>;
}
async function OutboxCard({ ctx }: { ctx: Awaited<ReturnType<typeof requireCtx>> }) {
  const rows = await outbox(ctx);
  return <Card><CardHeader title="Email outbox" description="Transactional emails (invitations, password resets) are queued here. Connect an email provider in Phase 2 to deliver them automatically." />
    {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted">No emails queued.</p> : <ul className="divide-y divide-line text-sm">{rows.map((r) => <li key={r.id} className="px-4 py-2.5"><p className="font-medium">{r.subject} <span className="font-normal text-muted">→ {r.to_email}</span></p><pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted">{r.body}</pre></li>)}</ul>}</Card>;
}
