import "server-only";
import { withTenant } from "../db";
import type { Ctx } from "../types";
import { assertCan, can, NotFoundError, ValidationError } from "../rbac";
import { companySchema, contactSchema, normalizePhone } from "../validation";
import { audit, timeline } from "./journal";

const domainOf = (w?: string | null) => (w ? w.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]!.toLowerCase() : null);

// ───── Companies ─────
export interface CompanyFilters { q?: string; owner?: string; status?: string; industry?: string; country?: string; archived?: string; page?: number; per?: number; sort?: string; dir?: string }

export async function listCompanies(ctx: Ctx, f: CompanyFilters) {
  assertCan(ctx.role, "companies", "view");
  const w = ["c.org_id = $1", f.archived === "1" ? "c.archived_at is not null" : "c.archived_at is null"]; const p: unknown[] = [ctx.orgId];
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replaceAll("?", `$${p.length}`)); };
  if (f.q) add("(c.name ilike '%' || ? || '%' or c.domain::text ilike '%' || ? || '%' or c.search @@ plainto_tsquery('simple', ?))", f.q);
  if (f.owner === "me") add("c.owner_id = ?", ctx.userId); else if (f.owner) add("c.owner_id = ?", f.owner);
  if (f.status) add("c.client_status = ?", f.status);
  if (f.industry) add("c.industry = ?", f.industry);
  if (f.country) add("c.country = ?", f.country);
  const per = Math.min(f.per ?? 50, 200), page = Math.max(f.page ?? 1, 1);
  const sorts: Record<string, string> = { name: "c.name", created: "c.created_at", ltv: "ltv" };
  return withTenant(ctx, async (db) => {
    const rows = await db.many<{ id: string; name: string; domain: string | null; industry: string | null; country: string | null; city: string | null; client_status: string; health: string | null; owner_name: string | null; contacts: number; open_deals: number; ltv: string; created_at: string }>(
      `select c.id, c.name, c.domain, c.industry, c.country, c.city, c.client_status, c.health, u.name owner_name, c.created_at,
              (select count(*)::int from contacts x where x.company_id = c.id and x.archived_at is null) contacts,
              (select count(*)::int from opportunities o where o.company_id = c.id and o.status = 'open' and o.archived_at is null) open_deals,
              coalesce((select sum(o.value * coalesce(fx.rate_to_base,1)) from opportunities o left join fx_rates fx on fx.org_id = o.org_id and fx.currency = o.currency where o.company_id = c.id and o.status = 'won'), 0) ltv
         from companies c left join users u on u.id = c.owner_id where ${w.join(" and ")}
        order by ${sorts[f.sort ?? "name"] ?? "c.name"} ${f.dir === "desc" ? "desc" : "asc"} limit ${per} offset ${(page - 1) * per}`, p);
    const total = (await db.one<{ n: number }>(`select count(*)::int n from companies c where ${w.join(" and ")}`, p))!.n;
    return { rows: can(ctx.role, "reports", "view") ? rows : rows.map((r) => ({ ...r, ltv: "0" })), total, page, per };
  });
}

export async function getCompany(ctx: Ctx, id: string) {
  assertCan(ctx.role, "companies", "view");
  return withTenant(ctx, async (db) => {
    const c = await db.one<Record<string, unknown> & { id: string; name: string }>(`select c.*, u.name owner_name, p.name parent_name,
        coalesce((select sum(o.value * coalesce(fx.rate_to_base,1)) from opportunities o left join fx_rates fx on fx.org_id = o.org_id and fx.currency = o.currency where o.company_id = c.id and o.status = 'won'), 0) ltv
        from companies c left join users u on u.id = c.owner_id left join companies p on p.id = c.parent_id where c.id = $1`, [id]);
    if (!c) throw new NotFoundError();
    const [contacts, subsidiaries] = await Promise.all([
      db.many<{ id: string; full_name: string; job_title: string | null; email: string | null; phone: string | null; decision_role: string | null }>("select id, full_name, job_title, email, phone, decision_role from contacts where company_id = $1 and archived_at is null order by full_name", [id]),
      db.many<{ id: string; name: string }>("select id, name from companies where parent_id = $1 and archived_at is null", [id]),
    ]);
    await db.exec(`insert into recent_records(org_id, user_id, entity_type, entity_id, label) values ($1,$2,'company',$3,$4)
                   on conflict (org_id, user_id, entity_type, entity_id) do update set viewed_at = now()`, [ctx.orgId, ctx.userId, id, c.name]);
    return { company: c, contacts, subsidiaries };
  });
}

export async function saveCompany(ctx: Ctx, id: string | null, raw: Record<string, unknown>) {
  assertCan(ctx.role, "companies", id ? "edit" : "create");
  const v = companySchema.parse(raw);
  const phone = normalizePhone(v.phone, v.country);
  if (phone.error) throw new ValidationError("Please correct the highlighted fields.", { phone: [phone.error] });
  const domain = domainOf(v.website);
  return withTenant(ctx, async (db) => {
    if (!id) {
      const dup = await db.one<{ id: string; name: string }>("select id, name from companies where org_id = $1 and archived_at is null and (lower(name) = lower($2) or (domain is not null and domain = $3))", [ctx.orgId, v.name, domain]);
      if (dup && raw.allow_duplicate !== "1") throw new ValidationError(`A company named "${dup.name}" already exists.`, { name: ["Possible duplicate"] });
      const owner = can(ctx.role, "companies", "assign") ? v.owner_id ?? ctx.userId : ctx.userId;
      const r = await db.one<{ id: string }>(`insert into companies(org_id, name, domain, website, industry, company_size, revenue_range, phone, email, linkedin_url, country, city, billing_address, owner_id, parent_id,
          client_status, health, operating_markets, active_services, tags, notes, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) returning id`,
        [ctx.orgId, v.name, domain, v.website, v.industry, v.company_size, v.revenue_range, phone.value, v.email, v.linkedin_url, v.country, v.city, v.billing_address, owner, v.parent_id,
         v.client_status ?? "prospect", v.health ?? null, v.operating_markets ?? [], v.active_services ?? [], v.tags ?? [], v.notes, ctx.userId]);
      await timeline(db, ctx, "company", r!.id, "created", "Company created");
      return r!.id;
    }
    const keys = Object.keys(raw).filter((k) => k in companySchema.shape && k !== "owner_id");
    const vals = keys.map((k) => (k === "phone" ? phone.value : (v as Record<string, unknown>)[k] ?? (["operating_markets", "active_services", "tags"].includes(k) ? [] : null)));
    if (keys.includes("website")) { keys.push("domain"); vals.push(domain); }
    if (keys.length) {
      const n = await db.exec(`update companies set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1 and archived_at is null`, [id, ...vals]);
      if (!n) throw new NotFoundError();
    }
    if ("owner_id" in raw && can(ctx.role, "companies", "assign")) {
      await db.exec("update companies set owner_id = $2 where id = $1", [id, v.owner_id ?? null]);
      await audit(db, ctx, "record.transferred", "company", id, { owner_id: v.owner_id });
    }
    await timeline(db, ctx, "company", id, "updated", `Updated ${keys.slice(0, 4).join(", ") || "owner"}`);
    return id;
  });
}

// ───── Contacts ─────
export interface ContactFilters { q?: string; owner?: string; company?: string; consent?: string; archived?: string; page?: number; per?: number }

export async function listContacts(ctx: Ctx, f: ContactFilters) {
  assertCan(ctx.role, "contacts", "view");
  const w = ["x.org_id = $1", f.archived === "1" ? "x.archived_at is not null" : "x.archived_at is null"]; const p: unknown[] = [ctx.orgId];
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replaceAll("?", `$${p.length}`)); };
  if (f.q) add("(x.full_name ilike '%' || ? || '%' or x.email::text ilike '%' || ? || '%' or x.phone ilike '%' || ? || '%' or c.name ilike '%' || ? || '%')", f.q);
  if (f.owner === "me") add("x.owner_id = ?", ctx.userId); else if (f.owner) add("x.owner_id = ?", f.owner);
  if (f.company) add("x.company_id = ?", f.company);
  if (f.consent) add("x.consent_status = ?", f.consent);
  const per = Math.min(f.per ?? 50, 200), page = Math.max(f.page ?? 1, 1);
  return withTenant(ctx, async (db) => {
    const rows = await db.many<{ id: string; full_name: string; job_title: string | null; email: string | null; phone: string | null; company_id: string | null; company_name: string | null; owner_name: string | null; consent_status: string; decision_role: string | null; created_at: string }>(
      `select x.id, x.full_name, x.job_title, x.email, coalesce(x.phone, x.mobile) phone, x.company_id, c.name company_name, u.name owner_name, x.consent_status, x.decision_role, x.created_at
         from contacts x left join companies c on c.id = x.company_id left join users u on u.id = x.owner_id where ${w.join(" and ")}
        order by x.full_name limit ${per} offset ${(page - 1) * per}`, p);
    const total = (await db.one<{ n: number }>(`select count(*)::int n from contacts x left join companies c on c.id = x.company_id where ${w.join(" and ")}`, p))!.n;
    return { rows, total, page, per };
  });
}

export async function getContact(ctx: Ctx, id: string) {
  assertCan(ctx.role, "contacts", "view");
  return withTenant(ctx, async (db) => {
    const c = await db.one<Record<string, unknown> & { id: string; full_name: string }>(
      "select x.*, c.name company_name, u.name owner_name from contacts x left join companies c on c.id = x.company_id left join users u on u.id = x.owner_id where x.id = $1", [id]);
    if (!c) throw new NotFoundError();
    await db.exec(`insert into recent_records(org_id, user_id, entity_type, entity_id, label) values ($1,$2,'contact',$3,$4)
                   on conflict (org_id, user_id, entity_type, entity_id) do update set viewed_at = now()`, [ctx.orgId, ctx.userId, id, c.full_name]);
    return c;
  });
}

export async function saveContact(ctx: Ctx, id: string | null, raw: Record<string, unknown>) {
  assertCan(ctx.role, "contacts", id ? "edit" : "create");
  const v = contactSchema.parse(raw);
  const errs: Record<string, string[]> = {};
  const norm: Record<string, string | null> = {};
  for (const k of ["phone", "mobile", "whatsapp"] as const) { const r = normalizePhone(v[k], v.country); if (r.error) errs[k] = [r.error]; norm[k] = r.value; }
  if (Object.keys(errs).length) throw new ValidationError("Please correct the highlighted fields.", errs);
  return withTenant(ctx, async (db) => {
    if (!id) {
      if (v.email && raw.allow_duplicate !== "1") {
        const dup = await db.one<{ full_name: string }>("select full_name from contacts where org_id = $1 and email = $2 and archived_at is null", [ctx.orgId, v.email]);
        if (dup) throw new ValidationError(`${dup.full_name} already uses this email.`, { email: ["Possible duplicate"] });
      }
      const owner = can(ctx.role, "contacts", "assign") ? v.owner_id ?? ctx.userId : ctx.userId;
      const r = await db.one<{ id: string }>(`insert into contacts(org_id, company_id, first_name, last_name, job_title, email, phone, mobile, whatsapp, preferred_channel, decision_role, country, city, linkedin_url, owner_id, consent_status, tags, notes, created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning id`,
        [ctx.orgId, v.company_id, v.first_name, v.last_name, v.job_title, v.email, norm.phone, norm.mobile, norm.whatsapp, v.preferred_channel ?? null, v.decision_role ?? null, v.country, v.city, v.linkedin_url, owner, v.consent_status ?? "unknown", v.tags ?? [], v.notes, ctx.userId]);
      await timeline(db, ctx, "contact", r!.id, "created", "Contact created");
      if (v.company_id) await timeline(db, ctx, "company", v.company_id, "contact_added", `Contact added: ${v.first_name} ${v.last_name ?? ""}`.trim(), { contact_id: r!.id });
      return r!.id;
    }
    const keys = Object.keys(raw).filter((k) => k in contactSchema.shape && k !== "owner_id");
    const vals = keys.map((k) => (k in norm ? norm[k] : (v as Record<string, unknown>)[k] ?? (k === "tags" ? [] : null)));
    if (keys.length) {
      const n = await db.exec(`update contacts set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1 and archived_at is null`, [id, ...vals]);
      if (!n) throw new NotFoundError();
    }
    if ("owner_id" in raw && can(ctx.role, "contacts", "assign")) {
      await db.exec("update contacts set owner_id = $2 where id = $1", [id, v.owner_id ?? null]);
      await audit(db, ctx, "record.transferred", "contact", id, { owner_id: v.owner_id });
    }
    await timeline(db, ctx, "contact", id, "updated", `Updated ${keys.slice(0, 4).join(", ") || "owner"}`);
    return id;
  });
}

export async function archiveRecord(ctx: Ctx, entity: "companies" | "contacts", id: string, restore = false) {
  assertCan(ctx.role, entity, "archive");
  return withTenant(ctx, async (db) => {
    await db.exec(`update ${entity} set archived_at = ${restore ? "null" : "now()"} where id = $1`, [id]);
    await audit(db, ctx, restore ? "record.restored" : "record.archived", entity === "companies" ? "company" : "contact", id);
  });
}
