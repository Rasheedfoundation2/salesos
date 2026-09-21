"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/auth/context";
import { run } from "@/lib/action";
import { formToObject } from "@/lib/validation";
import * as leads from "@/lib/services/leads";
import * as opps from "@/lib/services/opportunities";
import * as acc from "@/lib/services/accounts";
import * as act from "@/lib/services/activities";
import * as settings from "@/lib/services/settings";
import type { ActionResult } from "@/lib/types";

const rv = (...paths: string[]) => paths.forEach((p) => revalidatePath(p));

// ── Leads ──
export async function createLeadAction(_: unknown, fd: FormData): Promise<ActionResult<{ id?: string; duplicates?: leads.DuplicateMatch[] }>> {
  const ctx = await requireCtx();
  const raw = formToObject(fd);
  return run(async () => {
    const r = await leads.createLead(ctx, raw, { allowDuplicate: raw.allow_duplicate === "1" });
    if (r.id) rv("/leads", "/home");
    return r;
  });
}
export async function updateLeadAction(id: string, raw: Record<string, unknown>) {
  const ctx = await requireCtx();
  return run(async () => { const r = await leads.updateLead(ctx, id, raw); rv(`/leads/${id}`, "/leads"); return r; }, "Lead updated");
}
export async function updateLeadFormAction(_: unknown, fd: FormData) {
  const raw = formToObject(fd); const id = String(raw.id); delete raw.id;
  return updateLeadAction(id, raw);
}
export async function bulkLeadsAction(ids: string[], op: Parameters<typeof leads.bulkLeads>[2]) {
  const ctx = await requireCtx();
  return run(async () => { const n = await leads.bulkLeads(ctx, ids, op); rv("/leads", "/home"); return n; });
}
export async function convertLeadAction(id: string, input: leads.ConvertInput) {
  const ctx = await requireCtx();
  return run(async () => { const r = await leads.convertLead(ctx, id, input); rv(`/leads/${id}`, "/leads", "/opportunities", "/pipeline"); return r; }, "Lead converted");
}
export async function mergeLeadsAction(primary: string, secondary: string) {
  const ctx = await requireCtx();
  return run(async () => { await leads.mergeLeads(ctx, primary, secondary); rv(`/leads/${primary}`, "/leads"); }, "Leads merged");
}

// ── Companies & contacts ──
export async function saveCompanyAction(_: unknown, fd: FormData) {
  const ctx = await requireCtx(); const raw = formToObject(fd); const id = (raw.id as string) || null; delete raw.id;
  return run(async () => { const r = await acc.saveCompany(ctx, id, raw); rv("/companies", `/companies/${r}`); return r; }, id ? "Company updated" : "Company created");
}
export async function saveContactAction(_: unknown, fd: FormData) {
  const ctx = await requireCtx(); const raw = formToObject(fd); const id = (raw.id as string) || null; delete raw.id;
  return run(async () => { const r = await acc.saveContact(ctx, id, raw); rv("/contacts", `/contacts/${r}`); return r; }, id ? "Contact updated" : "Contact created");
}
export async function archiveAction(entity: "companies" | "contacts" | "opportunities", id: string, restore = false) {
  const ctx = await requireCtx();
  return run(async () => {
    if (entity === "opportunities") await opps.archiveOpportunity(ctx, id); else await acc.archiveRecord(ctx, entity, id, restore);
    rv(`/${entity}`);
  }, restore ? "Restored" : "Archived");
}

// ── Opportunities ──
export async function createOpportunityAction(_: unknown, fd: FormData) {
  const ctx = await requireCtx();
  return run(async () => { const id = await opps.createOpportunity(ctx, formToObject(fd)); rv("/opportunities", "/pipeline", "/home"); return id; }, "Opportunity created");
}
export async function updateOpportunityAction(id: string, raw: Record<string, unknown>) {
  const ctx = await requireCtx();
  return run(async () => { await opps.updateOpportunity(ctx, id, raw); rv(`/opportunities/${id}`, "/pipeline", "/opportunities"); }, "Opportunity updated");
}
export async function updateOpportunityFormAction(_: unknown, fd: FormData) {
  const raw = formToObject(fd); const id = String(raw.id); delete raw.id;
  return updateOpportunityAction(id, raw);
}
export async function moveStageAction(id: string, input: opps.MoveInput) {
  const ctx = await requireCtx();
  return run(async () => { const r = await opps.moveStage(ctx, id, input); rv("/pipeline", `/opportunities/${id}`, "/opportunities", "/home"); return r; });
}
export async function updateHandoverAction(_: unknown, fd: FormData) {
  const ctx = await requireCtx(); const raw = formToObject(fd); const id = String(raw.opportunity_id); delete raw.opportunity_id;
  return run(async () => { await opps.updateHandover(ctx, id, raw); rv(`/opportunities/${id}`); }, "Handover saved");
}

// ── Activities & tasks ──
export async function logActivityAction(_: unknown, fd: FormData) {
  const ctx = await requireCtx(); const raw = formToObject(fd);
  return run(async () => {
    await act.logActivity(ctx, raw);
    rv("/activities", "/tasks", "/home");
    for (const [k, p] of [["lead_id", "/leads/"], ["opportunity_id", "/opportunities/"], ["contact_id", "/contacts/"], ["company_id", "/companies/"]] as const) if (raw[k]) rv(p + raw[k]);
  }, "Activity logged");
}
export async function saveTaskAction(_: unknown, fd: FormData) {
  const ctx = await requireCtx(); const raw = formToObject(fd); const id = (raw.id as string) || null; delete raw.id;
  return run(async () => { await act.saveTask(ctx, id, raw); rv("/tasks", "/home", "/leads", "/opportunities"); }, id ? "Task updated" : "Task created");
}
export async function setTaskStatusAction(id: string, status: string, outcome?: string) {
  const ctx = await requireCtx();
  return run(async () => { await act.saveTask(ctx, id, outcome !== undefined ? { status, outcome } : { status }); rv("/tasks", "/home"); }, status === "completed" ? "Task completed" : "Task updated");
}

// ── Saved views ──
export async function saveViewAction(entity: string, name: string, filters: Record<string, string>, shared: boolean) {
  const ctx = await requireCtx();
  return run(async () => { await settings.saveView(ctx, entity, name, filters, shared); rv(`/${entity}`); }, "View saved");
}
export async function deleteViewAction(entity: string, id: string) {
  const ctx = await requireCtx();
  return run(async () => { await settings.deleteView(ctx, id); rv(`/${entity}`); }, "View deleted");
}
