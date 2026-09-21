import Link from "next/link";
import { requireCtx } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { PageHeader, th, td } from "@/components/crm/bits";
import { Badge, EmptyState } from "@/components/ui";
import { money, titleCase } from "@/lib/utils";

export const metadata = { title: "Products & Services" };

export default async function ProductsPage() {
  const ctx = await requireCtx();
  const rows = await withTenant(ctx, (db) => db.many<{ id: string; name: string; category: string | null; billing_type: string; unit_price: string; currency: string; tax_rate: string; active: boolean }>("select * from products where org_id = $1 order by active desc, category, name", [ctx.orgId]));
  return (
    <div className="pb-10">
      <PageHeader title="Products & services" description="Catalogue used for opportunities today and the proposal builder in Phase 2." actions={["owner", "admin"].includes(ctx.role) && <Link className="text-sm text-brand-600 hover:underline" href="/settings?section=lists">Manage catalogue →</Link>} />
      <div className="mx-4 overflow-hidden rounded-xl border border-line bg-white shadow-card sm:mx-6">
        {rows.length === 0 ? <EmptyState title="No products yet" /> : <table className="w-full border-separate border-spacing-0">
          <thead><tr><th className={th}>Name</th><th className={th}>Category</th><th className={th}>Billing</th><th className={`${th} text-right`}>Unit price</th><th className={`${th} text-right`}>VAT</th><th className={th}>Status</th></tr></thead>
          <tbody>{rows.map((p) => <tr key={p.id}><td className={`${td} font-medium`}>{p.name}</td><td className={td}>{p.category ?? "—"}</td><td className={td}>{titleCase(p.billing_type)}</td><td className={`${td} tabular text-right`}>{money(p.unit_price, p.currency)}</td><td className={`${td} tabular text-right`}>{Number(p.tax_rate)}%</td><td className={td}><Badge tone={p.active ? "green" : "slate"}>{p.active ? "Active" : "Inactive"}</Badge></td></tr>)}</tbody></table>}
      </div>
    </div>
  );
}
