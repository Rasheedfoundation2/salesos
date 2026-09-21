import Link from "next/link";
import { requireCtx } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { PageHeader, th, td } from "@/components/crm/bits";
import { Badge, EmptyState } from "@/components/ui";
import { money } from "@/lib/utils";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const ctx = await requireCtx();
  const rows = await withTenant(ctx, (db) => db.many<{ id: string; name: string; status: string; budget: string | null; currency: string; source: string | null; leads: number; qualified: number; converted: number; won_value: number }>(`
    select c.id, c.name, c.status, c.budget, c.currency, s.name source,
      (select count(*)::int from leads l where l.campaign_id = c.id and l.archived_at is null) leads,
      (select count(*)::int from leads l where l.campaign_id = c.id and l.status in ('qualified','converted')) qualified,
      (select count(*)::int from leads l where l.campaign_id = c.id and l.status = 'converted') converted,
      coalesce((select sum(o.value * coalesce(fx.rate_to_base,1)) from opportunities o left join fx_rates fx on fx.org_id = o.org_id and fx.currency = o.currency where o.campaign_id = c.id and o.status = 'won'), 0)::float won_value
    from campaigns c left join lead_sources s on s.id = c.source_id where c.org_id = $1 order by c.status, c.name`, [ctx.orgId]));
  const hideMoney = ctx.role === "rep";
  return (
    <div className="pb-10">
      <PageHeader title="Campaigns" description="Attribution from campaign to lead to revenue. Manage campaigns in Settings → Sources & campaigns." actions={["owner", "admin", "marketing"].includes(ctx.role) && <Link className="text-sm text-brand-600 hover:underline" href="/settings?section=lists">Manage campaigns →</Link>} />
      <div className="mx-4 overflow-hidden rounded-xl border border-line bg-white shadow-card sm:mx-6">
        {rows.length === 0 ? <EmptyState title="No campaigns yet" /> : <table className="w-full border-separate border-spacing-0">
          <thead><tr><th className={th}>Campaign</th><th className={th}>Source</th><th className={th}>Status</th><th className={`${th} text-right`}>Leads</th><th className={`${th} text-right`}>Qualified</th><th className={`${th} text-right`}>Converted</th>{!hideMoney && <><th className={`${th} text-right`}>Budget</th><th className={`${th} text-right`}>Revenue won</th><th className={`${th} text-right`}>Cost / lead</th></>}</tr></thead>
          <tbody>{rows.map((c) => <tr key={c.id}><td className={td}><Link className="font-medium hover:text-brand-600" href={`/leads?campaign=${c.id}`}>{c.name}</Link></td><td className={td}>{c.source ?? "—"}</td><td className={td}><Badge tone={c.status === "active" ? "green" : "slate"}>{c.status}</Badge></td>
            <td className={`${td} tabular text-right`}>{c.leads}</td><td className={`${td} tabular text-right`}>{c.qualified}</td><td className={`${td} tabular text-right`}>{c.converted}</td>
            {!hideMoney && <><td className={`${td} tabular text-right`}>{c.budget ? money(c.budget, c.currency) : "—"}</td><td className={`${td} tabular text-right`}>{money(c.won_value, ctx.org.currency)}</td><td className={`${td} tabular text-right`}>{c.budget && c.leads ? money(Number(c.budget) / c.leads, c.currency) : "—"}</td></>}</tr>)}</tbody></table>}
      </div>
    </div>
  );
}
