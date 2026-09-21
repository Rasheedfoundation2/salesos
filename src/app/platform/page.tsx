import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/context";
import { platformHealth, platformOrganisations } from "@/lib/services/settings";
import { Badge, Card, CardHeader } from "@/components/ui";
import { Stat } from "@/components/crm/bits";
import { Logo } from "@/components/logo";
import { fmtDate, relTime } from "@/lib/utils";
import { OrgControls } from "./client";

export const metadata = { title: "Platform admin" };

export default async function PlatformPage() {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  if (!su.is_platform_admin) redirect("/home");
  const [orgs, health] = await Promise.all([platformOrganisations(true), platformHealth(true)]);
  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center gap-3 bg-navy-900 px-6 text-white"><Logo className="size-7" /><span className="font-semibold">SalesOS Platform Administration</span><Link href="/home" className="ml-auto text-sm text-slate-300 hover:text-white">Back to app</Link></header>
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Organisations" value={orgs.length} /><Stat label="Active" value={orgs.filter((o) => o.status === "active").length} /><Stat label="Suspended" value={orgs.filter((o) => o.status === "suspended").length} tone={orgs.some((o) => o.status === "suspended") ? "warn" : undefined} />
          <Stat label="Active sessions" value={health.sessions} /><Stat label="DB latency" value={`${health.latency_ms} ms`} sub={`DB size ${health.size} · ${health.events_pending} events queued`} tone="good" />
        </div>
        <Card><CardHeader title="Organisations" description="Tenant data is never shown here — only usage metadata." />
          <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr className="border-b border-line text-left text-[11.5px] uppercase text-muted"><th className="px-4 py-2">Organisation</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Users</th><th className="px-3 py-2 text-right">Leads</th><th className="px-3 py-2 text-right">Deals</th><th className="px-3 py-2">Last activity</th><th className="px-3 py-2" /></tr></thead>
            <tbody>{orgs.map((o) => <tr key={o.id} className="border-b border-line/70"><td className="px-4 py-2"><p className="font-medium">{o.name}</p><p className="text-xs text-muted">{o.slug} · since {fmtDate(o.created_at)}</p></td><td className="px-3 py-2">{o.plan_code}</td><td className="px-3 py-2"><Badge tone={o.status === "active" ? "green" : "red"}>{o.status}</Badge></td><td className="tabular px-3 py-2 text-right">{o.users}</td><td className="tabular px-3 py-2 text-right">{o.leads}</td><td className="tabular px-3 py-2 text-right">{o.opps}</td><td className="px-3 py-2 text-muted">{o.last_activity ? relTime(o.last_activity) : "—"}</td><td className="px-3 py-2"><OrgControls id={o.id} status={o.status} plan={o.plan_code} /></td></tr>)}</tbody></table></div>
        </Card>
      </div>
    </div>
  );
}
