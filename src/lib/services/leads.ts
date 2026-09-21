import "server-only";
import { withTenant, type Db } from "../db";
import type { Ctx } from "../types";
import { assertCan, can, ForbiddenError, NotFoundError, ValidationError } from "../rbac";
import { leadSchema, normalizePhone, type LeadInput } from "../validation";
import { mergeScoring, scoreLead } from "../scoring";
import { pickOwner } from "./assignment";
import { fxRate } from "./lookups";
import { notify, timeline, audit } from "./journal";
import { LEAD_STATUS_LABELS } from "../constants";

export interface LeadFilters {
  q?: string; status?: string[]; owner?: string; source?: string; priority?: string; category?: string; tag?: string;
  followUp?: string; created_from?: string; created_to?: string; archived?: string; campaign?: string; score_min?: string;
  sort?: string; dir?: string; page?: number; per?: number;
}

export interface LeadRow {
  id: string; full_name: string; company_name: string | null; email: string | null; phone: string | null; job_title: string | null;
  country: string | null; city: string | null; status: string; score: number; priority: string; owner_id: string | null; owner_name: string | null;
  source_name: string | null; campaign_name: string | null; expected_value: string | null; currency: string; next_follow_up_at: string | null; last_contacted_at: string | null;
  first_response_due_at: string | null; first_contacted_at: string | null; created_at: string; tags: string[]; services: string[]; archived_at: string | null;
}

const SORTS: Record<string, string> = { created: "l.created_at", score: "l.score", name: "l.full_name", follow_up: "l.next_follow_up_at", updated: "l.updated_at", value: "l.expected_value" };

export function buildLeadWhere(ctx: Ctx, f: LeadFilters) {
  const where = ["l.org_id = $1"]; const p: unknown[] = [ctx.orgId];
  const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace("?", `$${p.length}`)); };
  if (f.archived === "1") where.push("l.archived_at is not null"); else where.push("l.archived_at is null");
  if (f.q) add("(l.search @@ plainto_tsquery('simple', ?) or l.full_name ilike '%' || $X || '%' or l.company_name ilike '%' || $X || '%' or l.email::text ilike '%' || $X || '%' or l.phone ilike '%' || $X || '%')".replace(/\$X/g, `$${p.length + 1}`), f.q);
  if (f.status?.length) add("l.status = any(?)", f.status);
  if (f.owner === "me") add("l.owner_id = ?", ctx.userId);
  else if (f.owner === "unassigned") where.push("l.owner_id is null");
  else if (f.owner) add("l.owner_id = ?", f.owner);
  if (f.source) add("l.source_id = ?", f.source);
  if (f.campaign) add("l.campaign_id = ?", f.campaign);
  if (f.priority) add("l.priority = ?", f.priority);
  if (f.tag) add("? = any(l.tags)", f.tag);
  if (f.score_min) add("l.score >= ?", Number(f.score_min));
  if (f.category === "hot") where.push("l.score >= 80");
  if (f.category === "warm") where.push("l.score between 60 and 79");
  if (f.category === "nurture") where.push("l.score between 40 and 59");
  if (f.category === "low") where.push("l.score < 40");
  if (f.followUp === "overdue") where.push("l.next_follow_up_at < now()");
  if (f.followUp === "today") where.push("l.next_follow_up_at::date = (now() at time zone 'Asia/Dubai')::date");
  if (f.followUp === "none") where.push("l.next_follow_up_at is null and l.status not in ('converted','unqualified','do_not_contact')");
  if (f.followUp === "sla_breached") where.push("l.first_contacted_at is null and l.first_response_due_at < now() and l.status not in ('converted','unqualified','do_not_contact')");
  if (f.created_from) add("l.created_at >= ?::date", f.created_from);
  if (f.created_to) add("l.created_at < (?::date + 1)", f.created_to);
  return { where: where.join(" and "), params: p };
}

export async function listLeads(ctx: Ctx, f: LeadFilters) {
  assertCan(ctx.role, "leads", "view");
  const { where, params } = buildLeadWhere(ctx, f);
  const per = Math.min(Math.max(f.per ?? 50, 1), 200); const page = Math.max(f.page ?? 1, 1);
  const sort = SORTS[f.sort ?? "created"] ?? SORTS.created; const dir = f.dir === "asc" ? "asc" : "desc";
  return withTenant(ctx, async (db) => {
    const rows = await db.many<LeadRow>(
      `select l.id, l.full_name, l.company_name, l.email, l.phone, l.job_title, l.country, l.city, l.status, l.score, l.priority, l.owner_id, u.name owner_name,
              s.name source_name, c.name campaign_name, l.expected_value, l.currency, l.next_follow_up_at, l.last_contacted_at, l.first_response_due_at, l.first_contacted_at,
              l.created_at, l.tags, l.services, l.archived_at
         from leads l left join users u on u.id = l.owner_id left join lead_sources s on s.id = l.source_id left join campaigns c on c.id = l.campaign_id
        where ${where} order by ${sort} ${dir} nulls last, l.id limit ${per} offset ${(page - 1) * per}`, params);
    const total = (await db.one<{ n: number }>(`select count(*)::int n from leads l where ${where}`, params))!.n;
    return { rows, total, page, per };
  });
}

export async function getLead(ctx: Ctx, id: string) {
  assertCan(ctx.role, "leads", "view");
  return withTenant(ctx, async (db) => {
    const lead = await db.one<Record<string, unknown> & { id: string; full_name: string; owner_id: string | null; score_breakdown: unknown[] }>(
      `select l.*, u.name owner_name, s.name source_name, c.name campaign_name, t.name team_name
         from leads l left join users u on u.id = l.owner_id left join lead_sources s on s.id = l.source_id
         left join campaigns c on c.id = l.campaign_id left join teams t on t.id = l.team_id where l.id = $1`, [id]);
    if (!lead) throw new NotFoundError();
    await db.exec(`insert into recent_records(org_id, user_id, entity_type, entity_id, label) values ($1,$2,'lead',$3,$4)
                   on conflict (org_id, user_id, entity_type, entity_id) do update set viewed_at = now(), label = excluded.label`, [ctx.orgId, ctx.userId, id, lead.full_name]);
    return lead;
  });
}

export interface DuplicateMatch { entity: "lead" | "contact" | "company"; id: string; label: string; reason: string }

export async function findDuplicates(db: Db, orgId: string, v: { email?: string | null; phone?: string | null; company_name?: string | null; website?: string | null }, excludeId?: string): Promise<DuplicateMatch[]> {
  const out: DuplicateMatch[] = [];
  const domain = v.website ? v.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]!.toLowerCase() : v.email && !/gmail|yahoo|hotmail|outlook|icloud/.test(v.email) ? v.email.split("@")[1] : null;
  if (v.email) {
    for (const r of await db.many<{ id: string; full_name: string }>("select id, full_name from leads where org_id = $1 and email = $2 and archived_at is null and id <> coalesce($3::uuid, '00000000-0000-0000-0000-000000000000')", [orgId, v.email, excludeId ?? null]))
      out.push({ entity: "lead", id: r.id, label: r.full_name, reason: "Same email" });
    for (const r of await db.many<{ id: string; full_name: string }>("select id, full_name from contacts where org_id = $1 and email = $2 and archived_at is null", [orgId, v.email]))
      out.push({ entity: "contact", id: r.id, label: r.full_name, reason: "Existing contact with same email" });
  }
  if (v.phone) {
    for (const r of await db.many<{ id: string; full_name: string }>("select id, full_name from leads where org_id = $1 and (phone = $2 or whatsapp = $2) and archived_at is null and id <> coalesce($3::uuid, '00000000-0000-0000-0000-000000000000')", [orgId, v.phone, excludeId ?? null]))
      if (!out.some((o) => o.id === r.id)) out.push({ entity: "lead", id: r.id, label: r.full_name, reason: "Same phone" });
  }
  if (v.company_name || domain) {
    for (const r of await db.many<{ id: string; name: string; hit: string }>(
      `select id, name, case when domain = $3 then 'domain' else 'name' end hit from companies where org_id = $1 and archived_at is null and ((domain is not null and domain = $3) or ($2::text is not null and similarity(name, $2) > 0.6)) limit 3`,
      [orgId, v.company_name ?? null, domain]))
      out.push({ entity: "company", id: r.id, label: r.name, reason: r.hit === "domain" ? "Company with same domain exists" : "Similar company name exists" });
  }
  return out;
}

function deriveNames(v: LeadInput) {
  let first = v.first_name ?? null, last = v.last_name ?? null;
  let full = v.full_name ?? [first, last].filter(Boolean).join(" ");
  if (!full) full = v.email ?? v.company_name ?? "Unnamed lead";
  if (!first && !last && v.full_name) { const parts = v.full_name.split(/\s+/); first = parts[0] ?? null; last = parts.slice(1).join(" ") || null; }
  return { first_name: first, last_name: last, full_name: full };
}

export async function computeScore(db: Db, ctx: Pick<Ctx, "orgId">, lead: Record<string, unknown>) {
  const org = await db.one<{ settings: { scoring?: unknown } }>("select settings from organisations where id = $1", [ctx.orgId]);
  const cfg = mergeScoring(org?.settings?.scoring);
  const budget = lead.estimated_budget != null ? Number(lead.estimated_budget) * (await fxRate(db, ctx.orgId, String(lead.currency ?? "AED"))) : null;
  return scoreLead({ ...(lead as object), budget_in_base: budget }, cfg);
}

export interface CreateLeadOptions { allowDuplicate?: boolean; importBatchId?: string; assignmentMethod?: string; assignTo?: string[]; skipFirstTask?: boolean; sourceName?: string; quiet?: boolean }

/** Lead-capture workflow: validate → dedupe → attribute → assign → score → first task → notify → SLA → timeline/audit. */
export async function createLeadTx(db: Db, ctx: Ctx, raw: unknown, opts: CreateLeadOptions = {}): Promise<{ id?: string; duplicates?: DuplicateMatch[]; owner_id?: string | null }> {
  assertCan(ctx.role, "leads", "create");
  const v = leadSchema.parse(raw);
  const errors: Record<string, string[]> = {};
  const phone = normalizePhone(v.phone, v.country); if (phone.error) errors.phone = [phone.error];
  const wa = normalizePhone(v.whatsapp, v.country); if (wa.error) errors.whatsapp = [wa.error];
  if (Object.keys(errors).length) throw new ValidationError("Please correct the highlighted fields.", errors);
  v.phone = phone.value; v.whatsapp = wa.value;

  if (!opts.allowDuplicate) {
    const dups = await findDuplicates(db, ctx.orgId, v);
    if (dups.length) return { duplicates: dups };
  }
  const names = deriveNames(v);
  let source_id = v.source_id ?? null;
  if (!source_id) source_id = (await db.one<{ id: string }>("select id from lead_sources where org_id = $1 and name = $2", [ctx.orgId, opts.sourceName ?? "Manual entry"]))?.id ?? null;

  let owner = v.owner_id ?? null;
  if (owner && owner !== ctx.userId && !can(ctx.role, "leads", "assign")) throw new ForbiddenError("You can only create leads assigned to yourself.");
  if (ctx.role === "rep") owner = ctx.userId;
  if (!owner) owner = await pickOwner(db, ctx, v, opts.assignmentMethod, opts.assignTo);

  const org = await db.one<{ settings: { sla_minutes?: number; auto_first_task?: boolean } }>("select settings from organisations where id = $1", [ctx.orgId]);
  const sla = org?.settings?.sla_minutes ?? 15;
  const status = v.status ?? (owner ? "new" : "unassigned");
  const currency = v.currency ?? ctx.org.currency;
  const { score, breakdown } = await computeScore(db, ctx, { ...v, status, currency });

  const row = await db.one<{ id: string }>(
    `insert into leads(org_id, first_name, last_name, full_name, job_title, company_name, email, phone, whatsapp, country, city, website, linkedin_url,
       source_id, campaign_id, industry, company_size, estimated_budget, services, owner_id, team_id, status, score, score_breakdown, priority, expected_value, currency,
       timeframe, authority, next_follow_up_at, first_response_due_at, consent_status, tags, notes, import_batch_id, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30, now() + ($31 || ' minutes')::interval,$32,$33,$34,$35,$36) returning id`,
    [ctx.orgId, names.first_name, names.last_name, names.full_name, v.job_title, v.company_name, v.email, v.phone, v.whatsapp, v.country, v.city, v.website, v.linkedin_url,
     source_id, v.campaign_id, v.industry, v.company_size, v.estimated_budget, v.services, owner, v.team_id, status, score, JSON.stringify(breakdown), v.priority ?? (score >= 80 ? "high" : "medium"),
     v.expected_value, currency, v.timeframe, v.authority, v.next_follow_up_at ?? null, String(sla), v.consent_status ?? "unknown", v.tags ?? [], v.notes, opts.importBatchId ?? null, ctx.userId]);
  const id = row!.id;
  await timeline(db, ctx, "lead", id, "created", opts.importBatchId ? "Lead imported" : "Lead created", { source_id, score });
  if (owner) await afterAssign(db, ctx, id, names.full_name, owner, score, !opts.skipFirstTask && org?.settings?.auto_first_task !== false, sla, opts.quiet);
  return { id, owner_id: owner };
}

async function afterAssign(db: Db, ctx: Ctx, leadId: string, name: string, ownerId: string, score: number, firstTask: boolean, sla: number, quiet = false) {
  const owner = await db.one<{ name: string }>("select name from users where id = $1", [ownerId]);
  await timeline(db, ctx, "lead", leadId, "assigned", `Assigned to ${owner?.name ?? "user"}`, { owner_id: ownerId });
  if (firstTask) {
    await db.exec(`insert into tasks(org_id, title, owner_id, priority, due_at, lead_id, created_by) values ($1,$2,$3,$4, now() + ($5 || ' minutes')::interval, $6, $7)`,
      [ctx.orgId, `First contact: ${name}`, ownerId, score >= 80 ? "urgent" : "high", String(sla), leadId, ctx.userId]);
    await db.exec("update leads set next_follow_up_at = coalesce(next_follow_up_at, now() + ($2 || ' minutes')::interval) where id = $1", [leadId, String(sla)]);
  }
  if (!quiet && ownerId !== ctx.userId) await notify(db, ctx, ownerId, score >= 80 ? "hot_lead" : "assignment", score >= 80 ? `🔥 Hot lead assigned: ${name}` : `New lead assigned: ${name}`, `Respond within ${sla} minutes.`, `/leads/${leadId}`);
}

export async function createLead(ctx: Ctx, raw: unknown, opts: CreateLeadOptions = {}) {
  return withTenant(ctx, (db) => createLeadTx(db, ctx, raw, opts));
}

const EDITABLE = ["first_name", "last_name", "full_name", "job_title", "company_name", "email", "phone", "whatsapp", "country", "city", "website", "linkedin_url", "source_id", "campaign_id",
  "industry", "company_size", "estimated_budget", "services", "team_id", "status", "priority", "expected_value", "currency", "timeframe", "authority", "next_follow_up_at", "consent_status", "tags", "notes"] as const;

export async function updateLead(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  assertCan(ctx.role, "leads", "edit");
  return withTenant(ctx, async (db) => {
    const cur = await db.one<Record<string, unknown> & { owner_id: string | null; status: string; full_name: string; score: number }>("select * from leads where id = $1 and archived_at is null", [id]);
    if (!cur) throw new NotFoundError();
    if (cur.status === "converted" && raw.status && raw.status !== "converted") throw new ValidationError("Converted leads cannot change status.");
    const merged = leadSchema.parse({ ...cur, ...raw });
    const errors: Record<string, string[]> = {};
    if ("phone" in raw) { const p = normalizePhone(merged.phone, merged.country); if (p.error) errors.phone = [p.error]; merged.phone = p.value; }
    if ("whatsapp" in raw) { const p = normalizePhone(merged.whatsapp, merged.country); if (p.error) errors.whatsapp = [p.error]; merged.whatsapp = p.value; }
    if (Object.keys(errors).length) throw new ValidationError("Please correct the highlighted fields.", errors);
    if ("full_name" in raw || "first_name" in raw || "last_name" in raw) Object.assign(merged, deriveNames({ ...merged, full_name: "full_name" in raw ? merged.full_name : [merged.first_name, merged.last_name].filter(Boolean).join(" ") || merged.full_name }));
    const { score, breakdown } = await computeScore(db, ctx, merged as unknown as Record<string, unknown>);
    const sets: string[] = []; const params: unknown[] = [id];
    for (const k of EDITABLE) if (k in raw || ["full_name", "first_name", "last_name"].includes(k)) { params.push((merged as Record<string, unknown>)[k] ?? null); sets.push(`${k} = $${params.length}`); }
    params.push(score); sets.push(`score = $${params.length}`); params.push(JSON.stringify(breakdown)); sets.push(`score_breakdown = $${params.length}`);
    await db.exec(`update leads set ${sets.join(", ")} where id = $1`, params);
    if (raw.status && raw.status !== cur.status) await timeline(db, ctx, "lead", id, "status_changed", `Status: ${LEAD_STATUS_LABELS[cur.status]} → ${LEAD_STATUS_LABELS[String(raw.status)]}`, { from: cur.status, to: raw.status });
    else await timeline(db, ctx, "lead", id, "updated", `Updated ${Object.keys(raw).filter((k) => (EDITABLE as readonly string[]).includes(k)).slice(0, 4).join(", ") || "details"}`);
    if (score !== cur.score) await timeline(db, ctx, "lead", id, "score_changed", `Score ${cur.score} → ${score}`, { from: cur.score, to: score });
    if (raw.owner_id !== undefined && raw.owner_id !== cur.owner_id) await assignLeadsTx(db, ctx, [id], (raw.owner_id as string) || null);
    return { score };
  });
}

export async function assignLeadsTx(db: Db, ctx: Ctx, ids: string[], ownerId: string | null) {
  if (!can(ctx.role, "leads", "assign")) throw new ForbiddenError("Only managers and admins can assign leads.");
  if (ownerId) {
    const ok = await db.one("select 1 from memberships where org_id = $1 and user_id = $2 and status = 'active'", [ctx.orgId, ownerId]);
    if (!ok) throw new ValidationError("That user is not an active member of this organisation.");
  }
  const leads = await db.many<{ id: string; full_name: string; owner_id: string | null; status: string; score: number }>("select id, full_name, owner_id, status, score from leads where id = any($1) and archived_at is null", [ids]);
  const org = await db.one<{ settings: { sla_minutes?: number } }>("select settings from organisations where id = $1", [ctx.orgId]);
  for (const l of leads) {
    if (l.owner_id === ownerId) continue;
    await db.exec("update leads set owner_id = $2, status = case when status = 'unassigned' and $2::uuid is not null then 'new' when $2::uuid is null and status = 'new' then 'unassigned' else status end where id = $1", [l.id, ownerId]);
    await db.exec("update tasks set owner_id = $2 where lead_id = $1 and status in ('todo','in_progress','waiting') and owner_id is not distinct from $3", [l.id, ownerId, l.owner_id]);
    await audit(db, ctx, "record.transferred", "lead", l.id, { owner_id: [l.owner_id, ownerId] });
    if (ownerId) await afterAssign(db, ctx, l.id, l.full_name, ownerId, l.score, !l.owner_id, org?.settings?.sla_minutes ?? 15);
    else await timeline(db, ctx, "lead", l.id, "unassigned", "Owner removed");
  }
  return leads.length;
}

export async function bulkLeads(ctx: Ctx, ids: string[], op: { kind: "assign"; owner_id: string | null } | { kind: "status"; status: string } | { kind: "tag"; tag: string } | { kind: "archive" } | { kind: "restore" }) {
  if (!ids.length) throw new ValidationError("Select at least one lead.");
  if (ids.length > 1000) throw new ValidationError("Bulk actions are limited to 1,000 records.");
  return withTenant(ctx, async (db) => {
    switch (op.kind) {
      case "assign": return assignLeadsTx(db, ctx, ids, op.owner_id);
      case "status": {
        assertCan(ctx.role, "leads", "edit");
        const rows = await db.many<{ id: string; status: string }>("update leads l set status = $2 from (select id, status old from leads where id = any($1) and status <> 'converted' and archived_at is null) o where l.id = o.id returning l.id, o.old status", [ids, op.status]);
        for (const r of rows) await timeline(db, ctx, "lead", r.id, "status_changed", `Status: ${LEAD_STATUS_LABELS[r.status]} → ${LEAD_STATUS_LABELS[op.status]} (bulk)`);
        return rows.length;
      }
      case "tag": {
        assertCan(ctx.role, "leads", "edit");
        const tag = op.tag.trim(); if (!tag) throw new ValidationError("Enter a tag.");
        return db.exec("update leads set tags = array_append(tags, $2) where id = any($1) and not ($2 = any(tags))", [ids, tag]);
      }
      case "archive": case "restore": {
        assertCan(ctx.role, "leads", "archive");
        const n = await db.exec(`update leads set archived_at = ${op.kind === "archive" ? "now()" : "null"} where id = any($1)`, [ids]);
        await audit(db, ctx, op.kind === "archive" ? "record.archived" : "record.restored", "lead", null, { ids, count: n });
        return n;
      }
    }
  });
}

export interface ConvertInput { company_id?: string | null; contact_id?: string | null; create_opportunity: boolean; opportunity_name?: string; pipeline_id?: string; value?: number | null; currency?: string; expected_close_date?: string | null }

/** Converts a lead into contact + company (re-using matches) and optionally an opportunity. */
export async function convertLead(ctx: Ctx, id: string, input: ConvertInput) {
  assertCan(ctx.role, "leads", "edit");
  return withTenant(ctx, async (db) => {
    const l = await db.one<Record<string, string | null> & { id: string; services: string[]; tags: string[] }>("select * from leads where id = $1 and archived_at is null for update", [id]);
    if (!l) throw new NotFoundError();
    if (l.status === "converted") throw new ValidationError("This lead has already been converted.");
    const owner = l.owner_id ?? ctx.userId;

    let companyId = input.company_id ?? null;
    if (!companyId && l.company_name) {
      const domain = l.website ? l.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]!.toLowerCase() : null;
      companyId = (await db.one<{ id: string }>("select id from companies where org_id = $1 and archived_at is null and (lower(name) = lower($2) or (domain is not null and domain = $3)) limit 1", [ctx.orgId, l.company_name, domain]))?.id ?? null;
      if (!companyId) {
        companyId = (await db.one<{ id: string }>(`insert into companies(org_id, name, domain, website, industry, company_size, country, city, owner_id, linkedin_url, created_by)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,null,$10) returning id`, [ctx.orgId, l.company_name, domain, l.website, l.industry, l.company_size, l.country, l.city, owner, ctx.userId]))!.id;
        await timeline(db, ctx, "company", companyId, "created", `Created from lead ${l.full_name}`, { lead_id: id });
      }
    }
    let contactId = input.contact_id ?? null;
    if (!contactId && l.email) contactId = (await db.one<{ id: string }>("select id from contacts where org_id = $1 and email = $2 and archived_at is null limit 1", [ctx.orgId, l.email]))?.id ?? null;
    if (!contactId) {
      contactId = (await db.one<{ id: string }>(`insert into contacts(org_id, company_id, first_name, last_name, job_title, email, phone, whatsapp, country, city, linkedin_url, owner_id, consent_status, tags, created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
        [ctx.orgId, companyId, l.first_name || l.full_name, l.last_name, l.job_title, l.email, l.phone, l.whatsapp, l.country, l.city, l.linkedin_url, owner, l.consent_status, l.tags, ctx.userId]))!.id;
      await timeline(db, ctx, "contact", contactId, "created", `Created from lead ${l.full_name}`, { lead_id: id });
    }
    let oppId: string | null = null;
    if (input.create_opportunity) {
      const pipelineId = input.pipeline_id ?? (await db.one<{ id: string }>("select id from pipelines where org_id = $1 and is_default limit 1", [ctx.orgId]))?.id;
      const stage = await db.one<{ id: string; probability: number }>("select id, probability from pipeline_stages where pipeline_id = $1 and kind = 'open' order by position offset 3 limit 1", [pipelineId])
        ?? await db.one<{ id: string; probability: number }>("select id, probability from pipeline_stages where pipeline_id = $1 order by position limit 1", [pipelineId]);
      if (!pipelineId || !stage) throw new ValidationError("No pipeline is configured.");
      oppId = (await db.one<{ id: string }>(`insert into opportunities(org_id, name, company_id, contact_id, lead_id, owner_id, pipeline_id, stage_id, value, currency, probability, expected_close_date, services, source_id, campaign_id, created_by, last_activity_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now()) returning id`,
        [ctx.orgId, input.opportunity_name || `${l.company_name ?? l.full_name} — ${(l.services?.[0] ?? "New business")}`, companyId, contactId, id, owner, pipelineId, stage.id,
         input.value ?? l.expected_value ?? l.estimated_budget ?? 0, input.currency ?? l.currency, stage.probability, input.expected_close_date ?? null, l.services, l.source_id, l.campaign_id, ctx.userId]))!.id;
      await db.exec("insert into opportunity_stage_history(org_id, opportunity_id, to_stage_id, to_probability, user_id) values ($1,$2,$3,$4,$5)", [ctx.orgId, oppId, stage.id, stage.probability, ctx.userId]);
      await timeline(db, ctx, "opportunity", oppId, "created", `Created from lead ${l.full_name}`, { lead_id: id });
    }
    await db.exec("update leads set status = 'converted', converted_at = now(), converted_contact_id = $2, converted_company_id = $3, converted_opportunity_id = $4 where id = $1", [id, contactId, companyId, oppId]);
    await db.exec("update activities set contact_id = coalesce(contact_id, $2), company_id = coalesce(company_id, $3), opportunity_id = coalesce(opportunity_id, $4) where lead_id = $1", [id, contactId, companyId, oppId]);
    await db.exec("update tasks set contact_id = coalesce(contact_id, $2), opportunity_id = coalesce(opportunity_id, $3) where lead_id = $1", [id, contactId, oppId]);
    await timeline(db, ctx, "lead", id, "converted", "Converted to contact" + (companyId ? ", company" : "") + (oppId ? " and opportunity" : ""), { contact_id: contactId, company_id: companyId, opportunity_id: oppId });
    return { contactId, companyId, opportunityId: oppId };
  });
}

/** Merges `secondaryId` into `primaryId`: fills empty fields, moves activities/tasks/timeline, archives the secondary. */
export async function mergeLeads(ctx: Ctx, primaryId: string, secondaryId: string) {
  assertCan(ctx.role, "leads", "archive");
  if (primaryId === secondaryId) throw new ValidationError("Choose two different leads.");
  return withTenant(ctx, async (db) => {
    const [a, b] = await Promise.all([db.one<Record<string, unknown>>("select * from leads where id = $1", [primaryId]), db.one<Record<string, unknown>>("select * from leads where id = $1", [secondaryId])]);
    if (!a || !b) throw new NotFoundError();
    const fill = ["job_title", "company_name", "email", "phone", "whatsapp", "country", "city", "website", "linkedin_url", "industry", "company_size", "estimated_budget", "expected_value", "timeframe", "notes"];
    const sets = fill.filter((k) => a[k] == null && b[k] != null);
    if (sets.length) await db.exec(`update leads set ${sets.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1`, [primaryId, ...sets.map((k) => b[k])]);
    await db.exec("update leads set tags = (select array_agg(distinct t) from unnest(tags || $2::text[]) t) where id = $1", [primaryId, b.tags]);
    await db.exec("update activities set lead_id = $1 where lead_id = $2", [primaryId, secondaryId]);
    await db.exec("update tasks set lead_id = $1 where lead_id = $2", [primaryId, secondaryId]);
    await db.exec("update leads set archived_at = now(), notes = coalesce(notes,'') || $2 where id = $1", [secondaryId, `\n[Merged into ${String(a.full_name)}]`]);
    await timeline(db, ctx, "lead", primaryId, "merged", `Merged duplicate ${String(b.full_name)}`, { merged_id: secondaryId, filled: sets });
    await audit(db, ctx, "record.merged", "lead", primaryId, { secondary: secondaryId });
  });
}

export async function leadDuplicates(ctx: Ctx, lead: { id: string; email?: string | null; phone?: string | null; company_name?: string | null; website?: string | null }) {
  return withTenant(ctx, (db) => findDuplicates(db, ctx.orgId, lead, lead.id));
}
