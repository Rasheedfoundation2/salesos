import "server-only";
import { withTenant } from "../db";
import type { Ctx } from "../types";

export interface DashFilters { from: string; to: string; owner?: string; pipeline?: string; source?: string; team?: string }

export function periodRange(preset?: string, from?: string, to?: string): { from: string; to: string; label: string } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const y = now.getFullYear(), m = now.getMonth();
  switch (preset) {
    case "custom": if (from && to) return { from, to, label: `${from} – ${to}` }; break;
    case "last_month": return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)), label: "Last month" };
    case "quarter": { const q = Math.floor(m / 3) * 3; return { from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)), label: "This quarter" }; }
    case "last_90": return { from: iso(new Date(y, m, now.getDate() - 89)), to: iso(now), label: "Last 90 days" };
    case "year": return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)), label: "This year" };
  }
  return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)), label: "This month" };
}

/** All dashboard figures come from live database queries; values are converted to the organisation's base currency. */
export async function dashboardData(ctx: Ctx, f: DashFilters) {
  return withTenant(ctx, async (db) => {
    const p: unknown[] = [ctx.orgId, f.from, f.to];
    // $2/$3 (period) are referenced in every filter so each query can share one parameter list.
    const oppW = ["o.org_id = $1", "o.archived_at is null", "$2::date <= $3::date"]; const leadW = ["l.org_id = $1", "l.archived_at is null", "$2::date <= $3::date"];
    if (f.owner) { p.push(f.owner === "me" ? ctx.userId : f.owner); oppW.push(`o.owner_id = $${p.length}`); leadW.push(`l.owner_id = $${p.length}`); }
    if (f.pipeline) { p.push(f.pipeline); oppW.push(`o.pipeline_id = $${p.length}`); }
    if (f.source) { p.push(f.source); oppW.push(`o.source_id = $${p.length}`); leadW.push(`l.source_id = $${p.length}`); }
    if (f.team) { p.push(f.team); oppW.push(`o.owner_id in (select user_id from memberships where team_id = $${p.length})`); leadW.push(`l.owner_id in (select user_id from memberships where team_id = $${p.length})`); }
    const OW = oppW.join(" and "), LW = leadW.join(" and ");
    const V = "o.value * coalesce(fx.rate_to_base, 1)";
    const FX = "left join fx_rates fx on fx.org_id = o.org_id and fx.currency = o.currency";
    const inP = (col: string) => `${col} >= $2::date and ${col} < $3::date + 1`;

    const kpi = await db.one<Record<string, string | number | null>>(`
      select
        coalesce(sum(${V}) filter (where o.status = 'open'), 0) pipeline_value,
        coalesce(sum(${V} * o.probability / 100.0) filter (where o.status = 'open'), 0) weighted_value,
        count(*) filter (where o.status = 'open')::int open_deals,
        coalesce(sum(${V}) filter (where o.status = 'won' and ${inP("o.won_at")}), 0) revenue_won,
        count(*) filter (where o.status = 'won' and ${inP("o.won_at")})::int deals_won,
        count(*) filter (where o.status = 'lost' and ${inP("o.closed_at")})::int deals_lost,
        coalesce(avg(${V}) filter (where o.status = 'won' and ${inP("o.won_at")}), 0) avg_deal,
        coalesce(avg(extract(epoch from (o.won_at - o.created_at)) / 86400) filter (where o.status = 'won' and ${inP("o.won_at")}), 0) avg_cycle_days,
        coalesce(sum(${V} * o.probability / 100.0) filter (where o.status = 'open' and o.expected_close_date between $2::date and $3::date), 0) forecast_open,
        count(*) filter (where o.status = 'open' and (o.risk_level = 'high' or o.expected_close_date < current_date or coalesce(o.last_activity_at, o.created_at) < now() - interval '14 days'))::int at_risk,
        count(*) filter (where o.status = 'open' and o.next_action is null)::int no_next_action,
        count(*) filter (where ${inP("o.created_at")})::int opps_created
      from opportunities o ${FX} where ${OW}`, p);

    const leads = await db.one<Record<string, number | null>>(`
      select count(*) filter (where ${inP("l.created_at")})::int new_leads,
             count(*) filter (where ${inP("l.created_at")} and l.status in ('qualified','converted'))::int qualified,
             count(*) filter (where ${inP("l.created_at")} and l.status = 'converted')::int converted,
             count(*) filter (where l.status = 'unassigned' or l.owner_id is null)::int unassigned,
             count(*) filter (where l.score >= 80 and l.status in ('new','researching','attempting_contact'))::int hot_uncontacted,
             count(*) filter (where l.first_contacted_at is null and l.first_response_due_at < now() and l.status not in ('converted','unqualified','do_not_contact','nurturing'))::int sla_breached,
             round(avg(greatest(0, extract(epoch from (l.first_contacted_at - l.created_at))) / 60) filter (where l.first_contacted_at is not null and ${inP("l.created_at")}))::int avg_response_min,
             round(100.0 * count(*) filter (where l.first_contacted_at is not null and l.first_contacted_at <= l.first_response_due_at and ${inP("l.created_at")})
                   / nullif(count(*) filter (where l.first_contacted_at is not null and ${inP("l.created_at")}), 0))::int sla_met_pct
        from leads l where ${LW}`, p);

    const tasks = await db.one<{ overdue: number; due_today: number }>(`
      select count(*) filter (where t.due_at < now())::int overdue,
             count(*) filter (where t.due_at::date = (now() at time zone 'Asia/Dubai')::date)::int due_today
        from tasks t where t.org_id = $1 and t.status in ('todo','in_progress','waiting') ${f.owner ? `and t.owner_id = $2` : ""}`, f.owner ? [ctx.orgId, f.owner === "me" ? ctx.userId : f.owner] : [ctx.orgId]);

    const bySource = await db.many<{ label: string; value: number; count: number }>(`
      select coalesce(s.name, 'Unknown') label, coalesce(sum(${V}),0)::float value, count(*)::int count from opportunities o ${FX} left join lead_sources s on s.id = o.source_id
       where ${OW} and o.status = 'won' and ${inP("o.won_at")} group by 1 order by 2 desc limit 8`, p);
    const leadsBySource = await db.many<{ label: string; count: number; converted: number }>(`
      select coalesce(s.name, 'Unknown') label, count(*)::int count, count(*) filter (where l.status = 'converted')::int converted from leads l left join lead_sources s on s.id = l.source_id
       where ${LW} and ${inP("l.created_at")} group by 1 order by 2 desc limit 8`, p);
    const byService = await db.many<{ label: string; value: number }>(`
      select svc label, coalesce(sum(${V} / greatest(cardinality(o.services),1)),0)::float value from opportunities o ${FX}, unnest(case when cardinality(o.services) = 0 then array['Unspecified'] else o.services end) svc
       where ${OW} and o.status = 'won' and ${inP("o.won_at")} group by 1 order by 2 desc limit 8`, p);
    const byOwner = await db.many<{ user_id: string; label: string; won: number; deals_won: number; pipeline: number; open_deals: number; activities: number; target: number | null; lost: number }>(`
      select u.id user_id, u.name label,
        coalesce(sum(${V}) filter (where o.status = 'won' and ${inP("o.won_at")}),0)::float won,
        count(o.id) filter (where o.status = 'won' and ${inP("o.won_at")})::int deals_won,
        count(o.id) filter (where o.status = 'lost' and ${inP("o.closed_at")})::int lost,
        coalesce(sum(${V}) filter (where o.status = 'open'),0)::float pipeline,
        count(o.id) filter (where o.status = 'open')::int open_deals,
        (select count(*)::int from activities a where a.owner_id = u.id and a.org_id = $1 and ${inP("a.occurred_at")}) activities,
        m.monthly_target::float target
      from memberships m join users u on u.id = m.user_id left join opportunities o on o.owner_id = u.id and ${OW.replaceAll("o.org_id = $1", "o.org_id = m.org_id")} left join fx_rates fx on fx.org_id = o.org_id and fx.currency = o.currency
      where m.org_id = $1 and m.status = 'active' and m.role in ('owner','manager','rep') ${f.owner ? `and u.id = $4` : ""}
      group by u.id, u.name, m.monthly_target order by won desc, pipeline desc`, p);
    const byStage = await db.many<{ id: string; label: string; color: string; value: number; count: number; weighted: number; stale: number }>(`
      select s.id, s.name label, s.color, coalesce(sum(${V}),0)::float value, count(o.id)::int count, coalesce(sum(${V} * s.probability / 100.0),0)::float weighted,
             count(o.id) filter (where s.max_days is not null and o.stage_entered_at < now() - make_interval(days => s.max_days))::int stale
        from pipeline_stages s join pipelines pl on pl.id = s.pipeline_id
        left join opportunities o on o.stage_id = s.id and o.status = 'open' and ${OW.replaceAll("o.org_id = $1", "o.org_id = s.org_id")} left join fx_rates fx on fx.org_id = o.org_id and fx.currency = o.currency
       where s.org_id = $1 and s.kind in ('open') and pl.id = coalesce(${f.pipeline ? `$${p.indexOf(f.pipeline) + 1}::uuid` : "null"}, (select id from pipelines where org_id = $1 and is_default limit 1))
       group by s.id, s.name, s.color, s.position order by s.position`, p);
    const lostReasons = await db.many<{ label: string; count: number; value: number }>(`
      select coalesce(o.lost_reason, 'Unspecified') label, count(*)::int count, coalesce(sum(${V}),0)::float value from opportunities o ${FX}
       where ${OW} and o.status = 'lost' and ${inP("o.closed_at")} group by 1 order by 2 desc`, p);
    const trend = await db.many<{ month: string; won: number; created: number }>(`
      select to_char(m, 'Mon YY') as month,
        coalesce((select sum(${V}) from opportunities o ${FX} where ${OW} and o.status = 'won' and date_trunc('month', o.won_at) = m), 0)::float won,
        coalesce((select sum(${V}) from opportunities o ${FX} where ${OW} and date_trunc('month', o.created_at) = m), 0)::float created
      from generate_series(date_trunc('month', $3::date) - interval '5 months', date_trunc('month', $3::date), interval '1 month') m order by m`, p);
    const activityMix = await db.many<{ label: string; count: number }>(`
      select a.type label, count(*)::int count from activities a where a.org_id = $1 and ${inP("a.occurred_at")} ${f.owner ? `and a.owner_id = $4` : ""} group by 1 order by 2 desc`,
      f.owner ? [ctx.orgId, f.from, f.to, f.owner === "me" ? ctx.userId : f.owner] : [ctx.orgId, f.from, f.to]);
    const atRisk = await db.many<{ id: string; name: string; owner_name: string | null; value: number; currency: string; stage: string; reason: string }>(`
      select o.id, o.name, u.name owner_name, o.value::float value, o.currency, s.name stage,
        case when o.expected_close_date < current_date then 'Close date passed'
             when coalesce(o.last_activity_at, o.created_at) < now() - interval '14 days' then 'No activity for 14+ days'
             when s.max_days is not null and o.stage_entered_at < now() - make_interval(days => s.max_days) then 'Stuck in stage'
             when o.next_action is null then 'No next action'
             else 'Marked high risk' end reason
        from opportunities o join pipeline_stages s on s.id = o.stage_id left join users u on u.id = o.owner_id ${FX}
       where ${OW} and o.status = 'open' and (o.risk_level = 'high' or o.expected_close_date < current_date or coalesce(o.last_activity_at, o.created_at) < now() - interval '14 days'
             or o.next_action is null or (s.max_days is not null and o.stage_entered_at < now() - make_interval(days => s.max_days)))
       order by ${V} desc nulls last limit 8`, p);
    const hotLeads = await db.many<{ id: string; full_name: string; company_name: string | null; score: number; owner_name: string | null; created_at: string; first_response_due_at: string | null; status: string }>(`
      select l.id, l.full_name, l.company_name, l.score, u.name owner_name, l.created_at, l.first_response_due_at, l.status from leads l left join users u on u.id = l.owner_id
       where ${LW} and l.status in ('new','unassigned','researching','attempting_contact') order by l.score desc, l.created_at desc limit 8`, p);
    const targets = await db.one<{ target: number | null }>(`select sum(monthly_target)::float target from memberships where org_id = $1 and status = 'active' ${f.owner ? "and user_id = $2" : ""}`,
      f.owner ? [ctx.orgId, f.owner === "me" ? ctx.userId : f.owner] : [ctx.orgId]);

    const won = Number(kpi?.deals_won ?? 0), lost = Number(kpi?.deals_lost ?? 0);
    return {
      kpi: {
        pipeline_value: Number(kpi?.pipeline_value ?? 0), weighted_value: Number(kpi?.weighted_value ?? 0), open_deals: Number(kpi?.open_deals ?? 0),
        revenue_won: Number(kpi?.revenue_won ?? 0), deals_won: won, deals_lost: lost, win_rate: won + lost ? Math.round((100 * won) / (won + lost)) : null,
        avg_deal: Number(kpi?.avg_deal ?? 0), avg_cycle_days: Math.round(Number(kpi?.avg_cycle_days ?? 0)),
        forecast: Number(kpi?.revenue_won ?? 0) + Number(kpi?.forecast_open ?? 0), at_risk: Number(kpi?.at_risk ?? 0), no_next_action: Number(kpi?.no_next_action ?? 0),
        opps_created: Number(kpi?.opps_created ?? 0),
        new_leads: leads?.new_leads ?? 0, qualified: leads?.qualified ?? 0, converted: leads?.converted ?? 0, unassigned: leads?.unassigned ?? 0,
        lead_to_opp: leads?.new_leads ? Math.round((100 * (leads.converted ?? 0)) / leads.new_leads) : null,
        opp_to_win: Number(kpi?.opps_created) ? Math.round((100 * won) / Number(kpi?.opps_created)) : null,
        hot_uncontacted: leads?.hot_uncontacted ?? 0, sla_breached: leads?.sla_breached ?? 0, avg_response_min: leads?.avg_response_min ?? null, sla_met_pct: leads?.sla_met_pct ?? null,
        overdue_tasks: tasks?.overdue ?? 0, due_today: tasks?.due_today ?? 0, target: targets?.target ?? null,
      },
      bySource, leadsBySource, byService, byOwner, byStage, lostReasons, trend, activityMix, atRisk, hotLeads,
    };
  });
}
export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
