import "server-only";
import { withTenant } from "../db";
import type { Ctx } from "../types";
import { can } from "../rbac";

export interface SearchHit { type: "lead" | "contact" | "company" | "opportunity" | "task" | "activity"; id: string; title: string; subtitle: string | null; href: string }

/** Universal search across CRM entities, respecting RBAC (module) and RLS (records). */
export async function universalSearch(ctx: Ctx, q: string, limit = 6): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  return withTenant(ctx, async (db) => {
    const parts: Promise<SearchHit[]>[] = [];
    const like = `%${term.replace(/[%_]/g, "\\$&")}%`;
    if (can(ctx.role, "leads")) parts.push(db.many<SearchHit>(
      `select 'lead' as type, id, full_name title, concat_ws(' · ', company_name, email, phone) subtitle, '/leads/' || id href from leads
        where org_id = $1 and archived_at is null and (search @@ plainto_tsquery('simple', $2) or full_name ilike $3 or company_name ilike $3 or email::text ilike $3 or phone ilike $3)
        order by updated_at desc limit ${limit}`, [ctx.orgId, term, like]));
    if (can(ctx.role, "contacts")) parts.push(db.many<SearchHit>(
      `select 'contact' as type, id, full_name title, concat_ws(' · ', job_title, email) subtitle, '/contacts/' || id href from contacts
        where org_id = $1 and archived_at is null and (search @@ plainto_tsquery('simple', $2) or full_name ilike $3 or email::text ilike $3 or phone ilike $3) order by updated_at desc limit ${limit}`, [ctx.orgId, term, like]));
    if (can(ctx.role, "companies")) parts.push(db.many<SearchHit>(
      `select 'company' as type, id, name title, concat_ws(' · ', industry, city, country) subtitle, '/companies/' || id href from companies
        where org_id = $1 and archived_at is null and (search @@ plainto_tsquery('simple', $2) or name ilike $3 or domain::text ilike $3) order by similarity(name, $2) desc limit ${limit}`, [ctx.orgId, term, like]));
    if (can(ctx.role, "opportunities")) parts.push(db.many<SearchHit>(
      `select 'opportunity' as type, o.id, o.name title, concat_ws(' · ', s.name, c.name) subtitle, '/opportunities/' || o.id href from opportunities o
        join pipeline_stages s on s.id = o.stage_id left join companies c on c.id = o.company_id
        where o.org_id = $1 and o.archived_at is null and (o.search @@ plainto_tsquery('simple', $2) or o.name ilike $3) order by o.updated_at desc limit ${limit}`, [ctx.orgId, term, like]));
    if (can(ctx.role, "tasks")) parts.push(db.many<SearchHit>(
      `select 'task' as type, id, title, status subtitle, '/tasks?focus=' || id href from tasks where org_id = $1 and (search @@ plainto_tsquery('simple', $2) or title ilike $3) order by created_at desc limit ${limit}`, [ctx.orgId, term, like]));
    if (can(ctx.role, "activities")) parts.push(db.many<SearchHit>(
      `select 'activity' as type, a.id, a.subject title, left(coalesce(a.body, ''), 80) subtitle,
              case when a.opportunity_id is not null then '/opportunities/' || a.opportunity_id when a.lead_id is not null then '/leads/' || a.lead_id
                   when a.contact_id is not null then '/contacts/' || a.contact_id else '/companies/' || a.company_id end href
         from activities a where a.org_id = $1 and (a.search @@ plainto_tsquery('simple', $2) or a.subject ilike $3 or a.body ilike $3) order by a.occurred_at desc limit ${limit}`, [ctx.orgId, term, like]));
    return (await Promise.all(parts)).flat();
  });
}

export async function recentRecords(ctx: Ctx) {
  return withTenant(ctx, (db) => db.many<{ entity_type: string; entity_id: string; label: string; viewed_at: string }>(
    "select entity_type, entity_id, label, viewed_at from recent_records where org_id = $1 and user_id = $2 order by viewed_at desc limit 10", [ctx.orgId, ctx.userId]));
}
