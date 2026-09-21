import { Forbidden } from "@/components/forbidden";
import Link from "next/link";
import { Download, Upload } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { listLeads } from "@/lib/services/leads";
import { getLookups } from "@/lib/services/lookups";
import { listViews } from "@/lib/services/settings";
import { term } from "@/lib/nav";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, PRIORITIES } from "@/lib/constants";
import { PageHeader, Pagination } from "@/components/crm/bits";
import { FilterBar } from "@/components/crm/filter-bar";
import { buttonVariants } from "@/components/ui/variants";
import { titleCase } from "@/lib/utils";
import { LeadsTable, NewLeadButton } from "./table";

export const metadata = { title: "Leads" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LeadsPage(props: PageProps<"/leads">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "leads", "view")) return <Forbidden />;
  const sp = await props.searchParams;
  const status = one(sp.status);
  const [data, lookups, views] = await Promise.all([
    listLeads(ctx, {
      q: one(sp.q), status: status ? [status] : undefined, owner: one(sp.owner), source: one(sp.source), priority: one(sp.priority), category: one(sp.category),
      followUp: one(sp.follow_up), tag: one(sp.tag), campaign: one(sp.campaign), archived: one(sp.archived), sort: one(sp.sort), dir: one(sp.dir), page: Number(one(sp.page) ?? 1),
    }),
    getLookups(ctx), listViews(ctx, "leads"),
  ]);
  const label = term(ctx.org.terminology, "leads", "Leads");
  const canAssign = can(ctx.role, "leads", "assign");
  const exportQs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (v == null ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x] as [string, string])))).toString();
  return (
    <div>
      <PageHeader title={label} description={`${data.total.toLocaleString("en-GB")} ${label.toLowerCase()} match the current view`}
        actions={<>
          {can(ctx.role, "leads", "export") && <a href={`/api/export/leads?${exportQs}`} className={buttonVariants({ variant: "secondary", size: "sm" })}><Download />Export CSV</a>}
          {can(ctx.role, "import", "import") && <Link href="/leads/import" className={buttonVariants({ variant: "secondary", size: "sm" })}><Upload />Import</Link>}
          {can(ctx.role, "leads", "create") && <NewLeadButton lookups={lookups} canAssign={canAssign} currency={ctx.org.currency} autoOpen={one(sp.create) === "1"} />}
        </>} />
      <FilterBar entity="leads" views={views} userId={ctx.userId} canShare={["owner", "admin", "manager"].includes(ctx.role)} searchPlaceholder="Name, company, email, phone…"
        filters={[
          { key: "status", label: "Status", options: LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s]! })) },
          ...(ctx.role !== "rep" ? [{ key: "owner", label: "Owner", options: [{ value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }, ...lookups.users.map((u) => ({ value: u.id, label: u.name }))] }] : []),
          { key: "source", label: "Source", options: lookups.sources.map((s) => ({ value: s.id, label: s.name })) },
          { key: "category", label: "Score", options: [{ value: "hot", label: "Hot (80+)" }, { value: "warm", label: "Warm (60–79)" }, { value: "nurture", label: "Nurture (40–59)" }, { value: "low", label: "Low (<40)" }] },
          { key: "priority", label: "Priority", options: PRIORITIES.map((p) => ({ value: p, label: titleCase(p) })) },
          { key: "follow_up", label: "Follow-up", options: [{ value: "overdue", label: "Overdue" }, { value: "today", label: "Due today" }, { value: "none", label: "No next action" }, { value: "sla_breached", label: "SLA breached" }] },
          ...(can(ctx.role, "leads", "archive") ? [{ key: "archived", label: "Archived", options: [{ value: "1", label: "Show archived" }] }] : []),
        ]} />
      <div className="mx-4 overflow-hidden rounded-xl border border-line bg-white shadow-card sm:mx-6">
        <LeadsTable rows={data.rows} users={lookups.users} canAssign={canAssign} canArchive={can(ctx.role, "leads", "archive")} canEdit={can(ctx.role, "leads", "edit")} archived={one(sp.archived) === "1"} />
        <Pagination page={data.page} per={data.per} total={data.total} basePath="/leads" params={sp} />
      </div>
      <div className="h-8" />
    </div>
  );
}
