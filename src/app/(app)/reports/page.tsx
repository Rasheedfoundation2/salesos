import { Forbidden } from "@/components/forbidden";
import { Download } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { dashboardData, periodRange } from "@/lib/services/dashboard";
import { getLookups } from "@/lib/services/lookups";
import { listViews } from "@/lib/services/settings";
import { DashboardView } from "@/components/dashboard";
import { PageHeader } from "@/components/crm/bits";
import { FilterBar } from "@/components/crm/filter-bar";
import { PrintButton } from "@/components/print-button";
import { buttonVariants } from "@/components/ui/variants";

export const metadata = { title: "Reports" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ReportsPage(props: PageProps<"/reports">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "reports", "view")) return <Forbidden />;
  const sp = await props.searchParams;
  const period = periodRange(one(sp.period), one(sp.from), one(sp.to));
  const owner = ctx.role === "rep" ? "me" : one(sp.owner);
  const [d, lookups, views] = await Promise.all([
    dashboardData(ctx, { from: period.from, to: period.to, owner, pipeline: one(sp.pipeline), source: one(sp.source), team: one(sp.team) }),
    getLookups(ctx), listViews(ctx, "reports"),
  ]);
  const variant = ctx.role === "finance" ? "finance" : ctx.role === "marketing" ? "marketing" : ctx.role === "rep" ? "rep" : ctx.role === "manager" ? "manager" : "executive";
  return (
    <div className="pb-10">
      <PageHeader title="Reports" description={`${period.label} (${period.from} → ${period.to}) · converted to ${ctx.org.currency} using organisation FX rates`}
        actions={<>
          {can(ctx.role, "opportunities", "export") && <a className={buttonVariants({ variant: "secondary", size: "sm" })} href="/api/export/opportunities"><Download />Deals CSV</a>}
          {can(ctx.role, "leads", "export") && <a className={buttonVariants({ variant: "secondary", size: "sm" })} href="/api/export/leads"><Download />Leads CSV</a>}
          <PrintButton />
        </>} />
      <FilterBar entity="reports" views={views} userId={ctx.userId} canShare={["owner", "admin", "manager"].includes(ctx.role)} hideSearch filters={[
        { key: "period", label: "Period", allLabel: "This month", options: [{ value: "last_month", label: "Last month" }, { value: "quarter", label: "This quarter" }, { value: "last_90", label: "Last 90 days" }, { value: "year", label: "This year" }] },
        ...(ctx.role !== "rep" ? [{ key: "owner", label: "Owner", options: lookups.users.map((u) => ({ value: u.id, label: u.name })) }, { key: "team", label: "Team", options: lookups.teams.map((t) => ({ value: t.id, label: t.name })) }] : []),
        { key: "pipeline", label: "Pipeline", options: lookups.pipelines.map((p) => ({ value: p.id, label: p.name })) },
        { key: "source", label: "Source", options: lookups.sources.map((s) => ({ value: s.id, label: s.name })) },
      ]} />
      <div className="px-4 sm:px-6"><DashboardView d={d} currency={ctx.org.currency} variant={variant} drill={(p) => p} /></div>
    </div>
  );
}
