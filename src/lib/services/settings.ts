import "server-only";
import { withTenant, withSystem } from "../db";
import type { Ctx } from "../types";
import { assertCan, ForbiddenError, ValidationError } from "../rbac";
import { CURRENCIES, DEFAULT_STAGES, STAGE_REQUIRABLE_FIELDS, ROLES } from "../constants";
import { mergeScoring, type ScoringConfig } from "../scoring";
import { newToken, sha256 } from "../auth/crypto";
import { audit } from "./journal";

const admin = (ctx: Ctx) => assertCan(ctx.role, "settings", "manage");

export async function updateOrganisation(ctx: Ctx, input: Record<string, string>) {
  admin(ctx);
  const name = (input.name ?? "").trim();
  if (name.length < 2) throw new ValidationError("Organisation name is required.", { name: ["Required"] });
  if (!CURRENCIES.includes(input.currency as never)) throw new ValidationError("Choose a supported currency.");
  try { new Intl.DateTimeFormat("en-GB", { timeZone: input.timezone }); } catch { throw new ValidationError("Invalid timezone.", { timezone: ["Invalid"] }); }
  const sla = Number(input.sla_minutes || 15), hv = Number(input.high_value_threshold || 100000);
  if (!(sla > 0 && sla <= 10080)) throw new ValidationError("SLA must be between 1 minute and 7 days.");
  return withTenant(ctx, async (db) => {
    await db.exec(`update organisations set name = $2, currency = $3, timezone = $4, date_format = $5,
        settings = settings || jsonb_build_object('rep_visibility', $6::text, 'sla_minutes', $7::int, 'high_value_threshold', $8::numeric, 'auto_first_task', $9::boolean,
                                                  'assignment', coalesce(settings->'assignment','{}'::jsonb) || jsonb_build_object('method', $10::text)),
        terminology = $11 where id = $1`,
      [ctx.orgId, name, input.currency, input.timezone, input.date_format || "dd/MM/yyyy", input.rep_visibility === "team" ? "team" : "own", sla, hv, input.auto_first_task === "on",
       ["round_robin", "weighted", "country", "workload", "manual"].includes(input.assignment_method) ? input.assignment_method : "round_robin",
       JSON.stringify(Object.fromEntries(["lead", "leads", "opportunity", "opportunities", "company", "companies", "contact", "contacts"].filter((k) => input[`term_${k}`]?.trim()).map((k) => [k, input[`term_${k}`]!.trim()])))]);
    await audit(db, ctx, "settings.updated", "settings", ctx.orgId, { name, currency: input.currency, timezone: input.timezone });
  });
}

export async function updateScoring(ctx: Ctx, cfg: Partial<ScoringConfig>) {
  admin(ctx);
  const merged = mergeScoring(cfg);
  const total = Object.values(merged.weights).reduce((a, b) => a + b, 0);
  if (total <= 0) throw new ValidationError("Weights must add up to more than zero.");
  const t = merged.thresholds;
  if (!(t.hot > t.warm && t.warm > t.nurture && t.nurture >= 0 && t.hot <= 100)) throw new ValidationError("Thresholds must be Hot > Warm > Nurture.");
  return withTenant(ctx, async (db) => {
    await db.exec("update organisations set settings = jsonb_set(settings, '{scoring}', $2::jsonb) where id = $1", [ctx.orgId, JSON.stringify(merged)]);
    await audit(db, ctx, "settings.scoring_updated", "settings", ctx.orgId, { weights: merged.weights });
  });
}

// ── Pipelines & stages ──
export async function createPipeline(ctx: Ctx, name: string) {
  admin(ctx);
  if (!name.trim()) throw new ValidationError("Pipeline name is required.");
  return withTenant(ctx, async (db) => {
    const plan = await db.one<{ limits: { pipelines: number } }>("select p.limits from organisations o join plans p on p.code = o.plan_code where o.id = $1", [ctx.orgId]);
    const n = await db.one<{ n: number }>("select count(*)::int n from pipelines where org_id = $1 and archived_at is null", [ctx.orgId]);
    if ((n?.n ?? 0) >= (plan?.limits.pipelines ?? 3)) throw new ValidationError(`Your plan allows ${plan?.limits.pipelines} pipelines.`);
    const p = await db.one<{ id: string }>("insert into pipelines(org_id, name) values ($1,$2) returning id", [ctx.orgId, name.trim()]);
    let pos = 0;
    for (const s of DEFAULT_STAGES) await db.exec("insert into pipeline_stages(org_id, pipeline_id, name, position, probability, color, kind, required_fields) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [ctx.orgId, p!.id, s.name, pos++, s.probability, s.color, s.kind, s.required_fields ?? []]);
    await audit(db, ctx, "settings.pipeline_created", "settings", p!.id, { name });
    return p!.id;
  });
}

export async function renamePipeline(ctx: Ctx, id: string, name: string, makeDefault: boolean) {
  admin(ctx);
  return withTenant(ctx, async (db) => {
    await db.exec("update pipelines set name = $2 where id = $1", [id, name.trim()]);
    if (makeDefault) { await db.exec("update pipelines set is_default = (id = $2) where org_id = $1", [ctx.orgId, id]); }
  });
}

export async function saveStage(ctx: Ctx, pipelineId: string, id: string | null, input: Record<string, unknown>) {
  admin(ctx);
  const name = String(input.name ?? "").trim();
  const probability = Number(input.probability);
  if (!name) throw new ValidationError("Stage name is required.", { name: ["Required"] });
  if (!(probability >= 0 && probability <= 100)) throw new ValidationError("Probability must be 0–100.", { probability: ["0–100"] });
  const kind = ["open", "won", "lost", "nurture"].includes(String(input.kind)) ? String(input.kind) : "open";
  const required = (Array.isArray(input.required_fields) ? input.required_fields : []).map(String).filter((f) => f in STAGE_REQUIRABLE_FIELDS);
  const restricted = (Array.isArray(input.restricted_roles) ? input.restricted_roles : []).map(String).filter((r) => (ROLES as readonly string[]).includes(r));
  const color = /^#[0-9a-f]{6}$/i.test(String(input.color)) ? String(input.color) : "#64748b";
  const maxDays = input.max_days ? Number(input.max_days) : null;
  return withTenant(ctx, async (db) => {
    if (id) {
      await db.exec(`update pipeline_stages set name=$2, probability=$3, color=$4, kind=$5, required_fields=$6, restricted_roles=$7, max_days=$8, entry_criteria=$9, exit_criteria=$10 where id=$1 and pipeline_id=$11`,
        [id, name, probability, color, kind, required, restricted, maxDays, input.entry_criteria || null, input.exit_criteria || null, pipelineId]);
      await db.exec("update opportunities set probability = $2 where stage_id = $1 and status = 'open'", [id, probability]);
    } else {
      const pos = await db.one<{ p: number }>("select coalesce(max(position),-1)+1 p from pipeline_stages where pipeline_id = $1 and kind = 'open'", [pipelineId]);
      await db.exec("update pipeline_stages set position = position + 1 where pipeline_id = $1 and position >= $2", [pipelineId, pos!.p]);
      await db.exec(`insert into pipeline_stages(org_id, pipeline_id, name, position, probability, color, kind, required_fields, restricted_roles, max_days) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [ctx.orgId, pipelineId, name, pos!.p, probability, color, kind, required, restricted, maxDays]);
    }
  });
}

export async function moveStagePosition(ctx: Ctx, pipelineId: string, stageId: string, dir: -1 | 1) {
  admin(ctx);
  return withTenant(ctx, async (db) => {
    const stages = await db.many<{ id: string; position: number }>("select id, position from pipeline_stages where pipeline_id = $1 order by position", [pipelineId]);
    const i = stages.findIndex((s) => s.id === stageId); const j = i + dir;
    if (i < 0 || j < 0 || j >= stages.length) return;
    await db.exec("update pipeline_stages set position = $2 where id = $1", [stages[i]!.id, stages[j]!.position]);
    await db.exec("update pipeline_stages set position = $2 where id = $1", [stages[j]!.id, stages[i]!.position]);
  });
}

export async function deleteStage(ctx: Ctx, stageId: string) {
  admin(ctx);
  return withTenant(ctx, async (db) => {
    const n = await db.one<{ n: number }>("select count(*)::int n from opportunities where stage_id = $1", [stageId]);
    if (n!.n > 0) throw new ValidationError(`Move the ${n!.n} opportunities out of this stage first.`);
    await db.exec("delete from pipeline_stages where id = $1", [stageId]);
  });
}

// ── Reference lists ──
type ListTable = "lead_sources" | "campaigns" | "lost_reasons" | "products";
export async function addListItem(ctx: Ctx, table: ListTable, input: Record<string, string>) {
  if (table === "lead_sources" || table === "campaigns") { if (!["owner", "admin", "marketing"].includes(ctx.role)) throw new ForbiddenError(); } else admin(ctx);
  const name = (input.name ?? "").trim();
  if (!name) throw new ValidationError("Name is required.");
  return withTenant(ctx, async (db) => {
    if (table === "lead_sources") await db.exec("insert into lead_sources(org_id, name, channel) values ($1,$2,$3)", [ctx.orgId, name, input.channel || "other"]);
    if (table === "campaigns") await db.exec("insert into campaigns(org_id, name, source_id, budget, currency) values ($1,$2,$3,$4,$5)", [ctx.orgId, name, input.source_id || null, input.budget ? Number(input.budget) : null, input.currency || ctx.org.currency]);
    if (table === "lost_reasons") await db.exec("insert into lost_reasons(org_id, name, position) values ($1,$2,(select coalesce(max(position),0)+1 from lost_reasons where org_id = $1))", [ctx.orgId, name]);
    if (table === "products") await db.exec("insert into products(org_id, name, category, billing_type, unit_price, currency, tax_rate) values ($1,$2,$3,$4,$5,$6,$7)",
      [ctx.orgId, name, input.category || null, input.billing_type || "one_time", Number(input.unit_price || 0), input.currency || ctx.org.currency, Number(input.tax_rate || 5)]);
  });
}
export async function removeListItem(ctx: Ctx, table: ListTable, id: string) {
  if (table === "lead_sources" || table === "campaigns") { if (!["owner", "admin", "marketing"].includes(ctx.role)) throw new ForbiddenError(); } else admin(ctx);
  return withTenant(ctx, async (db) => {
    if (table === "lead_sources" || table === "products") await db.exec(`update ${table} set active = false where id = $1`, [id]);
    else if (table === "campaigns") await db.exec("update campaigns set status = 'archived' where id = $1", [id]);
    else await db.exec("delete from lost_reasons where id = $1", [id]);
  });
}
export async function listSettingsLists(ctx: Ctx) {
  return withTenant(ctx, async (db) => ({
    sources: await db.many<{ id: string; name: string; channel: string; active: boolean; leads: number }>("select s.id, s.name, s.channel, s.active, (select count(*)::int from leads l where l.source_id = s.id) leads from lead_sources s where s.org_id = $1 order by s.active desc, s.name", [ctx.orgId]),
    campaigns: await db.many<{ id: string; name: string; status: string; budget: string | null; currency: string; source_name: string | null; leads: number }>("select c.id, c.name, c.status, c.budget, c.currency, s.name source_name, (select count(*)::int from leads l where l.campaign_id = c.id) leads from campaigns c left join lead_sources s on s.id = c.source_id where c.org_id = $1 order by c.status, c.name", [ctx.orgId]),
    lostReasons: await db.many<{ id: string; name: string }>("select id, name from lost_reasons where org_id = $1 order by position", [ctx.orgId]),
    products: await db.many<{ id: string; name: string; category: string | null; billing_type: string; unit_price: string; currency: string; tax_rate: string; active: boolean }>("select * from products where org_id = $1 order by active desc, name", [ctx.orgId]),
    fx: await db.many<{ currency: string; rate_to_base: string; updated_at: string }>("select currency, rate_to_base, updated_at from fx_rates where org_id = $1 order by currency", [ctx.orgId]),
  }));
}
export async function updateFx(ctx: Ctx, rates: Record<string, string>) {
  admin(ctx);
  return withTenant(ctx, async (db) => {
    for (const [cur, rate] of Object.entries(rates)) {
      const r = Number(rate);
      if (!CURRENCIES.includes(cur as never) || !(r > 0)) continue;
      await db.exec("insert into fx_rates(org_id, currency, rate_to_base, updated_at) values ($1,$2,$3,now()) on conflict (org_id, currency) do update set rate_to_base = $3, updated_at = now()", [ctx.orgId, cur, cur === ctx.org.currency ? 1 : r]);
    }
    await audit(db, ctx, "settings.fx_updated", "settings", ctx.orgId, rates);
  });
}

// ── API keys ──
export async function listApiKeys(ctx: Ctx) {
  assertCan(ctx.role, "api_keys", "manage");
  return withTenant(ctx, (db) => db.many<{ id: string; name: string; prefix: string; scopes: string[]; last_used_at: string | null; revoked_at: string | null; created_at: string }>(
    "select id, name, prefix, scopes, last_used_at, revoked_at, created_at from api_keys where org_id = $1 order by created_at desc", [ctx.orgId]));
}
export async function createApiKey(ctx: Ctx, name: string) {
  assertCan(ctx.role, "api_keys", "manage");
  if (!name.trim()) throw new ValidationError("Give the key a name.");
  const secret = `sk_live_${newToken(24)}`;
  await withTenant(ctx, async (db) => {
    const k = await db.one<{ id: string }>("insert into api_keys(org_id, name, prefix, key_hash, created_by) values ($1,$2,$3,$4,$5) returning id", [ctx.orgId, name.trim(), secret.slice(0, 12), sha256(secret), ctx.userId]);
    await audit(db, ctx, "integration.api_key_created", "api_key", k!.id, { name });
  });
  return secret;
}
export async function revokeApiKey(ctx: Ctx, id: string) {
  assertCan(ctx.role, "api_keys", "manage");
  return withTenant(ctx, async (db) => { await db.exec("update api_keys set revoked_at = now() where id = $1", [id]); await audit(db, ctx, "integration.api_key_revoked", "api_key", id); });
}
/** Resolves an API key to a service principal (the key creator) scoped to one organisation. */
export async function resolveApiKey(secret: string) {
  return withSystem(async (db) => {
    const k = await db.one<{ id: string; org_id: string; created_by: string; scopes: string[] }>(
      `select k.id, k.org_id, k.created_by, k.scopes from api_keys k join organisations o on o.id = k.org_id join memberships m on m.org_id = k.org_id and m.user_id = k.created_by and m.status = 'active'
        where k.key_hash = $1 and k.revoked_at is null and o.status = 'active'`, [sha256(secret)]);
    if (k) await db.exec("update api_keys set last_used_at = now() where id = $1", [k.id]);
    return k;
  });
}

// ── Audit log ──
export async function listAudit(ctx: Ctx, f: { action?: string; actor?: string; page?: number }) {
  assertCan(ctx.role, "audit", "view");
  const w = ["a.org_id = $1"]; const p: unknown[] = [ctx.orgId];
  if (f.action) { p.push(f.action + "%"); w.push(`a.action like $${p.length}`); }
  if (f.actor) { p.push(f.actor); w.push(`a.actor_id = $${p.length}`); }
  const page = Math.max(1, f.page ?? 1);
  return withTenant(ctx, (db) => db.many<{ id: number; action: string; entity_type: string | null; entity_id: string | null; changes: Record<string, unknown>; actor_name: string | null; at: string }>(
    `select a.id, a.action, a.entity_type, a.entity_id, a.changes, u.name actor_name, a.at from audit_logs a left join users u on u.id = a.actor_id where ${w.join(" and ")} order by a.at desc limit 100 offset ${(page - 1) * 100}`, p));
}
export async function loginHistory(ctx: Ctx) {
  assertCan(ctx.role, "audit", "view");
  return withSystem((db) => db.many<{ email: string; success: boolean; reason: string | null; ip: string | null; user_agent: string | null; at: string }>(
    `select h.email, h.success, h.reason, h.ip, h.user_agent, h.at from login_history h where h.user_id in (select user_id from memberships where org_id = $1) order by h.at desc limit 100`, [ctx.orgId]));
}
export async function outbox(ctx: Ctx) {
  admin(ctx);
  return withSystem((db) => db.many<{ id: string; to_email: string; subject: string; body: string; status: string; created_at: string }>(
    "select id, to_email, subject, body, status, created_at from email_outbox where org_id = $1 order by created_at desc limit 50", [ctx.orgId]));
}

// ── Saved views & notifications ──
export async function listViews(ctx: Ctx, entity: string) {
  return withTenant(ctx, (db) => db.many<{ id: string; name: string; filters: Record<string, string>; is_shared: boolean; user_id: string }>(
    "select id, name, filters, is_shared, user_id from saved_views where org_id = $1 and entity = $2 order by name", [ctx.orgId, entity]));
}
export async function saveView(ctx: Ctx, entity: string, name: string, filters: Record<string, string>, shared: boolean) {
  if (!name.trim()) throw new ValidationError("Name the view.");
  return withTenant(ctx, (db) => db.exec("insert into saved_views(org_id, user_id, entity, name, filters, is_shared) values ($1,$2,$3,$4,$5,$6)",
    [ctx.orgId, ctx.userId, entity, name.trim(), filters, shared && ["owner", "admin", "manager"].includes(ctx.role)]));
}
export async function deleteView(ctx: Ctx, id: string) {
  return withTenant(ctx, (db) => db.exec("delete from saved_views where id = $1 and user_id = $2", [id, ctx.userId]));
}
export async function listNotifications(ctx: Ctx) {
  return withTenant(ctx, async (db) => ({
    items: await db.many<{ id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }>(
      "select id, type, title, body, link, read_at, created_at from notifications where org_id = $1 and user_id = $2 order by created_at desc limit 30", [ctx.orgId, ctx.userId]),
    unread: (await db.one<{ n: number }>("select count(*)::int n from notifications where org_id = $1 and user_id = $2 and read_at is null", [ctx.orgId, ctx.userId]))!.n,
  }));
}
export async function markNotifications(ctx: Ctx, id?: string) {
  return withTenant(ctx, (db) => id
    ? db.exec("update notifications set read_at = now() where id = $1 and user_id = $2", [id, ctx.userId])
    : db.exec("update notifications set read_at = now() where org_id = $1 and user_id = $2 and read_at is null", [ctx.orgId, ctx.userId]));
}

// ── Platform super admin ──
export async function platformOrganisations(isPlatformAdmin: boolean) {
  if (!isPlatformAdmin) throw new ForbiddenError();
  return withSystem((db) => db.many<{ id: string; name: string; slug: string; plan_code: string; status: string; created_at: string; users: number; leads: number; opps: number; last_activity: string | null }>(
    `select o.id, o.name, o.slug, o.plan_code, o.status, o.created_at,
       (select count(*)::int from memberships m where m.org_id = o.id and m.status = 'active') users,
       (select count(*)::int from leads l where l.org_id = o.id) leads,
       (select count(*)::int from opportunities x where x.org_id = o.id) opps,
       (select max(at) from timeline_events t where t.org_id = o.id) last_activity
     from organisations o order by o.created_at desc`));
}
export async function platformSetStatus(isPlatformAdmin: boolean, actorId: string, orgId: string, status: "active" | "suspended") {
  if (!isPlatformAdmin) throw new ForbiddenError();
  return withSystem(async (db) => {
    await db.exec("update organisations set status = $2 where id = $1", [orgId, status]);
    await db.exec("insert into audit_logs(org_id, actor_id, action, entity_type, entity_id) values ($1,$2,$3,'settings',$1)", [orgId, actorId, `platform.org_${status}`]);
  });
}
export async function platformSetPlan(isPlatformAdmin: boolean, orgId: string, plan: string) {
  if (!isPlatformAdmin) throw new ForbiddenError();
  return withSystem((db) => db.exec("update organisations set plan_code = $2 where id = $1 and exists (select 1 from plans where code = $2)", [orgId, plan]));
}
export async function platformHealth(isPlatformAdmin: boolean) {
  if (!isPlatformAdmin) throw new ForbiddenError();
  return withSystem(async (db) => {
    const t0 = Date.now();
    const r = await db.one<{ now: string; size: string; sessions: number; events_pending: number }>(
      "select now()::text now, pg_size_pretty(pg_database_size(current_database())) size, (select count(*)::int from sessions where revoked_at is null and expires_at > now()) sessions, (select count(*)::int from events where processed_at is null) events_pending");
    return { ...r!, latency_ms: Date.now() - t0 };
  });
}
