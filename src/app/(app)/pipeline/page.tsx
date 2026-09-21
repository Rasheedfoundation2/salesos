import { Forbidden } from "@/components/forbidden";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { getLookups } from "@/lib/services/lookups";
import { pipelineBoard } from "@/lib/services/opportunities";
import { listCompanies, listContacts } from "@/lib/services/accounts";
import { PageHeader } from "@/components/crm/bits";
import { FilterBar } from "@/components/crm/filter-bar";
import { money } from "@/lib/utils";
import { Board } from "./board";
import { NewOpportunityButton } from "../contacts/client";

export const metadata = { title: "Pipeline" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PipelinePage(props: PageProps<"/pipeline">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "opportunities", "view")) return <Forbidden />;
  const sp = await props.searchParams;
  const lookups = await getLookups(ctx);
  const pipeline = lookups.pipelines.find((p) => p.id === one(sp.pipeline)) ?? lookups.pipelines[0];
  if (!pipeline) return <PageHeader title="Pipeline" description="No pipeline configured. Ask an admin to create one in Settings." />;
  const [rows, companies, contacts] = await Promise.all([
    pipelineBoard(ctx, pipeline.id, { owner: one(sp.owner), q: one(sp.q), showClosed: one(sp.closed) === "1" }),
    listCompanies(ctx, { per: 200 }), listContacts(ctx, { per: 200 }),
  ]);
  const open = rows.filter((r) => r.status === "open");
  const total = open.reduce((s, r) => s + Number(r.value_base ?? 0), 0);
  const weighted = open.reduce((s, r) => s + (Number(r.value_base ?? 0) * r.probability) / 100, 0);
  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <PageHeader title={pipeline.name} description={`${open.length} open deals · ${money(total, ctx.org.currency)} total · ${money(weighted, ctx.org.currency)} weighted`}
        actions={can(ctx.role, "opportunities", "create") && <NewOpportunityButton lookups={lookups} companies={companies.rows.map((c) => ({ id: c.id, name: c.name }))} contacts={contacts.rows.map((c) => ({ id: c.id, full_name: c.full_name, company_id: c.company_id }))} defaults={{}} canAssign={can(ctx.role, "opportunities", "assign")} currency={ctx.org.currency} />} />
      <FilterBar searchPlaceholder="Search deals…" filters={[
        { key: "pipeline", label: "Pipeline", allLabel: lookups.pipelines[0]?.name, options: lookups.pipelines.slice(1).map((p) => ({ value: p.id, label: p.name })) },
        ...(ctx.role !== "rep" ? [{ key: "owner", label: "Owner", options: [{ value: "me", label: "Me" }, ...lookups.users.map((u) => ({ value: u.id, label: u.name }))] }] : []),
        { key: "closed", label: "Closed deals", allLabel: "Last 30 days", options: [{ value: "1", label: "Show all" }] },
      ]} />
      <Board stages={pipeline.stages} rows={rows} currency={ctx.org.currency} lostReasons={lookups.lostReasons} canMove={can(ctx.role, "opportunities", "edit")} role={ctx.role}
        contacts={contacts.rows.map((c) => ({ id: c.id, full_name: c.full_name, company_id: c.company_id }))} />
    </div>
  );
}
