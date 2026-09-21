import { Forbidden } from "@/components/forbidden";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/context";
import { can, NotFoundError } from "@/lib/rbac";
import { getLead, leadDuplicates } from "@/lib/services/leads";
import { getLookups } from "@/lib/services/lookups";
import { getAuditHistory, getTimeline, listActivities, listTasks } from "@/lib/services/activities";
import { listCompanies } from "@/lib/services/accounts";
import { leadNextAction } from "@/lib/nba";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, PRIORITIES, CURRENCIES, COMPANY_SIZES } from "@/lib/constants";
import { scoreCategory, type ScoreLine } from "@/lib/scoring";
import { Card, CardHeader, Badge } from "@/components/ui";
import { LeadStatus, PageHeader, Score, Money } from "@/components/crm/bits";
import { InlineEdit } from "@/components/crm/inline-edit";
import { ActivityList, AuditList, QuickActions, RecordTabs, TaskList, TimelineList } from "@/components/crm/record";
import { fmtDateTime, relTime, titleCase } from "@/lib/utils";
import { LeadActions, NbaCard, MergeButton as MergeButtonWrapper } from "./actions";

export default async function LeadPage(props: PageProps<"/leads/[id]">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "leads", "view")) return <Forbidden />;
  const { id } = await props.params; const sp = await props.searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) ?? "overview";
  let lead: Awaited<ReturnType<typeof getLead>>;
  try { lead = await getLead(ctx, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const l = lead as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [lookups, activities, tasks, timeline, audit, dups, companies] = await Promise.all([
    getLookups(ctx), listActivities(ctx, { entity: "lead", id }), listTasks(ctx, { view: "all", entity: "lead", id }), getTimeline(ctx, "lead", id),
    getAuditHistory(ctx, "leads", id), leadDuplicates(ctx, l as never), listCompanies(ctx, { per: 200 }),
  ]);
  const canEdit = can(ctx.role, "leads", "edit") && !l.archived_at;
  const canAssign = can(ctx.role, "leads", "assign");
  const breakdown = (l.score_breakdown ?? []) as ScoreLine[];
  const nba = leadNextAction(l as never);
  const E = (field: string, label: string, kind: Parameters<typeof InlineEdit>[0]["kind"] = "text", options?: { value: string; label: string }[], display?: React.ReactNode) =>
    <InlineEdit entity="lead" id={id} field={field} label={label} value={l[field]} kind={kind} options={options} disabled={!canEdit} display={display} />;
  const openTasks = tasks.filter((t) => !["completed", "cancelled"].includes(t.status));
  return (
    <div className="pb-10">
      <PageHeader breadcrumb={{ href: "/leads", label: "Leads" }}
        title={<span className="flex flex-wrap items-center gap-2">{l.full_name}<LeadStatus status={l.status} /><Badge tone={l.score >= 80 ? "red" : l.score >= 60 ? "amber" : "slate"}>{scoreCategory(l.score)} · {l.score}</Badge>{l.archived_at && <Badge tone="red">Archived</Badge>}</span>}
        description={[l.job_title, l.company_name, [l.city, l.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || undefined}
        actions={<LeadActions id={id} status={l.status} ownerId={l.owner_id} users={lookups.users} canAssign={canAssign} canEdit={canEdit} canArchive={can(ctx.role, "leads", "archive")}
          pipelines={lookups.pipelines.map((p) => ({ id: p.id, name: p.name }))} companies={companies.rows.map((c) => ({ id: c.id, name: c.name }))} companyName={l.company_name}
          value={l.expected_value ?? l.estimated_budget} currency={l.currency} archived={!!l.archived_at} convertedOpp={l.converted_opportunity_id} />} />
      <div className="px-4 pb-4 sm:px-6"><QuickActions related={{ lead_id: id }} users={lookups.users} canAssign={canAssign} phone={l.phone} whatsapp={l.whatsapp} email={l.email} canWrite={canEdit} /></div>
      <RecordTabs tabs={[{ key: "overview", label: "Overview" }, { key: "timeline", label: "Timeline", count: timeline.length }, { key: "activities", label: "Activities", count: activities.length },
        { key: "tasks", label: "Tasks", count: openTasks.length }, { key: "related", label: "Related", count: dups.length + (l.converted_contact_id ? 1 : 0) }, ...(audit.length ? [{ key: "audit", label: "Audit history" }] : [])]} />
      <div className="px-4 pt-4 sm:px-6">
        {tab === "overview" && (
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <Card>
                <CardHeader title="Lead details" description="Click any field to edit — changes save automatically and are recorded in the audit history." />
                <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {E("first_name", "First name")}{E("last_name", "Last name")}{E("job_title", "Job title")}
                  {E("company_name", "Company")}{E("email", "Email", "email")}{E("phone", "Mobile")}
                  {E("whatsapp", "WhatsApp")}{E("country", "Country")}{E("city", "City")}
                  {E("website", "Website")}{E("linkedin_url", "LinkedIn")}{E("industry", "Industry")}
                  {E("company_size", "Company size", "select", COMPANY_SIZES.map((s) => ({ value: s, label: s })))}
                  {E("status", "Status", "select", LEAD_STATUSES.filter((s) => s !== "converted" || l.status === "converted").map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s]! })), <LeadStatus status={l.status} />)}
                  {E("priority", "Priority", "select", PRIORITIES.map((p) => ({ value: p, label: titleCase(p) })), titleCase(l.priority))}
                  <InlineEdit entity="lead" id={id} field="owner_id" label="Owner" value={l.owner_id} kind="select" options={lookups.users.map((u) => ({ value: u.id, label: u.name }))} disabled={!canEdit || !canAssign} display={l.owner_name ?? "Unassigned"} />
                  {E("source_id", "Source", "select", lookups.sources.map((s) => ({ value: s.id, label: s.name })), l.source_name)}
                  {E("campaign_id", "Campaign", "select", lookups.campaigns.map((s) => ({ value: s.id, label: s.name })), l.campaign_name)}
                  {E("services", "Required services", "tags")}
                  {E("estimated_budget", "Estimated budget", "number", undefined, l.estimated_budget ? <Money value={l.estimated_budget} currency={l.currency} /> : undefined)}
                  {E("expected_value", "Expected value", "number", undefined, l.expected_value ? <Money value={l.expected_value} currency={l.currency} /> : undefined)}
                  {E("currency", "Currency", "select", CURRENCIES.map((c) => ({ value: c, label: c })))}
                  {E("timeframe", "Timeframe")}
                  {E("authority", "Authority", "select", [{ value: "decision_maker", label: "Decision maker" }, { value: "influencer", label: "Influencer" }, { value: "user", label: "User" }], l.authority ? titleCase(l.authority) : undefined)}
                  {E("next_follow_up_at", "Next follow-up", "datetime", undefined, l.next_follow_up_at ? `${fmtDateTime(l.next_follow_up_at, ctx.org.timezone)} (${relTime(l.next_follow_up_at)})` : undefined)}
                  {E("consent_status", "Consent", "select", ["unknown", "granted", "denied", "unsubscribed"].map((s) => ({ value: s, label: titleCase(s) })), titleCase(l.consent_status))}
                  {E("tags", "Tags", "tags")}
                </dl>
                <dl className="border-t border-line p-4">{E("notes", "Notes", "textarea")}</dl>
              </Card>
            </div>
            <div className="space-y-4">
              <NbaCard nba={nba} />
              <Card>
                <CardHeader title={<span className="flex items-center gap-2">Lead score <Score score={l.score} /></span>} description="Rule-based and explainable. Weights are configurable in Settings → Scoring." />
                <ul className="divide-y divide-line">
                  {breakdown.map((b) => (
                    <li key={b.key} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
                      <div className="min-w-0"><p className="font-medium">{b.label}</p><p className="text-xs text-muted">{b.reason}</p></div>
                      <span className="tabular shrink-0 text-xs font-semibold">{b.points}<span className="text-muted">/{b.weight}</span></span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-4 text-sm">
                <dl className="grid grid-cols-2 gap-3">
                  <div><dt className="text-xs text-muted">Created</dt><dd>{fmtDateTime(l.created_at, ctx.org.timezone)}</dd></div>
                  <div><dt className="text-xs text-muted">Response SLA</dt><dd>{l.first_contacted_at ? (new Date(l.first_contacted_at) <= new Date(l.first_response_due_at) ? <Badge tone="green">Met</Badge> : <Badge tone="red">Missed</Badge>) : l.first_response_due_at ? (new Date(l.first_response_due_at) < new Date() ? <Badge tone="red">Breached</Badge> : <Badge tone="amber">Due {relTime(l.first_response_due_at)}</Badge>) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Last contacted</dt><dd>{l.last_contacted_at ? relTime(l.last_contacted_at) : "Never"}</dd></div>
                  <div><dt className="text-xs text-muted">Team</dt><dd>{l.team_name ?? "—"}</dd></div>
                </dl>
              </Card>
            </div>
          </div>
        )}
        {tab === "timeline" && <Card><TimelineList items={timeline} /></Card>}
        {tab === "activities" && <Card><ActivityList items={activities} /></Card>}
        {tab === "tasks" && <Card><TaskList items={tasks} /></Card>}
        {tab === "audit" && <Card><AuditList items={audit} /></Card>}
        {tab === "related" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Converted records" />
              {l.converted_at ? (
                <ul className="space-y-2 p-4 text-sm">
                  {l.converted_contact_id && <li>Contact: <Link className="text-brand-600 hover:underline" href={`/contacts/${l.converted_contact_id}`}>Open contact</Link></li>}
                  {l.converted_company_id && <li>Company: <Link className="text-brand-600 hover:underline" href={`/companies/${l.converted_company_id}`}>Open company</Link></li>}
                  {l.converted_opportunity_id && <li>Opportunity: <Link className="text-brand-600 hover:underline" href={`/opportunities/${l.converted_opportunity_id}`}>Open opportunity</Link></li>}
                </ul>
              ) : <p className="p-4 text-sm text-muted">Not converted yet.</p>}
            </Card>
            <Card>
              <CardHeader title="Possible duplicates" description="Matched on email, phone and company domain." />
              {dups.length === 0 ? <p className="p-4 text-sm text-muted">No duplicates detected.</p> : (
                <ul className="divide-y divide-line">{dups.map((d) => (
                  <li key={d.entity + d.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span><Link className="font-medium text-brand-600 hover:underline" href={`/${d.entity === "company" ? "companies" : d.entity + "s"}/${d.id}`}>{d.label}</Link> <span className="text-muted">— {d.reason} ({d.entity})</span></span>
                    {d.entity === "lead" && can(ctx.role, "leads", "archive") && <MergeButtonWrapper primary={id} secondary={d.id} label={d.label} />}
                  </li>))}</ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

