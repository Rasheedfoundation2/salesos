import "server-only";
import type { Db } from "../db";
import type { Ctx } from "../types";

interface Candidate { user_id: string; assignment_weight: number; countries: string[]; open_leads: number }

/** Chooses an owner for a new lead according to the organisation's assignment rule. Returns null when nobody accepts leads. */
export async function pickOwner(db: Db, ctx: Pick<Ctx, "orgId">, lead: { country?: string | null }, methodOverride?: string, restrictTo?: string[]): Promise<string | null> {
  const settings = (await db.one<{ settings: { assignment?: { method?: string } } }>("select settings from organisations where id = $1", [ctx.orgId]))?.settings ?? {};
  const method = methodOverride ?? settings.assignment?.method ?? "round_robin";
  if (method === "manual") return null;

  let cands = await db.many<Candidate>(
    `select m.user_id, m.assignment_weight, m.countries,
            (select count(*)::int from leads l where l.owner_id = m.user_id and l.archived_at is null and l.status in ('new','researching','attempting_contact','contacted','qualified','nurturing')) open_leads
       from memberships m where m.org_id = $1 and m.status = 'active' and m.accepts_leads and m.role = 'rep' order by m.user_id`, [ctx.orgId]);
  if (restrictTo?.length) cands = cands.filter((c) => restrictTo.includes(c.user_id));
  if (!cands.length) return null;

  if (method === "country" && lead.country) {
    const match = cands.filter((c) => c.countries.some((x) => x.toLowerCase() === lead.country!.toLowerCase()));
    if (match.length) cands = match;
  }
  if (method === "workload") {
    return [...cands].sort((a, b) => a.open_leads - b.open_leads || a.user_id.localeCompare(b.user_id))[0]!.user_id;
  }
  const state = await db.one<{ last_user_id: string | null; counter: string }>("select last_user_id, counter from assignment_state where org_id = $1 for update", [ctx.orgId]);
  let chosen: string;
  if (method === "weighted") {
    const expanded = cands.flatMap((c) => Array(Math.max(0, c.assignment_weight)).fill(c.user_id) as string[]);
    const pool = expanded.length ? expanded : cands.map((c) => c.user_id);
    chosen = pool[Number(state?.counter ?? 0) % pool.length]!;
  } else {
    const idx = cands.findIndex((c) => c.user_id === state?.last_user_id);
    chosen = cands[(idx + 1) % cands.length]!.user_id;
  }
  await db.exec(`insert into assignment_state(org_id, last_user_id, counter) values ($1,$2,1)
                 on conflict (org_id) do update set last_user_id = $2, counter = assignment_state.counter + 1`, [ctx.orgId, chosen]);
  return chosen;
}
