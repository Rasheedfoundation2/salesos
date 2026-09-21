import { Forbidden } from "@/components/forbidden";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/context";
import { can, NotFoundError } from "@/lib/rbac";
import { getContact, listCompanies } from "@/lib/services/accounts";
import { getLookups } from "@/lib/services/lookups";
import { listOpportunities } from "@/lib/services/opportunities";
import { getAuditHistory, getTimeline, listActivities, listTasks } from "@/lib/services/activities";
import { Badge, Card, CardHeader } from "@/components/ui";
import { Money, PageHeader, Stage } from "@/components/crm/bits";
import { ActivityList, AuditList, QuickActions, RecordTabs, TaskList, TimelineList } from "@/components/crm/record";
import { fmtDate, titleCase } from "@/lib/utils";
import { ArchiveButton, EditContactButton, NewOpportunityButton } from "../client";

export default async function ContactPage(props: PageProps<"/contacts/[id]">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "contacts", "view")) return <Forbidden />;
  const { id } = await props.params; const sp = await props.searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) ?? "overview";
  let c: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { c = await getContact(ctx, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const [lookups, companies, activities, tasks, timeline, audit, opps] = await Promise.all([
    getLookups(ctx), listCompanies(ctx, { per: 200 }), listActivities(ctx, { entity: "contact", id }), listTasks(ctx, { view: "all", entity: "contact", id }),
    getTimeline(ctx, "contact", id), getAuditHistory(ctx, "contacts", id), can(ctx.role, "opportunities") ? listOpportunities(ctx, { per: 50 }) : Promise.resolve({ rows: [] }),
  ]);
  const myOpps = opps.rows.filter((o) => o.contact_id === id);
  const canEdit = can(ctx.role, "contacts", "edit");
  const cs = companies.rows.map((x) => ({ id: x.id, name: x.name }));
  const row = (label: string, v: React.ReactNode) => <div><dt className="text-[11.5px] font-medium uppercase tracking-wide text-muted">{label}</dt><dd className="mt-0.5 text-sm">{v || "—"}</dd></div>;
  return (
    <div className="pb-10">
      <PageHeader breadcrumb={{ href: "/contacts", label: "Contacts" }} title={<span className="flex items-center gap-2">{c.full_name}{c.decision_role && <Badge tone="violet">{titleCase(c.decision_role)}</Badge>}</span>}
        description={[c.job_title, c.company_name].filter(Boolean).join(" · ")}
        actions={<>
          {canEdit && <EditContactButton initial={c} companies={cs} users={lookups.users} canAssign={can(ctx.role, "contacts", "assign")} />}
          {can(ctx.role, "opportunities", "create") && <NewOpportunityButton lookups={lookups} companies={cs} contacts={[{ id, full_name: c.full_name, company_id: c.company_id }]} defaults={{ company_id: c.company_id ?? undefined, contact_id: id }} canAssign={can(ctx.role, "opportunities", "assign")} currency={ctx.org.currency} variant="secondary" />}
          {can(ctx.role, "contacts", "archive") && <ArchiveButton entity="contacts" id={id} label={c.full_name} />}
        </>} />
      <div className="px-4 pb-4 sm:px-6"><QuickActions related={{ contact_id: id, ...(c.company_id ? { company_id: c.company_id } : {}) }} users={lookups.users} canAssign={can(ctx.role, "tasks", "assign")} phone={c.phone ?? c.mobile} whatsapp={c.whatsapp} email={c.email} canWrite={can(ctx.role, "activities", "create")} /></div>
      <RecordTabs tabs={[{ key: "overview", label: "Overview" }, { key: "timeline", label: "Timeline", count: timeline.length }, { key: "activities", label: "Activities", count: activities.length }, { key: "tasks", label: "Tasks", count: tasks.length }, { key: "opportunities", label: "Opportunities", count: myOpps.length }, ...(audit.length ? [{ key: "audit", label: "Audit history" }] : [])]} />
      <div className="px-4 pt-4 sm:px-6">
        {tab === "overview" && (
          <Card><CardHeader title="Contact details" />
            <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {row("Company", c.company_id ? <Link className="text-brand-600 hover:underline" href={`/companies/${c.company_id}`}>{c.company_name}</Link> : null)}
              {row("Email", c.email && <a className="text-brand-600 hover:underline" href={`mailto:${c.email}`}>{c.email}</a>)}{row("Phone", c.phone)}{row("Mobile", c.mobile)}{row("WhatsApp", c.whatsapp)}
              {row("Preferred channel", c.preferred_channel && titleCase(c.preferred_channel))}{row("Country", c.country)}{row("City", c.city)}{row("LinkedIn", c.linkedin_url)}
              {row("Owner", c.owner_name)}{row("Consent", titleCase(c.consent_status))}{row("Tags", (c.tags ?? []).join(", "))}{row("Created", fmtDate(c.created_at))}
            </dl>
            {c.notes && <p className="whitespace-pre-wrap border-t border-line p-4 text-sm">{c.notes}</p>}
          </Card>
        )}
        {tab === "timeline" && <Card><TimelineList items={timeline} /></Card>}
        {tab === "activities" && <Card><ActivityList items={activities} showRelated /></Card>}
        {tab === "tasks" && <Card><TaskList items={tasks} /></Card>}
        {tab === "audit" && <Card><AuditList items={audit} /></Card>}
        {tab === "opportunities" && <Card>{myOpps.length === 0 ? <p className="p-6 text-center text-sm text-muted">No opportunities with this contact.</p> : <ul className="divide-y divide-line">{myOpps.map((o) => <li key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><Link className="font-medium hover:text-brand-600" href={`/opportunities/${o.id}`}>{o.name}</Link><span className="flex items-center gap-3"><Stage name={o.stage_name} color={o.stage_color} /><Money value={o.value} currency={o.currency} /></span></li>)}</ul>}</Card>}
      </div>
    </div>
  );
}
