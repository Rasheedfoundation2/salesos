import { Forbidden } from "@/components/forbidden";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/context";
import { can, NotFoundError } from "@/lib/rbac";
import { getCompany, listCompanies } from "@/lib/services/accounts";
import { getLookups } from "@/lib/services/lookups";
import { listOpportunities } from "@/lib/services/opportunities";
import { getAuditHistory, getTimeline, listActivities, listTasks } from "@/lib/services/activities";
import { Badge, Card, CardHeader } from "@/components/ui";
import { Money, PageHeader, Stage, Stat } from "@/components/crm/bits";
import { ActivityList, AuditList, QuickActions, RecordTabs, TaskList, TimelineList } from "@/components/crm/record";
import { fmtDate, titleCase } from "@/lib/utils";
import { ArchiveButton, EditCompanyButton, NewContactButton, NewOpportunityButton } from "../../contacts/client";

export default async function CompanyPage(props: PageProps<"/companies/[id]">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "companies", "view")) return <Forbidden />;
  const { id } = await props.params; const sp = await props.searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) ?? "overview";
  let res: Awaited<ReturnType<typeof getCompany>>;
  try { res = await getCompany(ctx, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const c = res.company as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [lookups, companies, activities, tasks, timeline, audit, opps] = await Promise.all([
    getLookups(ctx), listCompanies(ctx, { per: 200 }), listActivities(ctx, { entity: "company", id }), listTasks(ctx, { view: "all", entity: "company", id }),
    getTimeline(ctx, "company", id), getAuditHistory(ctx, "companies", id), can(ctx.role, "opportunities") ? listOpportunities(ctx, { per: 200 }) : Promise.resolve({ rows: [] }),
  ]);
  const myOpps = opps.rows.filter((o) => o.company_id === id);
  const open = myOpps.filter((o) => o.status === "open");
  const cs = companies.rows.map((x) => ({ id: x.id, name: x.name }));
  const row = (label: string, v: React.ReactNode) => <div><dt className="text-[11.5px] font-medium uppercase tracking-wide text-muted">{label}</dt><dd className="mt-0.5 text-sm">{v || "—"}</dd></div>;
  return (
    <div className="pb-10">
      <PageHeader breadcrumb={{ href: "/companies", label: "Companies" }}
        title={<span className="flex items-center gap-2">{c.name}<Badge tone={c.client_status === "active_client" ? "green" : "blue"}>{titleCase(c.client_status)}</Badge>{c.health && <Badge tone={c.health === "healthy" ? "green" : c.health === "watch" ? "amber" : "red"}>{titleCase(c.health)}</Badge>}</span>}
        description={[c.industry, [c.city, c.country].filter(Boolean).join(", "), c.domain].filter(Boolean).join(" · ")}
        actions={<>
          {can(ctx.role, "companies", "edit") && <EditCompanyButton initial={c} users={lookups.users} canAssign={can(ctx.role, "companies", "assign")} />}
          {can(ctx.role, "contacts", "create") && <NewContactButton companies={cs} users={lookups.users} canAssign={can(ctx.role, "contacts", "assign")} companyId={id} label="Add contact" variant="secondary" />}
          {can(ctx.role, "opportunities", "create") && <NewOpportunityButton lookups={lookups} companies={cs} contacts={res.contacts.map((x) => ({ id: x.id, full_name: x.full_name, company_id: id }))} defaults={{ company_id: id }} canAssign={can(ctx.role, "opportunities", "assign")} currency={ctx.org.currency} variant="secondary" />}
          {can(ctx.role, "companies", "archive") && <ArchiveButton entity="companies" id={id} label={c.name} />}
        </>} />
      <div className="px-4 pb-4 sm:px-6"><QuickActions related={{ company_id: id }} users={lookups.users} canAssign={can(ctx.role, "tasks", "assign")} phone={c.phone} email={c.email} canWrite={can(ctx.role, "activities", "create")} /></div>
      <RecordTabs tabs={[{ key: "overview", label: "Overview" }, { key: "contacts", label: "Contacts", count: res.contacts.length }, { key: "opportunities", label: "Opportunities", count: myOpps.length }, { key: "timeline", label: "Timeline", count: timeline.length }, { key: "activities", label: "Activities", count: activities.length }, { key: "tasks", label: "Tasks", count: tasks.length }, ...(audit.length ? [{ key: "audit", label: "Audit history" }] : [])]} />
      <div className="space-y-4 px-4 pt-4 sm:px-6">
        {tab === "overview" && (<>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Lifetime value" value={<Money value={c.ltv} currency={ctx.org.currency} />} />
            <Stat label="Open pipeline" value={<Money value={open.reduce((s, o) => s + Number(o.value_base ?? 0), 0)} currency={ctx.org.currency} />} sub={`${open.length} open deals`} />
            <Stat label="Contacts" value={res.contacts.length} />
            <Stat label="Active services" value={(c.active_services ?? []).length} sub={(c.active_services ?? []).join(", ") || "None yet"} />
          </div>
          <Card><CardHeader title="Account details" />
            <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {row("Website", c.website && <a className="text-brand-600 hover:underline" href={c.website} target="_blank" rel="noreferrer">{c.website}</a>)}{row("Phone", c.phone)}{row("Email", c.email)}
              {row("Company size", c.company_size)}{row("Revenue range", c.revenue_range)}{row("Owner", c.owner_name)}
              {row("Parent company", c.parent_id && <Link className="text-brand-600" href={`/companies/${c.parent_id}`}>{c.parent_name}</Link>)}
              {row("Subsidiaries", res.subsidiaries.map((s) => s.name).join(", "))}{row("Billing address", c.billing_address)}
              {row("Operating markets", (c.operating_markets ?? []).join(", "))}{row("Tags", (c.tags ?? []).join(", "))}{row("Created", fmtDate(c.created_at))}
            </dl>
            {c.notes && <p className="whitespace-pre-wrap border-t border-line p-4 text-sm">{c.notes}</p>}
          </Card>
        </>)}
        {tab === "contacts" && <Card>{res.contacts.length === 0 ? <p className="p-6 text-center text-sm text-muted">No contacts yet.</p> : <ul className="divide-y divide-line">{res.contacts.map((x) => <li key={x.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><div><Link className="font-medium hover:text-brand-600" href={`/contacts/${x.id}`}>{x.full_name}</Link><p className="text-xs text-muted">{x.job_title ?? ""}</p></div><span className="text-xs text-muted">{x.email ?? x.phone}{x.decision_role && <Badge className="ml-2" tone="violet">{titleCase(x.decision_role)}</Badge>}</span></li>)}</ul>}</Card>}
        {tab === "opportunities" && <Card>{myOpps.length === 0 ? <p className="p-6 text-center text-sm text-muted">No opportunities yet.</p> : <ul className="divide-y divide-line">{myOpps.map((o) => <li key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><Link className="font-medium hover:text-brand-600" href={`/opportunities/${o.id}`}>{o.name}</Link><span className="flex items-center gap-3"><Stage name={o.stage_name} color={o.stage_color} /><Money value={o.value} currency={o.currency} /></span></li>)}</ul>}</Card>}
        {tab === "timeline" && <Card><TimelineList items={timeline} /></Card>}
        {tab === "activities" && <Card><ActivityList items={activities} showRelated /></Card>}
        {tab === "tasks" && <Card><TaskList items={tasks} showRelated /></Card>}
        {tab === "audit" && <Card><AuditList items={audit} /></Card>}
      </div>
    </div>
  );
}
