import { Forbidden } from "@/components/forbidden";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/context";
import { can, NotFoundError } from "@/lib/rbac";
import { getOpportunity } from "@/lib/services/opportunities";
import { getLookups } from "@/lib/services/lookups";
import { listCompanies, listContacts } from "@/lib/services/accounts";
import { getAuditHistory, getTimeline, listActivities, listTasks } from "@/lib/services/activities";
import { oppNextAction } from "@/lib/nba";
import { CURRENCIES, FORECAST_CATEGORIES, RISK_LEVELS } from "@/lib/constants";
import { Badge, Card, CardHeader } from "@/components/ui";
import { Money, PageHeader } from "@/components/crm/bits";
import { InlineEdit } from "@/components/crm/inline-edit";
import { ActivityList, AuditList, QuickActions, RecordTabs, TaskList, TimelineList } from "@/components/crm/record";
import { fmtDate, fmtDateTime, relTime, titleCase } from "@/lib/utils";
import { NbaCard } from "../../leads/[id]/actions";
import { HandoverForm, StagePath } from "./client";
import { ArchiveButton } from "../../contacts/client";

export default async function OppPage(props: PageProps<"/opportunities/[id]">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "opportunities", "view")) return <Forbidden />;
  const { id } = await props.params; const sp = await props.searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) ?? "overview";
  let res: Awaited<ReturnType<typeof getOpportunity>>;
  try { res = await getOpportunity(ctx, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const o = res.opp as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [lookups, companies, contacts, activities, tasks, timeline, audit] = await Promise.all([
    getLookups(ctx), listCompanies(ctx, { per: 200 }), listContacts(ctx, { per: 200 }), listActivities(ctx, { entity: "opportunity", id }),
    listTasks(ctx, { view: "all", entity: "opportunity", id }), getTimeline(ctx, "opportunity", id), getAuditHistory(ctx, "opportunities", id),
  ]);
  const pipeline = lookups.pipelines.find((p) => p.id === o.pipeline_id)!;
  const canEdit = can(ctx.role, "opportunities", "edit") && !o.archived_at;
  const hideMoney = ctx.role === "marketing";
  const E = (field: string, label: string, kind: Parameters<typeof InlineEdit>[0]["kind"] = "text", options?: { value: string; label: string }[], display?: React.ReactNode) =>
    <InlineEdit entity="opportunity" id={id} field={field} label={label} value={o[field]} kind={kind} options={options} disabled={!canEdit || (field === "value" && o.value_locked && !can(ctx.role, "settings", "manage"))} display={display} />;
  const coContacts = contacts.rows.filter((c) => !o.company_id || c.company_id === o.company_id);
  return (
    <div className="pb-10">
      <PageHeader breadcrumb={{ href: "/opportunities", label: "Opportunities" }}
        title={<span className="flex flex-wrap items-center gap-2">{o.name}<Badge tone={o.status === "won" ? "green" : o.status === "lost" ? "red" : "blue"}>{o.status === "open" ? `${o.stage_name} · ${o.probability}%` : titleCase(o.status)}</Badge>{o.value_locked && <Badge>Value locked</Badge>}</span>}
        description={<>{o.company_id ? <Link className="hover:underline" href={`/companies/${o.company_id}`}>{o.company_name}</Link> : "No company"} · {o.pipeline_name} · Owner {o.owner_name ?? "—"}</>}
        actions={<>{!hideMoney && <span className="mr-2 text-right"><span className="block text-xs text-muted">Value · weighted</span><span className="tabular text-lg font-semibold"><Money value={o.value} currency={o.currency} /></span> <span className="tabular text-sm text-muted"><Money value={o.weighted_value} currency={o.currency} /></span></span>}
          {can(ctx.role, "opportunities", "archive") && <ArchiveButton entity="opportunities" id={id} label={o.name} />}</>} />
      <div className="px-4 pb-3 sm:px-6"><StagePath stages={pipeline.stages} current={o.stage_id} oppId={id} oppName={o.name} disabled={!canEdit} lostReasons={lookups.lostReasons} role={ctx.role} contacts={coContacts.map((c) => ({ id: c.id, full_name: c.full_name }))} /></div>
      <div className="px-4 pb-4 sm:px-6"><QuickActions related={{ opportunity_id: id }} users={lookups.users} canAssign={can(ctx.role, "tasks", "assign")} canWrite={can(ctx.role, "activities", "create") && !o.archived_at} /></div>
      <RecordTabs tabs={[{ key: "overview", label: "Overview" }, ...(res.handover ? [{ key: "handover", label: "Handover" }] : []), { key: "timeline", label: "Timeline", count: timeline.length }, { key: "activities", label: "Activities", count: activities.length }, { key: "tasks", label: "Tasks", count: tasks.filter((t) => t.status !== "completed").length }, { key: "history", label: "Stage history", count: res.history.length }, ...(audit.length ? [{ key: "audit", label: "Audit history" }] : [])]} />
      <div className="px-4 pt-4 sm:px-6">
        {tab === "overview" && (
          <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
            <Card>
              <CardHeader title="Deal details" description="Click to edit. Stage-required fields are enforced when moving the deal." />
              <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {E("name", "Opportunity name")}
                {E("company_id", "Company", "select", companies.rows.map((c) => ({ value: c.id, label: c.name })), o.company_name)}
                {E("contact_id", "Primary contact", "select", coContacts.map((c) => ({ value: c.id, label: c.full_name })), o.contact_name)}
                {!hideMoney && E("value", "Deal value", "number", undefined, <Money value={o.value} currency={o.currency} />)}
                {!hideMoney && E("currency", "Currency", "select", CURRENCIES.map((c) => ({ value: c, label: c })))}
                {!hideMoney && E("discount_pct", "Discount %", "number")}
                {E("expected_close_date", "Expected close", "date", undefined, o.expected_close_date ? fmtDate(o.expected_close_date) : undefined)}
                {E("forecast_category", "Forecast category", "select", FORECAST_CATEGORIES.map((f) => ({ value: f, label: titleCase(f) })), titleCase(o.forecast_category))}
                {E("risk_level", "Risk level", "select", RISK_LEVELS.map((f) => ({ value: f, label: titleCase(f) })), titleCase(o.risk_level))}
                <InlineEdit entity="opportunity" id={id} field="owner_id" label="Owner" value={o.owner_id} kind="select" options={lookups.users.map((u) => ({ value: u.id, label: u.name }))} disabled={!canEdit || !can(ctx.role, "opportunities", "assign")} display={o.owner_name} />
                {E("source_id", "Source", "select", lookups.sources.map((s) => ({ value: s.id, label: s.name })), o.source_name)}
                {E("services", "Services", "tags")}
                {E("next_action", "Next action")}
                {E("next_action_date", "Next action date", "date", undefined, o.next_action_date ? fmtDate(o.next_action_date) : undefined)}
                {E("competitors", "Competitors")}
                {E("decision_makers", "Decision makers")}
                {E("tags", "Tags", "tags")}
              </dl>
              <dl className="grid gap-4 border-t border-line p-4 lg:grid-cols-2">{E("pain_points", "Pain points", "textarea")}{E("proposed_solution", "Proposed solution", "textarea")}</dl>
              {o.status === "lost" && <div className="border-t border-line bg-red-50/50 p-4 text-sm"><b>Lost reason:</b> {o.lost_reason}{o.lost_notes && <p className="mt-1 text-muted">{o.lost_notes}</p>}</div>}
            </Card>
            <div className="space-y-4">
              <NbaCard nba={oppNextAction(o as never)} />
              <Card className="p-4 text-sm"><dl className="grid grid-cols-2 gap-3">
                <div><dt className="text-xs text-muted">In stage since</dt><dd>{relTime(o.stage_entered_at)}{o.max_days ? ` (limit ${o.max_days}d)` : ""}</dd></div>
                <div><dt className="text-xs text-muted">Last activity</dt><dd>{o.last_activity_at ? relTime(o.last_activity_at) : "None"}</dd></div>
                <div><dt className="text-xs text-muted">Created</dt><dd>{fmtDate(o.created_at)}</dd></div>
                <div><dt className="text-xs text-muted">{o.status === "won" ? "Won" : "Closed"}</dt><dd>{o.won_at ? fmtDate(o.won_at) : o.closed_at ? fmtDate(o.closed_at) : "—"}</dd></div>
                {o.lead_id && <div className="col-span-2"><dt className="text-xs text-muted">Origin</dt><dd><Link className="text-brand-600 hover:underline" href={`/leads/${o.lead_id}`}>Converted lead</Link></dd></div>}
              </dl></Card>
            </div>
          </div>
        )}
        {tab === "handover" && res.handover && <HandoverForm h={res.handover} oppId={id} users={lookups.users} canEdit={canEdit || ["owner", "admin", "manager"].includes(ctx.role)} currency={o.currency} />}
        {tab === "timeline" && <Card><TimelineList items={timeline} /></Card>}
        {tab === "activities" && <Card><ActivityList items={activities} /></Card>}
        {tab === "tasks" && <Card><TaskList items={tasks} /></Card>}
        {tab === "audit" && <Card><AuditList items={audit} /></Card>}
        {tab === "history" && <Card><ul className="divide-y divide-line">{res.history.map((h, i) => <li key={i} className="flex justify-between px-4 py-2.5 text-sm"><span>{h.from_name ? `${h.from_name} → ` : "Created in "}<b>{h.to_name}</b> <span className="text-muted">({h.from_probability != null ? `${h.from_probability}% → ` : ""}{h.to_probability}%)</span></span><span className="text-xs text-muted">{h.user_name} · {fmtDateTime(h.at)}</span></li>)}</ul></Card>}
      </div>
    </div>
  );
}
