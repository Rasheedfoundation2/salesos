import Link from "next/link";
import { AlertTriangle, Flame } from "lucide-react";
import { Card, CardHeader, Badge, Avatar } from "@/components/ui";
import { Stat, Score, LeadStatus } from "@/components/crm/bits";
import { HBar, StageFunnel, Trend } from "@/components/charts";
import type { DashboardData } from "@/lib/services/dashboard";
import { money, relTime } from "@/lib/utils";
import { ACTIVITY_LABELS } from "@/lib/constants";

type Variant = "executive" | "manager" | "rep" | "marketing" | "finance";

export function DashboardView({ d, currency, variant, drill }: { d: DashboardData; currency: string; variant: Variant; drill: (path: string) => string }) {
  const k = d.kpi; const m = (v: number) => money(v, currency, v >= 100_000);
  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
  const targetPct = k.target ? Math.round((100 * k.revenue_won) / k.target) : null;
  return (
    <div className="space-y-4">
      {variant !== "marketing" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Link href={drill("/opportunities?status=open")}><Stat label="Pipeline value" value={m(k.pipeline_value)} sub={`${k.open_deals} open deals`} /></Link>
          <Stat label="Weighted pipeline" value={m(k.weighted_value)} sub="Value × stage probability" />
          <Link href={drill("/opportunities?status=won")}><Stat label="Revenue won" value={m(k.revenue_won)} sub={`${k.deals_won} deals`} tone="good" /></Link>
          <Stat label="Forecast (period)" value={m(k.forecast)} sub="Won + weighted closing" />
          <Stat label="Win rate" value={pct(k.win_rate)} sub={`${k.deals_won} won · ${k.deals_lost} lost`} />
          <Stat label="Avg deal · cycle" value={m(k.avg_deal)} sub={`${k.avg_cycle_days} days to close`} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Link href={drill("/leads")}><Stat label="New leads" value={k.new_leads} sub={`${k.qualified} qualified`} /></Link>
        <Stat label="Lead → opportunity" value={pct(k.lead_to_opp)} sub={`${k.converted} converted`} />
        <Stat label="Avg first response" value={k.avg_response_min == null ? "—" : k.avg_response_min < 120 ? `${k.avg_response_min} min` : `${Math.round(k.avg_response_min / 60)} h`} sub={k.sla_met_pct == null ? "SLA: no data" : `SLA met ${k.sla_met_pct}%`} />
        <Link href={drill("/leads?follow_up=sla_breached")}><Stat label="SLA breached" value={k.sla_breached} tone={k.sla_breached ? "bad" : undefined} sub="Uncontacted, past due" /></Link>
        <Link href={drill("/tasks?view=overdue")}><Stat label="Overdue tasks" value={k.overdue_tasks} tone={k.overdue_tasks ? "warn" : undefined} sub={`${k.due_today} due today`} /></Link>
        <Link href={drill("/opportunities?stale=1")}><Stat label="Deals at risk" value={k.at_risk} tone={k.at_risk ? "warn" : undefined} sub={`${k.no_next_action} without next action`} /></Link>
      </div>

      {(variant === "rep" || variant === "manager" || variant === "executive") && k.target != null && (
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm"><span className="font-medium">{variant === "rep" ? "My monthly target" : "Team monthly target"}</span><span className="tabular text-muted">{m(k.revenue_won)} of {m(k.target)}</span></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, targetPct ?? 0)}%` }} /></div>
          <p className="mt-1 text-xs text-muted">{targetPct}% achieved</p>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {variant !== "marketing" && <Card><CardHeader title="Revenue trend" description="Revenue won (bars) vs pipeline created (line), last 6 months" /><div className="p-3"><Trend data={d.trend} currency={currency} /></div></Card>}
        {variant !== "marketing" && <Card><CardHeader title="Pipeline by stage" description="Open deals in the selected pipeline" /><div className="p-3"><StageFunnel data={d.byStage} currency={currency} /></div></Card>}
        {(variant === "marketing" || variant === "executive") && <Card><CardHeader title="Leads by source" description="New leads in period (count)" /><div className="p-3"><HBar data={d.leadsBySource.map((x) => ({ label: x.label, value: x.count }))} count color="#6366f1" /></div></Card>}
        {variant !== "rep" && <Card><CardHeader title="Revenue by source" description="Won in period" /><div className="p-3"><HBar data={d.bySource} currency={currency} color="#16a34a" /></div></Card>}
        {(variant === "executive" || variant === "finance") && <Card><CardHeader title="Revenue by service" /><div className="p-3"><HBar data={d.byService} currency={currency} color="#0ea5e9" /></div></Card>}
        {variant !== "marketing" && variant !== "rep" && <Card><CardHeader title="Lost reasons" description="Closed lost in period" /><div className="p-3"><HBar data={d.lostReasons.map((x) => ({ label: x.label, value: x.count }))} count color="#dc2626" /></div></Card>}
      </div>

      {(variant === "manager" || variant === "executive") && (
        <Card>
          <CardHeader title="Team leaderboard" description="Won revenue, pipeline, activity and target progress in the period" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wide text-muted"><th className="px-4 py-2">Rep</th><th className="px-3 py-2 text-right">Won</th><th className="px-3 py-2 text-right">Deals won / lost</th><th className="px-3 py-2 text-right">Open pipeline</th><th className="px-3 py-2 text-right">Activities</th><th className="px-4 py-2">Target</th></tr></thead>
              <tbody>{d.byOwner.map((o) => { const t = o.target ? Math.round((100 * o.won) / o.target) : null; return (
                <tr key={o.user_id} className="border-b border-line/70">
                  <td className="px-4 py-2"><Link href={drill(`/opportunities?owner=${o.user_id}`)} className="flex items-center gap-2 hover:text-brand-600"><Avatar name={o.label} className="size-6 text-[10px]" />{o.label}</Link></td>
                  <td className="tabular px-3 py-2 text-right font-medium">{money(o.won, currency)}</td>
                  <td className="tabular px-3 py-2 text-right">{o.deals_won} / {o.lost}</td>
                  <td className="tabular px-3 py-2 text-right">{money(o.pipeline, currency)} <span className="text-muted">({o.open_deals})</span></td>
                  <td className="tabular px-3 py-2 text-right">{o.activities}</td>
                  <td className="px-4 py-2">{t == null ? <span className="text-muted">No target</span> : <div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, t)}%` }} /></div><span className="tabular text-xs">{t}%</span></div>}</td>
                </tr>); })}</tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {variant !== "marketing" && variant !== "finance" && (
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-500" />Deals needing attention</span>} />
            {d.atRisk.length === 0 ? <p className="p-6 text-center text-sm text-muted">No at-risk deals. 👏</p> : (
              <ul className="divide-y divide-line">{d.atRisk.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0"><Link href={`/opportunities/${o.id}`} className="font-medium hover:text-brand-600">{o.name}</Link><p className="text-xs text-muted">{o.stage} · {o.owner_name ?? "Unassigned"}</p></div>
                  <div className="shrink-0 text-right"><p className="tabular font-medium">{money(o.value, o.currency)}</p><Badge tone="amber">{o.reason}</Badge></div>
                </li>))}</ul>
            )}
          </Card>
        )}
        {variant !== "finance" && (
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Flame className="size-4 text-red-500" />Leads to work now</span>} description="Highest-scoring leads not yet contacted" />
            {d.hotLeads.length === 0 ? <p className="p-6 text-center text-sm text-muted">Every lead has been contacted.</p> : (
              <ul className="divide-y divide-line">{d.hotLeads.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0"><Link href={`/leads/${l.id}`} className="font-medium hover:text-brand-600">{l.full_name}</Link><p className="truncate text-xs text-muted">{l.company_name ?? "—"} · {l.owner_name ?? "Unassigned"} · {relTime(l.created_at)}</p></div>
                  <div className="flex shrink-0 items-center gap-2"><LeadStatus status={l.status} /><Score score={l.score} /></div>
                </li>))}</ul>
            )}
          </Card>
        )}
      </div>
      {variant === "manager" && d.activityMix.length > 0 && (
        <Card><CardHeader title="Activities completed" description="Logged in the period, by type" /><div className="p-3"><HBar data={d.activityMix.map((a) => ({ label: ACTIVITY_LABELS[a.label] ?? a.label, value: a.count }))} count color="#8b5cf6" /></div></Card>
      )}
    </div>
  );
}
