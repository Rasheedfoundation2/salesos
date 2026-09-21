import Link from "next/link";
import { requireCtx } from "@/lib/auth/context";
import { dashboardData, periodRange } from "@/lib/services/dashboard";
import { getLookups } from "@/lib/services/lookups";
import { listTasks } from "@/lib/services/activities";
import { listLeads } from "@/lib/services/leads";
import { DashboardView } from "@/components/dashboard";
import { PageHeader } from "@/components/crm/bits";
import { FilterBar } from "@/components/crm/filter-bar";
import { Card, CardHeader } from "@/components/ui";
import { TaskList } from "@/components/crm/record";
import { LeadStatus, Score } from "@/components/crm/bits";
import { ROLE_LABELS } from "@/lib/constants";
import { relTime } from "@/lib/utils";

export const metadata = { title: "Home" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function HomePage(props: PageProps<"/home">) {
  const ctx = await requireCtx();
  const sp = await props.searchParams;
  const period = periodRange(one(sp.period), one(sp.from), one(sp.to));
  const variant = ctx.role === "rep" ? "rep" : ctx.role === "manager" ? "manager" : ctx.role === "marketing" ? "marketing" : ctx.role === "finance" ? "finance" : "executive";
  const owner = ctx.role === "rep" ? "me" : one(sp.owner);
  const [d, lookups, myTasks, newLeads] = await Promise.all([
    dashboardData(ctx, { from: period.from, to: period.to, owner, pipeline: one(sp.pipeline), source: one(sp.source) }),
    getLookups(ctx),
    ["rep", "manager", "owner", "admin"].includes(ctx.role) ? listTasks(ctx, { view: "today", limit: 12 }) : Promise.resolve([]),
    ctx.role === "rep" ? listLeads(ctx, { owner: "me", status: ["new"], per: 8 }) : Promise.resolve(null),
  ]);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: ctx.org.timezone }).format(new Date()));
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const drill = (p: string) => (ctx.role === "rep" ? p + (p.includes("?") ? "&" : "?") + "owner=me" : p);
  return (
    <div className="pb-10">
      <PageHeader title={`${greet}, ${ctx.user.name.split(" ")[0]}`} description={`${ROLE_LABELS[ctx.role]} dashboard · ${period.label} · all values in ${ctx.org.currency}`} />
      {one(sp.welcome) && <div className="mx-4 mb-4 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-navy-900 sm:mx-6">Welcome to SalesOS. Start by <Link className="font-medium text-brand-700 underline" href="/team">adding your sales team</Link>, then <Link className="font-medium text-brand-700 underline" href="/leads/import">import your lead list</Link> and assign it to your agents.</div>}
      <FilterBar hideSearch filters={[
        { key: "period", label: "Period", allLabel: "This month", options: [{ value: "last_month", label: "Last month" }, { value: "quarter", label: "This quarter" }, { value: "last_90", label: "Last 90 days" }, { value: "year", label: "This year" }] },
        ...(ctx.role !== "rep" ? [{ key: "owner", label: "Owner", options: lookups.users.map((u) => ({ value: u.id, label: u.name })) }] : []),
        { key: "pipeline", label: "Pipeline", options: lookups.pipelines.map((p) => ({ value: p.id, label: p.name })) },
        { key: "source", label: "Source", options: lookups.sources.map((s) => ({ value: s.id, label: s.name })) },
      ]} />
      <div className="space-y-4 px-4 sm:px-6">
        {(myTasks.length > 0 || newLeads) && (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card><CardHeader title="Today’s tasks & follow-ups" action={<Link href="/tasks" className="text-xs text-brand-600 hover:underline">All tasks</Link>} /><TaskList items={myTasks} showRelated /></Card>
            {newLeads && (
              <Card><CardHeader title="New leads assigned to me" action={<Link href="/leads?owner=me&status=new" className="text-xs text-brand-600 hover:underline">View all</Link>} />
                {newLeads.rows.length === 0 ? <p className="p-6 text-center text-sm text-muted">No new leads waiting.</p> : (
                  <ul className="divide-y divide-line">{newLeads.rows.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0"><Link href={`/leads/${l.id}`} className="font-medium hover:text-brand-600">{l.full_name}</Link><p className="truncate text-xs text-muted">{l.company_name ?? "—"} · {relTime(l.created_at)}</p></div>
                      <div className="flex items-center gap-2"><LeadStatus status={l.status} /><Score score={l.score} /></div>
                    </li>))}</ul>
                )}
              </Card>
            )}
          </div>
        )}
        <DashboardView d={d} currency={ctx.org.currency} variant={variant} drill={drill} />
      </div>
    </div>
  );
}
