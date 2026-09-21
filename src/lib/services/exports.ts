import "server-only";
import Papa from "papaparse";
import { withTenant } from "../db";
import type { Ctx } from "../types";
import { assertCan, ForbiddenError, can, redact } from "../rbac";
import { buildLeadWhere, type LeadFilters } from "./leads";
import { audit } from "./journal";

/** Neutralise spreadsheet formula injection. */
export function safeCell(v: unknown): string {
  if (v == null) return "";
  let s = Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

const QUERIES: Record<string, { module: "leads" | "contacts" | "companies" | "opportunities" | "tasks" | "activities"; sql: string }> = {
  contacts: { module: "contacts", sql: `select x.first_name, x.last_name, x.job_title, x.email, x.phone, x.mobile, x.whatsapp, c.name company, x.country, x.city, x.decision_role, x.preferred_channel, x.consent_status, u.name owner, x.tags, x.created_at
      from contacts x left join companies c on c.id = x.company_id left join users u on u.id = x.owner_id where x.org_id = $1 and x.archived_at is null order by x.full_name` },
  companies: { module: "companies", sql: `select c.name, c.domain, c.website, c.industry, c.company_size, c.revenue_range, c.country, c.city, c.client_status, c.health, u.name owner, c.active_services, c.tags, c.created_at
      from companies c left join users u on u.id = c.owner_id where c.org_id = $1 and c.archived_at is null order by c.name` },
  opportunities: { module: "opportunities", sql: `select o.name, c.name company, ct.full_name contact, u.name owner, p.name pipeline, s.name stage, o.status, o.value, o.currency, o.probability, o.weighted_value,
      o.expected_close_date, o.forecast_category, o.risk_level, o.services, src.name source, o.lost_reason, o.won_at, o.next_action, o.created_at
      from opportunities o join pipelines p on p.id = o.pipeline_id join pipeline_stages s on s.id = o.stage_id left join companies c on c.id = o.company_id left join contacts ct on ct.id = o.contact_id
      left join users u on u.id = o.owner_id left join lead_sources src on src.id = o.source_id where o.org_id = $1 and o.archived_at is null order by o.created_at desc` },
  tasks: { module: "tasks", sql: `select t.title, t.status, t.priority, t.due_at, u.name owner, t.outcome, t.completed_at, t.created_at from tasks t left join users u on u.id = t.owner_id where t.org_id = $1 order by t.due_at nulls last` },
  activities: { module: "activities", sql: `select a.type, a.subject, a.outcome, a.direction, a.duration_min, a.occurred_at, u.name owner, coalesce(o.name, l.full_name, ct.full_name, c.name) related
      from activities a left join users u on u.id = a.owner_id left join opportunities o on o.id = a.opportunity_id left join leads l on l.id = a.lead_id left join contacts ct on ct.id = a.contact_id left join companies c on c.id = a.company_id
      where a.org_id = $1 order by a.occurred_at desc` },
};

export async function exportCsv(ctx: Ctx, entity: string, filters: LeadFilters): Promise<{ filename: string; csv: string; count: number }> {
  if (!can(ctx.role, "export", "export") && !can(ctx.role, entity as "leads", "export")) throw new ForbiddenError("You do not have export permission.");
  return withTenant(ctx, async (db) => {
    let rows: Record<string, unknown>[];
    if (entity === "leads") {
      assertCan(ctx.role, "leads", "view");
      const { where, params } = buildLeadWhere(ctx, filters);
      rows = await db.many(`select l.full_name, l.first_name, l.last_name, l.job_title, l.company_name, l.email, l.phone, l.whatsapp, l.country, l.city, l.website, l.linkedin_url, l.industry, l.company_size,
          l.estimated_budget, l.expected_value, l.currency, l.services, s.name source, c.name campaign, u.name owner, u.email owner_email, l.status, l.score, l.priority, l.timeframe,
          l.last_contacted_at, l.next_follow_up_at, l.consent_status, l.tags, l.notes, l.created_at
        from leads l left join users u on u.id = l.owner_id left join lead_sources s on s.id = l.source_id left join campaigns c on c.id = l.campaign_id where ${where} order by l.created_at desc limit 50000`, params);
    } else {
      const q = QUERIES[entity];
      if (!q) throw new ForbiddenError("Unknown export type.");
      assertCan(ctx.role, q.module, "view");
      rows = (await db.many(q.sql + " limit 50000", [ctx.orgId])).map((r) => redact(ctx.role, q.module, r));
    }
    const csv = Papa.unparse(rows.length ? { fields: Object.keys(rows[0]!), data: rows.map((r) => Object.values(r).map(safeCell)) } : { fields: ["no_records"], data: [] });
    await audit(db, ctx, "export", "export", null, { entity, count: rows.length, filters });
    return { filename: `${entity}-${new Date().toISOString().slice(0, 10)}.csv`, csv: "﻿" + csv, count: rows.length };
  });
}
