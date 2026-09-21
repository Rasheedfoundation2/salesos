import "server-only";
import { withTenant, type Db } from "../db";
import type { Ctx } from "../types";

export interface Stage { id: string; pipeline_id: string; name: string; position: number; probability: number; color: string; kind: string; required_fields: string[]; max_days: number | null; restricted_roles: string[]; entry_criteria: string | null; exit_criteria: string | null }
export interface Pipeline { id: string; name: string; is_default: boolean; stages: Stage[] }

export async function getPipelines(db: Db, orgId: string): Promise<Pipeline[]> {
  const ps = await db.many<{ id: string; name: string; is_default: boolean }>("select id, name, is_default from pipelines where org_id = $1 and archived_at is null order by is_default desc, name", [orgId]);
  const stages = await db.many<Stage>("select * from pipeline_stages where org_id = $1 order by position", [orgId]);
  return ps.map((p) => ({ ...p, stages: stages.filter((s) => s.pipeline_id === p.id) }));
}

export async function getLookups(ctx: Ctx) {
  return withTenant(ctx, async (db) => {
    const [sources, campaigns, users, teams, lostReasons, products, pipelines, fx] = await Promise.all([
      db.many<{ id: string; name: string }>("select id, name from lead_sources where org_id = $1 and active order by name", [ctx.orgId]),
      db.many<{ id: string; name: string }>("select id, name from campaigns where org_id = $1 order by name", [ctx.orgId]),
      db.many<{ id: string; name: string; role: string }>("select u.id, u.name, m.role from memberships m join users u on u.id = m.user_id where m.org_id = $1 and m.status='active' order by u.name", [ctx.orgId]),
      db.many<{ id: string; name: string }>("select id, name from teams where org_id = $1 order by name", [ctx.orgId]),
      db.many<{ id: string; name: string }>("select id, name from lost_reasons where org_id = $1 order by position", [ctx.orgId]),
      db.many<{ id: string; name: string }>("select id, name from products where org_id = $1 and active order by name", [ctx.orgId]),
      getPipelines(db, ctx.orgId),
      db.many<{ currency: string; rate_to_base: string }>("select currency, rate_to_base from fx_rates where org_id = $1", [ctx.orgId]),
    ]);
    return { sources, campaigns, users, teams, lostReasons, products, pipelines, fx: Object.fromEntries(fx.map((f) => [f.currency, Number(f.rate_to_base)])) };
  });
}
export type Lookups = Awaited<ReturnType<typeof getLookups>>;

export async function fxRate(db: Db, orgId: string, currency: string) {
  const r = await db.one<{ rate_to_base: string }>("select rate_to_base from fx_rates where org_id = $1 and currency = $2", [orgId, currency]);
  return r ? Number(r.rate_to_base) : 1;
}
