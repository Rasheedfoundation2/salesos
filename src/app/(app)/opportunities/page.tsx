import { Forbidden } from "@/components/forbidden";
import Link from "next/link";
import { Briefcase, Download, KanbanSquare } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { listOpportunities } from "@/lib/services/opportunities";
import { getLookups } from "@/lib/services/lookups";
import { listCompanies, listContacts } from "@/lib/services/accounts";
import { listViews } from "@/lib/services/settings";
import { Money, PageHeader, Pagination, Stage, th, td } from "@/components/crm/bits";
import { FilterBar, SortHeader } from "@/components/crm/filter-bar";
import { Badge, EmptyState } from "@/components/ui";
import { buttonVariants } from "@/components/ui/variants";
import { term } from "@/lib/nav";
import { fmtDate, titleCase } from "@/lib/utils";
import { NewOpportunityButton } from "../contacts/client";

export const metadata = { title: "Opportunities" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function OppsPage(props: PageProps<"/opportunities">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "opportunities", "view")) return <Forbidden />;
  const sp = await props.searchParams;
  const [data, lookups, companies, contacts, views] = await Promise.all([
    listOpportunities(ctx, { q: one(sp.q), pipeline: one(sp.pipeline), owner: one(sp.owner), status: one(sp.status), risk: one(sp.risk), closing: one(sp.closing), stale: one(sp.stale), sort: one(sp.sort), dir: one(sp.dir), page: Number(one(sp.page) ?? 1), per: 50 }),
    getLookups(ctx), listCompanies(ctx, { per: 200 }), listContacts(ctx, { per: 200 }), listViews(ctx, "opportunities"),
  ]);
  return (
    <div className="pb-10">
      <PageHeader title={term(ctx.org.terminology, "opportunities", "Opportunities")} description={`${data.total} deals`} actions={<>
        <Link href="/pipeline" className={buttonVariants({ variant: "secondary", size: "sm" })}><KanbanSquare />Kanban</Link>
        {can(ctx.role, "opportunities", "export") && <a href="/api/export/opportunities" className={buttonVariants({ variant: "secondary", size: "sm" })}><Download />Export CSV</a>}
        {can(ctx.role, "opportunities", "create") && <NewOpportunityButton lookups={lookups} companies={companies.rows.map((c) => ({ id: c.id, name: c.name }))} contacts={contacts.rows.map((c) => ({ id: c.id, full_name: c.full_name, company_id: c.company_id }))} canAssign={can(ctx.role, "opportunities", "assign")} currency={ctx.org.currency} autoOpen={one(sp.create) === "1"} />}
      </>} />
      <FilterBar entity="opportunities" views={views} userId={ctx.userId} canShare={["owner", "admin", "manager"].includes(ctx.role)} searchPlaceholder="Deal or company…" filters={[
        { key: "status", label: "Status", options: [{ value: "open", label: "Open" }, { value: "won", label: "Won" }, { value: "lost", label: "Lost" }] },
        { key: "pipeline", label: "Pipeline", options: lookups.pipelines.map((p) => ({ value: p.id, label: p.name })) },
        ...(ctx.role !== "rep" ? [{ key: "owner", label: "Owner", options: [{ value: "me", label: "Me" }, ...lookups.users.map((u) => ({ value: u.id, label: u.name }))] }] : []),
        { key: "closing", label: "Close date", options: [{ value: "30", label: "Next 30 days" }, { value: "overdue", label: "Past close date" }] },
        { key: "stale", label: "Health", options: [{ value: "1", label: "No activity 7+ days" }, { value: "no_next", label: "No next action" }] },
        { key: "risk", label: "Risk", options: ["low", "medium", "high"].map((r) => ({ value: r, label: titleCase(r) })) },
      ]} />
      <div className="mx-4 overflow-hidden rounded-xl border border-line bg-white shadow-card sm:mx-6">
        {data.rows.length === 0 ? <EmptyState icon={<Briefcase />} title="No opportunities match" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[1000px] border-separate border-spacing-0">
            <thead><tr><th className={th}><SortHeader k="name" label="Opportunity" /></th><th className={th}><SortHeader k="stage" label="Stage" /></th><th className={`${th} text-right`}><SortHeader k="value" label="Value" /></th><th className={`${th} text-right`}>Weighted</th><th className={th}><SortHeader k="close" label="Close date" /></th><th className={th}>Owner</th><th className={th}>Forecast</th><th className={th}>Next action</th></tr></thead>
            <tbody>{data.rows.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50/80">
                <td className={td}><Link href={`/opportunities/${o.id}`} className="font-medium hover:text-brand-600">{o.name}</Link><p className="text-xs text-muted">{o.company_name ?? "—"}</p></td>
                <td className={td}><Stage name={o.stage_name} color={o.stage_color} /> <span className="text-xs text-muted">{o.probability}%</span></td>
                <td className={`${td} text-right font-medium`}><Money value={o.value} currency={o.currency} /></td>
                <td className={`${td} text-right text-muted`}><Money value={o.weighted_value} currency={o.currency} /></td>
                <td className={`${td} ${o.status === "open" && o.expected_close_date && new Date(o.expected_close_date) < new Date() ? "font-medium text-red-600" : ""}`}>{fmtDate(o.expected_close_date)}</td>
                <td className={td}>{o.owner_name ?? "—"}</td>
                <td className={td}><Badge tone={o.forecast_category === "closed_won" ? "green" : o.forecast_category === "closed_lost" ? "red" : o.forecast_category === "commit" ? "blue" : "slate"}>{titleCase(o.forecast_category)}</Badge></td>
                <td className={`${td} max-w-[220px] truncate`}>{o.next_action ?? <span className="text-amber-700">None</span>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        <Pagination page={data.page} per={data.per} total={data.total} basePath="/opportunities" params={sp} />
      </div>
    </div>
  );
}
