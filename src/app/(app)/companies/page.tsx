import { Forbidden } from "@/components/forbidden";
import Link from "next/link";
import { Building2, Download } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { listCompanies } from "@/lib/services/accounts";
import { getLookups } from "@/lib/services/lookups";
import { PageHeader, Pagination, th, td, Money } from "@/components/crm/bits";
import { FilterBar } from "@/components/crm/filter-bar";
import { Badge, EmptyState } from "@/components/ui";
import { buttonVariants } from "@/components/ui/variants";
import { term } from "@/lib/nav";
import { titleCase } from "@/lib/utils";
import { NewCompanyButton } from "../contacts/client";

export const metadata = { title: "Companies" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const tone: Record<string, string> = { prospect: "blue", active_client: "green", former_client: "slate", partner: "violet" };

export default async function CompaniesPage(props: PageProps<"/companies">) {
  const ctx = await requireCtx();
  if (!can(ctx.role, "companies", "view")) return <Forbidden />;
  const sp = await props.searchParams;
  const [data, lookups] = await Promise.all([
    listCompanies(ctx, { q: one(sp.q), owner: one(sp.owner), status: one(sp.status), industry: one(sp.industry), country: one(sp.country), archived: one(sp.archived), sort: one(sp.sort), dir: one(sp.dir), page: Number(one(sp.page) ?? 1) }),
    getLookups(ctx),
  ]);
  return (
    <div className="pb-10">
      <PageHeader title={term(ctx.org.terminology, "companies", "Companies")} description={`${data.total} accounts`} actions={<>
        {can(ctx.role, "companies", "export") && <a href="/api/export/companies" className={buttonVariants({ variant: "secondary", size: "sm" })}><Download />Export CSV</a>}
        {can(ctx.role, "companies", "create") && <NewCompanyButton users={lookups.users} canAssign={can(ctx.role, "companies", "assign")} autoOpen={one(sp.create) === "1"} />}
      </>} />
      <FilterBar searchPlaceholder="Company or domain…" filters={[
        { key: "status", label: "Status", options: ["prospect", "active_client", "former_client", "partner"].map((s) => ({ value: s, label: titleCase(s) })) },
        { key: "owner", label: "Owner", options: [{ value: "me", label: "Me" }, ...lookups.users.map((u) => ({ value: u.id, label: u.name }))] },
        { key: "country", label: "Country", options: ["United Arab Emirates", "United Kingdom", "India", "Saudi Arabia"].map((c) => ({ value: c, label: c })) },
        ...(can(ctx.role, "companies", "archive") ? [{ key: "archived", label: "Archived", options: [{ value: "1", label: "Show archived" }] }] : []),
      ]} />
      <div className="mx-4 overflow-hidden rounded-xl border border-line bg-white shadow-card sm:mx-6">
        {data.rows.length === 0 ? <EmptyState icon={<Building2 />} title="No companies found" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[860px] border-separate border-spacing-0">
            <thead><tr><th className={th}>Company</th><th className={th}>Industry</th><th className={th}>Location</th><th className={th}>Status</th><th className={th}>Contacts</th><th className={th}>Open deals</th><th className={th}>Lifetime value</th><th className={th}>Owner</th></tr></thead>
            <tbody>{data.rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/80">
                <td className={td}><Link href={`/companies/${c.id}`} className="font-medium hover:text-brand-600">{c.name}</Link><p className="text-xs text-muted">{c.domain ?? ""}</p></td>
                <td className={td}>{c.industry ?? "—"}</td><td className={td}>{[c.city, c.country].filter(Boolean).join(", ") || "—"}</td>
                <td className={td}><Badge tone={tone[c.client_status]}>{titleCase(c.client_status)}</Badge>{c.health && c.health !== "healthy" && <Badge tone="amber" className="ml-1">{titleCase(c.health)}</Badge>}</td>
                <td className={`${td} tabular`}>{c.contacts}</td><td className={`${td} tabular`}>{c.open_deals}</td><td className={td}><Money value={c.ltv} currency={ctx.org.currency} /></td><td className={td}>{c.owner_name ?? "—"}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        <Pagination page={data.page} per={data.per} total={data.total} basePath="/companies" params={sp} />
      </div>
    </div>
  );
}
