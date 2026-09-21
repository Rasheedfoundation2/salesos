import "server-only";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { withTenant } from "../db";
import type { Ctx } from "../types";
import { assertCan, ValidationError } from "../rbac";
import { leadSchema, normalizePhone } from "../validation";
import { createLeadTx, findDuplicates } from "./leads";
import { pickOwner } from "./assignment";
import { audit, notify } from "./journal";

export const LEAD_IMPORT_FIELDS: { key: string; label: string; synonyms: string[] }[] = [
  { key: "full_name", label: "Full name", synonyms: ["name", "full name", "contact name", "lead name", "contact"] },
  { key: "first_name", label: "First name", synonyms: ["first", "firstname", "first name", "given name"] },
  { key: "last_name", label: "Last name", synonyms: ["last", "lastname", "last name", "surname", "family name"] },
  { key: "job_title", label: "Job title", synonyms: ["title", "job title", "designation", "position", "role"] },
  { key: "company_name", label: "Company", synonyms: ["company", "company name", "organisation", "organization", "business", "account"] },
  { key: "email", label: "Email", synonyms: ["email", "e-mail", "email address", "mail"] },
  { key: "phone", label: "Phone", synonyms: ["phone", "mobile", "phone number", "mobile number", "contact number", "tel", "telephone", "cell"] },
  { key: "whatsapp", label: "WhatsApp", synonyms: ["whatsapp", "whatsapp number", "wa"] },
  { key: "country", label: "Country", synonyms: ["country", "nation"] },
  { key: "city", label: "City", synonyms: ["city", "town", "emirate", "location"] },
  { key: "website", label: "Website", synonyms: ["website", "url", "web", "site", "domain"] },
  { key: "linkedin_url", label: "LinkedIn URL", synonyms: ["linkedin", "linkedin url", "linkedin profile"] },
  { key: "industry", label: "Industry", synonyms: ["industry", "sector", "vertical"] },
  { key: "company_size", label: "Company size", synonyms: ["company size", "size", "employees", "headcount"] },
  { key: "estimated_budget", label: "Estimated budget", synonyms: ["budget", "estimated budget"] },
  { key: "expected_value", label: "Expected value", synonyms: ["value", "deal value", "expected value", "amount"] },
  { key: "currency", label: "Currency", synonyms: ["currency", "ccy"] },
  { key: "services", label: "Required services (comma-separated)", synonyms: ["services", "service", "interested in", "requirement", "required services"] },
  { key: "source", label: "Lead source (name)", synonyms: ["source", "lead source", "channel"] },
  { key: "campaign", label: "Campaign (name)", synonyms: ["campaign", "campaign name", "utm campaign"] },
  { key: "owner_email", label: "Owner (email)", synonyms: ["owner", "owner email", "assigned to", "sales rep", "agent", "rep email", "salesperson"] },
  { key: "status", label: "Status", synonyms: ["status", "lead status", "stage"] },
  { key: "priority", label: "Priority", synonyms: ["priority"] },
  { key: "timeframe", label: "Timeframe", synonyms: ["timeframe", "timeline", "when"] },
  { key: "tags", label: "Tags (comma-separated)", synonyms: ["tags", "labels", "tag"] },
  { key: "notes", label: "Notes", synonyms: ["notes", "note", "comments", "remarks", "description", "message"] },
];

export async function parseFile(buf: Buffer, filename: string): Promise<{ headers: string[]; rows: string[][] }> {
  const lower = filename.toLowerCase();
  let table: string[][];
  if (lower.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new ValidationError("The workbook has no sheets.");
    table = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const cell = row.getCell(c); const v = cell.value as unknown;
        let s = "";
        if (v == null) s = "";
        else if (v instanceof Date) s = v.toISOString();
        else if (typeof v === "object" && v && "text" in v) s = String((v as { text: unknown }).text);
        else if (typeof v === "object" && v && "result" in v) s = String((v as { result: unknown }).result ?? "");
        else if (typeof v === "object" && v && "richText" in v) s = ((v as { richText: { text: string }[] }).richText).map((r) => r.text).join("");
        else s = String(v);
        vals.push(s.trim());
      }
      table.push(vals);
    });
  } else if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv")) {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const res = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    table = res.data.map((r) => r.map((c) => String(c ?? "").trim()));
  } else throw new ValidationError("Upload a .csv or .xlsx file.");
  if (table.length < 2) throw new ValidationError("The file needs a header row and at least one data row.");
  const headers = table[0]!.map((h, i) => h || `Column ${i + 1}`);
  const rows = table.slice(1).filter((r) => r.some((c) => c));
  if (rows.length > 10000) throw new ValidationError("Import up to 10,000 rows per file.");
  return { headers, rows };
}

export function suggestMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}; const used = new Set<string>();
  headers.forEach((h, i) => {
    const n = h.toLowerCase().replace(/[_\-]+/g, " ").trim();
    const f = LEAD_IMPORT_FIELDS.find((f) => !used.has(f.key) && (f.key === n || f.synonyms.includes(n)))
      ?? LEAD_IMPORT_FIELDS.find((f) => !used.has(f.key) && f.synonyms.some((s) => s.length > 3 && n.includes(s)));
    if (f) { map[String(i)] = f.key; used.add(f.key); }
  });
  return map;
}

export interface ImportOptions {
  mapping: Record<string, string>; // column index → field key
  duplicateMode: "skip" | "create" | "update";
  ownerMode: "column" | "user" | "round_robin" | "rule" | "none";
  ownerId?: string | null;
  roundRobinUsers?: string[];
  sourceId?: string | null;
  tags?: string[];
  createTasks: boolean;
  dryRun: boolean;
}

export interface ImportReport {
  total: number; created: number; updated: number; skipped: number; errors: { row: number; message: string; data?: string }[];
  batchId?: string; byOwner: Record<string, number>; preview?: Record<string, unknown>[];
}

const STATUS_ALIASES: Record<string, string> = { new: "new", open: "new", contacted: "contacted", qualified: "qualified", unqualified: "unqualified", junk: "unqualified", nurture: "nurturing", nurturing: "nurturing", "do not contact": "do_not_contact", dnc: "do_not_contact", researching: "researching", "attempting contact": "attempting_contact" };

export async function runLeadImport(ctx: Ctx, file: { name: string; buf: Buffer }, opts: ImportOptions): Promise<ImportReport> {
  assertCan(ctx.role, "import", "import");
  const { rows } = await parseFile(file.buf, file.name);
  const report: ImportReport = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [], byOwner: {}, preview: [] };
  const byKey = (r: string[]) => { const o: Record<string, string> = {}; for (const [col, key] of Object.entries(opts.mapping)) if (key && r[Number(col)] != null && r[Number(col)] !== "") o[key] = r[Number(col)]!; return o; };

  return withTenant(ctx, async (db) => {
    const users = await db.many<{ id: string; email: string; name: string }>("select u.id, u.email, u.name from memberships m join users u on u.id = m.user_id where m.org_id = $1 and m.status = 'active'", [ctx.orgId]);
    const sources = await db.many<{ id: string; name: string }>("select id, name from lead_sources where org_id = $1", [ctx.orgId]);
    const campaigns = await db.many<{ id: string; name: string }>("select id, name from campaigns where org_id = $1", [ctx.orgId]);
    const defaultSource = opts.sourceId ?? sources.find((s) => s.name === "CSV import")?.id ?? null;
    if (opts.ownerMode === "user" && !users.some((u) => u.id === opts.ownerId)) throw new ValidationError("Choose a valid owner.");

    let batchId: string | undefined;
    if (!opts.dryRun) {
      batchId = (await db.one<{ id: string }>("insert into import_batches(org_id, entity, filename, status, total_rows, created_by) values ($1,'leads',$2,'running',$3,$4) returning id", [ctx.orgId, file.name, rows.length, ctx.userId]))!.id;
      report.batchId = batchId;
    }
    const seenEmails = new Set<string>(), seenPhones = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNo = i + 2; // header is row 1
      const r = byKey(rows[i]!);
      await db.exec("savepoint import_row");
      try {
        const raw: Record<string, unknown> = { ...r };
        delete raw.source; delete raw.campaign; delete raw.owner_email;
        if (r.status) { const st = STATUS_ALIASES[r.status.toLowerCase()]; if (st) raw.status = st; else delete raw.status; }
        if (r.priority) raw.priority = ["low", "medium", "high", "urgent"].includes(r.priority.toLowerCase()) ? r.priority.toLowerCase() : undefined;
        if (r.currency) raw.currency = r.currency.toUpperCase();
        if (r.website && !/^https?:\/\//i.test(r.website)) raw.website = `https://${r.website}`;
        raw.source_id = (r.source && sources.find((s) => s.name.toLowerCase() === r.source!.toLowerCase())?.id) || defaultSource;
        if (r.campaign) raw.campaign_id = campaigns.find((c) => c.name.toLowerCase() === r.campaign!.toLowerCase())?.id ?? null;
        raw.tags = [...(r.tags ? r.tags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean) : []), ...(opts.tags ?? [])];

        // Owner
        let ownerId: string | null = null;
        if (opts.ownerMode === "column") {
          if (r.owner_email) {
            const u = users.find((u) => u.email.toLowerCase() === r.owner_email!.toLowerCase() || u.name.toLowerCase() === r.owner_email!.toLowerCase());
            if (!u) throw new ValidationError(`Owner "${r.owner_email}" is not a member of this organisation`);
            ownerId = u.id;
          }
        } else if (opts.ownerMode === "user") ownerId = opts.ownerId ?? null;
        raw.owner_id = ownerId; // round robin / rule owners are picked after validation so skipped rows don't consume a turn

        // Validate
        const parsed = leadSchema.safeParse(raw);
        if (!parsed.success) throw new ValidationError(parsed.error.issues.map((x) => `${String(x.path[0] ?? "")}: ${x.message}`).join("; "));
        const ph = normalizePhone(parsed.data.phone, parsed.data.country);
        if (ph.error) throw new ValidationError(`phone: ${ph.error} (${parsed.data.phone})`);
        const email = parsed.data.email ?? null; const phone = ph.value;

        // In-file duplicates
        if ((email && seenEmails.has(email)) || (phone && seenPhones.has(phone))) { report.skipped++; report.errors.push({ row: rowNo, message: "Duplicate of an earlier row in this file — skipped" }); await db.exec("release savepoint import_row"); continue; }
        if (email) seenEmails.add(email); if (phone) seenPhones.add(phone);

        // Existing duplicates
        const dups = (await findDuplicates(db, ctx.orgId, { email, phone })).filter((d) => d.entity !== "company");
        if (dups.length && opts.duplicateMode === "skip") { report.skipped++; report.errors.push({ row: rowNo, message: `Skipped — ${dups[0]!.reason.toLowerCase()} as ${dups[0]!.entity} "${dups[0]!.label}"` }); await db.exec("release savepoint import_row"); continue; }
        if (dups.length && opts.duplicateMode === "update") {
          const lead = dups.find((d) => d.entity === "lead");
          if (!lead) { report.skipped++; report.errors.push({ row: rowNo, message: `Skipped — already a contact "${dups[0]!.label}"` }); await db.exec("release savepoint import_row"); continue; }
          if (!opts.dryRun) {
            const fill = ["job_title", "company_name", "phone", "whatsapp", "country", "city", "website", "linkedin_url", "industry", "company_size", "estimated_budget", "timeframe"] as const;
            const vals = fill.map((k) => (k === "phone" ? phone : (parsed.data as Record<string, unknown>)[k] ?? null));
            await db.exec(`update leads set ${fill.map((k, j) => `${k} = coalesce(${k}, $${j + 2})`).join(", ")}, tags = (select array_agg(distinct t) from unnest(tags || $${fill.length + 2}::text[]) t) where id = $1`,
              [lead.id, ...vals, parsed.data.tags ?? []]);
          }
          report.updated++; await db.exec("release savepoint import_row"); continue;
        }
        if (opts.dryRun) {
          report.created++;
          if (report.preview!.length < 10) report.preview!.push({ row: rowNo, name: parsed.data.full_name ?? [parsed.data.first_name, parsed.data.last_name].filter(Boolean).join(" "), email, phone, company: parsed.data.company_name, owner: users.find((u) => u.id === ownerId)?.name ?? (opts.ownerMode === "round_robin" || opts.ownerMode === "rule" ? "Auto-assigned" : "Unassigned") });
          await db.exec("release savepoint import_row"); continue;
        }
        if (opts.ownerMode === "round_robin") ownerId = await pickOwner(db, ctx, { country: r.country }, "round_robin", opts.roundRobinUsers);
        else if (opts.ownerMode === "rule") ownerId = await pickOwner(db, ctx, { country: r.country });
        {
          const res = await createLeadTx(db, ctx, { ...parsed.data, phone, owner_id: ownerId }, { allowDuplicate: true, importBatchId: batchId, skipFirstTask: !opts.createTasks, sourceName: "CSV import", quiet: true, assignmentMethod: opts.ownerMode === "none" ? "manual" : opts.ownerMode === "column" || opts.ownerMode === "user" ? "manual" : undefined });
          report.created++;
          if (res.owner_id) report.byOwner[res.owner_id] = (report.byOwner[res.owner_id] ?? 0) + 1;
        }
        await db.exec("release savepoint import_row");
      } catch (e) {
        await db.exec("rollback to savepoint import_row");
        await db.exec("release savepoint import_row");
        report.errors.push({ row: rowNo, message: e instanceof Error ? e.message : "Invalid row", data: rows[i]!.slice(0, 6).join(", ") });
      }
    }
    if (batchId) {
      const errorCount = report.errors.filter((e) => !e.message.startsWith("Skipped") && !e.message.startsWith("Duplicate")).length;
      await db.exec("update import_batches set status = 'completed', created_count = $2, skipped_count = $3, error_count = $4, errors = $5 where id = $1",
        [batchId, report.created, report.skipped + report.updated, errorCount, JSON.stringify(report.errors.slice(0, 1000))]);
      for (const [owner, n] of Object.entries(report.byOwner)) {
        if (owner !== ctx.userId) await notify(db, ctx, owner, "assignment", `${n} new lead${n === 1 ? "" : "s"} assigned to you`, `From import ${file.name}`, "/leads?owner=me&status=new");
      }
      await notify(db, ctx, ctx.userId, "import", `Import complete: ${report.created} created`, `${report.updated} updated, ${report.skipped} skipped, ${report.errors.length} messages`, "/leads/import");
      await audit(db, ctx, "import.completed", "import", batchId, { file: file.name, created: report.created, updated: report.updated, skipped: report.skipped });
    }
    return report;
  });
}

export async function listImports(ctx: Ctx) {
  return withTenant(ctx, (db) => db.many<{ id: string; filename: string; status: string; total_rows: number; created_count: number; skipped_count: number; error_count: number; created_at: string; undone_at: string | null; user_name: string | null; errors: { row: number; message: string }[] }>(
    "select b.*, u.name user_name from import_batches b left join users u on u.id = b.created_by where b.org_id = $1 order by b.created_at desc limit 20", [ctx.orgId]));
}

/** Undo an import: archives leads created by the batch that have not since been converted. */
export async function undoImport(ctx: Ctx, batchId: string) {
  assertCan(ctx.role, "import", "import");
  return withTenant(ctx, async (db) => {
    const b = await db.one<{ undone_at: string | null; created_at: string }>("select undone_at, created_at from import_batches where id = $1", [batchId]);
    if (!b) throw new ValidationError("Import not found.");
    if (b.undone_at) throw new ValidationError("This import has already been undone.");
    const n = await db.exec("update leads set archived_at = now() where import_batch_id = $1 and status <> 'converted' and archived_at is null", [batchId]);
    await db.exec("update tasks set status = 'cancelled' where lead_id in (select id from leads where import_batch_id = $1) and status in ('todo','in_progress','waiting')", [batchId]);
    await db.exec("update import_batches set undone_at = now(), status = 'undone' where id = $1", [batchId]);
    await audit(db, ctx, "import.undone", "import", batchId, { archived: n });
    return n;
  });
}
