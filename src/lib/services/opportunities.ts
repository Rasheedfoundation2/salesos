import "server-only";
import { withTenant, type Db } from "../db";
import type { Ctx } from "../types";
import { assertCan, can, ForbiddenError, NotFoundError, redact, ValidationError } from "../rbac";
import { opportunitySchema, opportunityUpdateSchema } from "../validation";
import { STAGE_REQUIRABLE_FIELDS } from "../constants";
import { audit, notify, timeline } from "./journal";
import type { Stage } from "./lookups";

export interface OppRow {
  id: string; name: string; company_id: string | null; company_name: string | null; contact_id: string | null; contact_name: string | null; owner_id: string | null; owner_name: string | null;
  pipeline_id: string; stage_id: string; stage_name: string; stage_color: string; stage_kind: string; value: string | null; currency: string; probability: number; weighted_value: string | null;
  expected_close_date: string | null; next_action: string | null; next_action_date: string | null; risk_level: string; forecast_category: string; status: string;
  stage_entered_at: string; last_activity_at: string | null; max_days: number | null; lost_reason: string | null; created_at: string; value_base: string | null;
}

export interface OppFilters { q?: string; pipeline?: string; stage?: string; owner?: string; status?: string; risk?: string; closing?: string; stale?: string; sort?: string; dir?: string; page?: number; per?: number }

function where(ctx: Ctx, f: OppFilters) {
  const w = ["o.org_id = $1", "o.archived_at is null"]; const p: unknown[] = [ctx.orgId];
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replaceAll("?", `$${p.length}`)); };
  if (f.q) add("(o.name ilike '%' || ? || '%' or c.name ilike '%' || ? || '%')", f.q);
  if (f.pipeline) add("o.pipeline_id = ?", f.pipeline);
  if (f.stage) add("o.stage_id = ?", f.stage);
  if (f.owner === "me") add("o.owner_id = ?", ctx.userId); else if (f.owner) add("o.owner_id = ?", f.owner);
  if (f.status) add("o.status = ?", f.status);
  if (f.risk) add("o.risk_level = ?", f.risk);
  if (f.closing === "30") w.push("o.expected_close_date between current_date and current_date + 30");
  if (f.closing === "overdue") w.push("o.status = 'open' and o.expected_close_date < current_date");
  if (f.stale === "1") w.push("o.status = 'open' and coalesce(o.last_activity_at, o.created_at) < now() - interval '7 days'");
  if (f.stale === "no_next") w.push("o.status = 'open' and o.next_action is null");
  return { sql: w.join(" and "), p };
}

const SELECT = `select o.id, o.name, o.company_id, c.name company_name, o.contact_id, ct.full_name contact_name, o.owner_id, u.name owner_name, o.pipeline_id, o.stage_id,
  s.name stage_name, s.color stage_color, s.kind stage_kind, s.max_days, o.value, o.currency, o.probability, o.weighted_value, o.expected_close_date, o.next_action, o.next_action_date,
  o.risk_level, o.forecast_category, o.status, o.stage_entered_at, o.last_activity_at, o.lost_reason, o.created_at,
  round(o.value * coalesce(fx.rate_to_base, 1), 2) value_base
  from opportunities o join pipeline_stages s on s.id = o.stage_id left join companies c on c.id = o.company_id left join contacts ct on ct.id = o.contact_id
  left join users u on u.id = o.owner_id left join fx_rates fx on fx.org_id = o.org_id and fx.currency = o.currency`;

export async function listOpportunities(ctx: Ctx, f: OppFilters) {
  assertCan(ctx.role, "opportunities", "view");
  const { sql, p } = where(ctx, f);
  const per = Math.min(f.per ?? 100, 500); const page = Math.max(f.page ?? 1, 1);
  const sorts: Record<string, string> = { value: "o.value", close: "o.expected_close_date", created: "o.created_at", name: "o.name", stage: "s.position" };
  return withTenant(ctx, async (db) => {
    const rows = await db.many<OppRow>(`${SELECT} where ${sql} order by ${sorts[f.sort ?? "created"] ?? "o.created_at"} ${f.dir === "asc" ? "asc" : "desc"} nulls last limit ${per} offset ${(page - 1) * per}`, p);
    const total = (await db.one<{ n: number }>(`select count(*)::int n from opportunities o left join companies c on c.id = o.company_id where ${sql}`, p))!.n;
    return { rows: rows.map((r) => redact(ctx.role, "opportunities", r as unknown as Record<string, unknown>) as unknown as OppRow), total, page, per };
  });
}

export async function getOpportunity(ctx: Ctx, id: string) {
  assertCan(ctx.role, "opportunities", "view");
  return withTenant(ctx, async (db) => {
    const o = await db.one<OppRow & Record<string, unknown>>(`select o.*, c.name company_name, ct.full_name contact_name, u.name owner_name, s.name stage_name, s.color stage_color, s.kind stage_kind, s.max_days, p.name pipeline_name, src.name source_name
      from opportunities o join pipeline_stages s on s.id = o.stage_id join pipelines p on p.id = o.pipeline_id left join companies c on c.id = o.company_id
      left join contacts ct on ct.id = o.contact_id left join users u on u.id = o.owner_id left join lead_sources src on src.id = o.source_id where o.id = $1`, [id]);
    if (!o) throw new NotFoundError();
    const history = await db.many<{ at: string; from_name: string | null; to_name: string; user_name: string | null; from_probability: number | null; to_probability: number }>(
      `select h.at, fs.name from_name, ts.name to_name, u.name user_name, h.from_probability, h.to_probability from opportunity_stage_history h
        left join pipeline_stages fs on fs.id = h.from_stage_id left join pipeline_stages ts on ts.id = h.to_stage_id left join users u on u.id = h.user_id
        where h.opportunity_id = $1 order by h.at desc`, [id]);
    const handover = await db.one<Record<string, unknown>>("select h.*, u.name delivery_owner_name from handovers h left join users u on u.id = h.delivery_owner_id where h.opportunity_id = $1", [id]);
    await db.exec(`insert into recent_records(org_id, user_id, entity_type, entity_id, label) values ($1,$2,'opportunity',$3,$4)
                   on conflict (org_id, user_id, entity_type, entity_id) do update set viewed_at = now(), label = excluded.label`, [ctx.orgId, ctx.userId, id, o.name]);
    return { opp: redact(ctx.role, "opportunities", o), history, handover };
  });
}

export async function createOpportunity(ctx: Ctx, raw: unknown) {
  assertCan(ctx.role, "opportunities", "create");
  const v = opportunitySchema.parse(raw);
  return withTenant(ctx, async (db) => {
    const stage = v.stage_id
      ? await db.one<Stage>("select * from pipeline_stages where id = $1 and pipeline_id = $2", [v.stage_id, v.pipeline_id])
      : await db.one<Stage>("select * from pipeline_stages where pipeline_id = $1 order by position limit 1", [v.pipeline_id]);
    if (!stage) throw new ValidationError("Choose a valid pipeline stage.", { stage_id: ["Invalid stage"] });
    if (stage.kind === "won" || stage.kind === "lost") throw new ValidationError("Create the opportunity in an open stage, then close it.");
    let owner = v.owner_id ?? ctx.userId;
    if (owner !== ctx.userId && !can(ctx.role, "opportunities", "assign")) owner = ctx.userId;
    checkRequired(stage, { ...v, owner_id: owner } as Record<string, unknown>);
    const r = await db.one<{ id: string }>(`insert into opportunities(org_id, name, company_id, contact_id, owner_id, pipeline_id, stage_id, value, currency, probability, expected_close_date, services,
        source_id, competitors, decision_makers, pain_points, proposed_solution, next_action, next_action_date, risk_level, forecast_category, discount_pct, tags, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) returning id`,
      [ctx.orgId, v.name, v.company_id, v.contact_id, owner, v.pipeline_id, stage.id, v.value ?? 0, v.currency ?? ctx.org.currency, stage.probability, v.expected_close_date, v.services ?? [],
       v.source_id, v.competitors, v.decision_makers, v.pain_points, v.proposed_solution, v.next_action, v.next_action_date, v.risk_level ?? "low", v.forecast_category ?? "pipeline", v.discount_pct ?? 0, v.tags ?? [], ctx.userId]);
    await db.exec("insert into opportunity_stage_history(org_id, opportunity_id, to_stage_id, to_probability, user_id) values ($1,$2,$3,$4,$5)", [ctx.orgId, r!.id, stage.id, stage.probability, ctx.userId]);
    await timeline(db, ctx, "opportunity", r!.id, "created", `Opportunity created in ${stage.name}`);
    if (v.company_id) await timeline(db, ctx, "company", v.company_id, "opportunity_created", `Opportunity: ${v.name}`, { opportunity_id: r!.id });
    if (owner !== ctx.userId) await notify(db, ctx, owner, "assignment", `Opportunity assigned: ${v.name}`, null, `/opportunities/${r!.id}`);
    await highValueAlert(db, ctx, r!.id);
    return r!.id;
  });
}

function checkRequired(stage: Stage, rec: Record<string, unknown>) {
  const missing = stage.required_fields.filter((f) => {
    const v = rec[f];
    return v == null || v === "" || (f === "value" && Number(v) <= 0);
  });
  if (missing.length) {
    throw new ValidationError(`${stage.name} requires: ${missing.map((m) => STAGE_REQUIRABLE_FIELDS[m] ?? m).join(", ")}.`, Object.fromEntries(missing.map((m) => [m, ["Required for this stage"]])));
  }
}

async function highValueAlert(db: Db, ctx: Ctx, oppId: string) {
  const r = await db.one<{ name: string; value_base: string; threshold: string | null }>(
    `select o.name, o.value * coalesce(fx.rate_to_base,1) value_base, (org.settings->>'high_value_threshold') threshold from opportunities o join organisations org on org.id = o.org_id
      left join fx_rates fx on fx.org_id = o.org_id and fx.currency = o.currency where o.id = $1`, [oppId]);
  const threshold = Number(r?.threshold ?? 100000);
  if (r && Number(r.value_base) >= threshold) {
    const managers = await db.many<{ user_id: string }>("select user_id from memberships where org_id = $1 and role in ('owner','manager') and status = 'active' and user_id <> $2", [ctx.orgId, ctx.userId]);
    for (const m of managers) await notify(db, ctx, m.user_id, "high_value", `High-value opportunity: ${r.name}`, null, `/opportunities/${oppId}`);
  }
}

const UPDATABLE = ["name", "company_id", "contact_id", "value", "currency", "expected_close_date", "services", "source_id", "competitors", "decision_makers", "pain_points", "proposed_solution",
  "next_action", "next_action_date", "risk_level", "forecast_category", "discount_pct", "tags"] as const;

export async function updateOpportunity(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  assertCan(ctx.role, "opportunities", "edit");
  const v = opportunityUpdateSchema.parse(raw);
  return withTenant(ctx, async (db) => {
    const cur = await db.one<Record<string, unknown> & { owner_id: string | null; value_locked: boolean; status: string; name: string }>("select * from opportunities where id = $1 and archived_at is null for update", [id]);
    if (!cur) throw new NotFoundError();
    if (cur.value_locked && ("value" in raw || "currency" in raw) && !can(ctx.role, "settings", "manage")) throw new ForbiddenError("The commercial value is locked after Closed Won.");
    if ("discount_pct" in raw && v.discount_pct != null) {
      const lim = await db.one<{ max_discount_pct: string }>("select max_discount_pct from memberships where org_id = $1 and user_id = $2", [ctx.orgId, ctx.userId]);
      if (Number(v.discount_pct) > Number(lim?.max_discount_pct ?? 0)) throw new ValidationError(`Discount exceeds your approval limit of ${Number(lim?.max_discount_pct ?? 0)}%. Ask a manager to approve.`, { discount_pct: ["Above your limit"] });
      if (Number(v.discount_pct) !== Number(cur.discount_pct)) await audit(db, ctx, "discount.approved", "opportunity", id, { discount_pct: [cur.discount_pct, v.discount_pct] });
    }
    const sets: string[] = []; const params: unknown[] = [id];
    for (const k of UPDATABLE) if (k in raw) { params.push((v as Record<string, unknown>)[k] ?? (k === "services" || k === "tags" ? [] : null)); sets.push(`${k} = $${params.length}`); }
    if (sets.length) await db.exec(`update opportunities set ${sets.join(", ")} where id = $1`, params);
    if (raw.owner_id !== undefined && raw.owner_id !== cur.owner_id) {
      if (!can(ctx.role, "opportunities", "assign")) throw new ForbiddenError("Only managers can transfer opportunities.");
      await db.exec("update opportunities set owner_id = $2 where id = $1", [id, raw.owner_id || null]);
      await audit(db, ctx, "record.transferred", "opportunity", id, { owner_id: [cur.owner_id, raw.owner_id] });
      await notify(db, ctx, raw.owner_id as string, "assignment", `Opportunity transferred to you: ${cur.name}`, null, `/opportunities/${id}`);
      await timeline(db, ctx, "opportunity", id, "assigned", "Owner changed");
    }
    if (sets.length) await timeline(db, ctx, "opportunity", id, "updated", `Updated ${Object.keys(raw).filter((k) => (UPDATABLE as readonly string[]).includes(k)).slice(0, 4).join(", ")}`);
    if ("value" in raw) await highValueAlert(db, ctx, id);
  });
}

export interface MoveInput { stage_id: string; lost_reason?: string | null; lost_notes?: string | null; fields?: Record<string, unknown> }

/** Moves a deal between stages enforcing required fields, restricted stages and lost reasons; creates the handover on Closed Won. */
export async function moveStage(ctx: Ctx, id: string, input: MoveInput) {
  assertCan(ctx.role, "opportunities", "edit");
  return withTenant(ctx, async (db) => {
    const o = await db.one<Record<string, unknown> & { id: string; name: string; stage_id: string; pipeline_id: string; probability: number; status: string; owner_id: string | null; company_id: string | null; value: string; currency: string; services: string[] }>(
      "select * from opportunities where id = $1 and archived_at is null for update", [id]);
    if (!o) throw new NotFoundError();
    const to = await db.one<Stage>("select * from pipeline_stages where id = $1", [input.stage_id]);
    if (!to || to.pipeline_id !== o.pipeline_id) throw new ValidationError("That stage belongs to a different pipeline.");
    if (to.id === o.stage_id) return { handoverId: null };
    if (to.restricted_roles.includes(ctx.role)) throw new ForbiddenError(`Your role cannot move deals into ${to.name}.`);
    if (o.status !== "open" && to.kind === "open" && !can(ctx.role, "opportunities", "assign")) throw new ForbiddenError("Only a sales manager can reopen a closed opportunity.");

    if (input.fields && Object.keys(input.fields).length) {
      const v = opportunityUpdateSchema.parse(input.fields);
      const keys = Object.keys(input.fields).filter((k) => (UPDATABLE as readonly string[]).includes(k));
      if (keys.length) await db.exec(`update opportunities set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1`, [id, ...keys.map((k) => (v as Record<string, unknown>)[k] ?? null)]);
      Object.assign(o, Object.fromEntries(keys.map((k) => [k, (v as Record<string, unknown>)[k]])));
    }
    checkRequired(to, o);
    if (to.kind === "lost" && !input.lost_reason) throw new ValidationError("A lost reason is required to close this opportunity as lost.", { lost_reason: ["Required"] });

    const from = await db.one<{ name: string }>("select name from pipeline_stages where id = $1", [o.stage_id]);
    const status = to.kind === "won" ? "won" : to.kind === "lost" ? "lost" : "open";
    const forecast = to.kind === "won" ? "closed_won" : to.kind === "lost" ? "closed_lost" : to.probability >= 75 ? "commit" : to.probability >= 45 ? "best_case" : "pipeline";
    await db.exec(`update opportunities set stage_id = $2, probability = $3, status = $4, forecast_category = $5, stage_entered_at = now(),
        lost_reason = case when $4 = 'lost' then $6 else null end, lost_notes = case when $4 = 'lost' then $7 else null end,
        won_at = case when $4 = 'won' then now() else null end, closed_at = case when $4 in ('won','lost') then now() else null end,
        value_locked = ($4 = 'won') where id = $1`,
      [id, to.id, to.probability, status, forecast, input.lost_reason ?? null, input.lost_notes ?? null]);
    await db.exec("insert into opportunity_stage_history(org_id, opportunity_id, from_stage_id, to_stage_id, from_probability, to_probability, user_id) values ($1,$2,$3,$4,$5,$6,$7)",
      [ctx.orgId, id, o.stage_id, to.id, o.probability, to.probability, ctx.userId]);
    await timeline(db, ctx, "opportunity", id, status === "won" ? "won" : status === "lost" ? "lost" : "stage_changed",
      `${from?.name ?? "—"} → ${to.name}${status === "lost" ? ` (${input.lost_reason})` : ""}`, { from: o.stage_id, to: to.id, probability: to.probability });

    let handoverId: string | null = null;
    if (status === "won") {
      handoverId = await createHandover(db, ctx, o);
      if (o.owner_id && o.owner_id !== ctx.userId) await notify(db, ctx, o.owner_id, "won", `🎉 Won: ${o.name}`, null, `/opportunities/${id}`);
    }
    if (status === "lost" && o.owner_id && o.owner_id !== ctx.userId) await notify(db, ctx, o.owner_id, "lost", `Lost: ${o.name}`, input.lost_reason ?? null, `/opportunities/${id}`);
    return { handoverId };
  });
}

async function createHandover(db: Db, ctx: Ctx, o: { id: string; name: string; company_id: string | null; value: string; currency: string; services: string[]; owner_id: string | null; contact_id?: unknown; pain_points?: unknown; proposed_solution?: unknown; decision_makers?: unknown }) {
  const existing = await db.one<{ id: string }>("select id from handovers where opportunity_id = $1", [o.id]);
  if (existing) return existing.id;
  if (o.company_id) {
    await db.exec("update companies set client_status = 'active_client', active_services = (select array_agg(distinct s) from unnest(active_services || $2::text[]) s) where id = $1", [o.company_id, o.services ?? []]);
    await timeline(db, ctx, "company", o.company_id, "became_client", `Became a client via ${o.name}`, { opportunity_id: o.id });
  }
  const delivery = await db.one<{ user_id: string }>("select user_id from memberships where org_id = $1 and role in ('manager','admin','owner') and status = 'active' order by case role when 'manager' then 0 when 'admin' then 1 else 2 end limit 1", [ctx.orgId]);
  const h = await db.one<{ id: string }>(`insert into handovers(org_id, opportunity_id, company_id, services, commercial_value, currency, client_expectations, stakeholders, sales_notes, delivery_owner_id, created_by)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [ctx.orgId, o.id, o.company_id, o.services ?? [], o.value, o.currency, (o.pain_points as string) ?? null, (o.decision_makers as string) ?? null, (o.proposed_solution as string) ?? null, delivery?.user_id ?? null, ctx.userId]);
  const tasks = ["Kick-off call with client", "Collect brand/project assets and access", "Confirm deliverables, timeline and payment schedule", "Set up project workspace and team"];
  let day = 1;
  for (const t of tasks) await db.exec("insert into tasks(org_id, title, owner_id, priority, due_at, opportunity_id, company_id, handover_id, created_by) values ($1,$2,$3,'high', now() + ($4 || ' days')::interval, $5,$6,$7,$8)",
    [ctx.orgId, `Onboarding: ${t}`, delivery?.user_id ?? o.owner_id, String(day++), o.id, o.company_id, h!.id, ctx.userId]);
  await timeline(db, ctx, "opportunity", o.id, "handover_created", "Client handover created with onboarding tasks", { handover_id: h!.id });
  if (delivery?.user_id && delivery.user_id !== ctx.userId) await notify(db, ctx, delivery.user_id, "handover", `New client handover: ${o.name}`, "Review deliverables and start onboarding.", `/opportunities/${o.id}`);
  return h!.id;
}

export async function updateHandover(ctx: Ctx, opportunityId: string, raw: Record<string, unknown>) {
  assertCan(ctx.role, "opportunities", "edit");
  const fields = ["deliverables", "payment_terms", "client_expectations", "commitments", "assets", "stakeholders", "risks", "deadlines", "sales_notes", "delivery_owner_id", "status"];
  return withTenant(ctx, async (db) => {
    const keys = fields.filter((k) => k in raw);
    if (!keys.length) return;
    const n = await db.exec(`update handovers set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where opportunity_id = $1`, [opportunityId, ...keys.map((k) => (raw[k] === "" ? null : raw[k]))]);
    if (!n) throw new NotFoundError("Handover not found.");
    await timeline(db, ctx, "opportunity", opportunityId, "handover_updated", "Handover details updated");
  });
}

export async function archiveOpportunity(ctx: Ctx, id: string) {
  assertCan(ctx.role, "opportunities", "archive");
  return withTenant(ctx, async (db) => {
    await db.exec("update opportunities set archived_at = now() where id = $1", [id]);
    await audit(db, ctx, "record.archived", "opportunity", id);
  });
}

/** Board data for the Kanban view. */
export async function pipelineBoard(ctx: Ctx, pipelineId: string, f: { owner?: string; q?: string; showClosed?: boolean }) {
  assertCan(ctx.role, "opportunities", "view");
  const res = await listOpportunities(ctx, { pipeline: pipelineId, owner: f.owner, q: f.q, per: 500, sort: "value" });
  const rows = f.showClosed ? res.rows : res.rows.filter((r) => r.status === "open" || new Date(r.stage_entered_at).getTime() > Date.now() - 30 * 86400_000);
  return rows;
}
