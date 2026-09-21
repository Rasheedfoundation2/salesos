"use server";
import { revalidatePath } from "next/cache";
import { requireCtx, getSessionUser } from "@/lib/auth/context";
import { run } from "@/lib/action";
import { formToObject } from "@/lib/validation";
import { undoImport } from "@/lib/services/imports";
import * as team from "@/lib/services/team";
import * as settings from "@/lib/services/settings";
import { ValidationError } from "@/lib/rbac";

export async function undoImportAction(batchId: string) {
  const ctx = await requireCtx();
  return run(async () => { const n = await undoImport(ctx, batchId); revalidatePath("/leads"); revalidatePath("/leads/import"); return n; }, "Import undone");
}

// ── Team ──
export async function parseUsersAction(text: string, defaultRole: string) {
  const ctx = await requireCtx();
  return run(async () => { const teams = await team.listTeams(ctx); return team.parseBulkUsers(text, defaultRole, teams); });
}
export async function addUsersAction(entries: { email: string; name: string | null; role: string; team_id: string | null }[], mode: "invite" | "direct") {
  const ctx = await requireCtx();
  return run(async () => { const r = await team.addUsers(ctx, entries, mode); revalidatePath("/team"); return r; });
}
export async function updateMemberAction(_: unknown, fd: FormData) {
  const ctx = await requireCtx(); const raw = formToObject(fd); const uid = String(raw.user_id); delete raw.user_id;
  return run(async () => { await team.updateMember(ctx, uid, raw); revalidatePath("/team"); }, "Member updated");
}
export async function setMemberStatusAction(userId: string, status: "active" | "deactivated") {
  const ctx = await requireCtx();
  return run(async () => { await team.setMemberStatus(ctx, userId, status); revalidatePath("/team"); }, status === "active" ? "Member reactivated" : "Member deactivated");
}
export async function revokeInviteAction(id: string) {
  const ctx = await requireCtx();
  return run(async () => { await team.revokeInvitation(ctx, id); revalidatePath("/team"); }, "Invitation revoked");
}
export async function createTeamAction(name: string) {
  const ctx = await requireCtx();
  return run(async () => { await team.createTeam(ctx, name); revalidatePath("/team"); }, "Team created");
}

// ── Settings ──
export async function updateOrgAction(_: unknown, fd: FormData) {
  const ctx = await requireCtx();
  return run(async () => { await settings.updateOrganisation(ctx, formToObject(fd) as Record<string, string>); revalidatePath("/", "layout"); }, "Organisation settings saved");
}
export async function updateScoringAction(_: unknown, fd: FormData) {
  const ctx = await requireCtx(); const r = formToObject(fd) as Record<string, string>;
  const list = (k: string) => (r[k] ?? "").split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  return run(async () => {
    const weights = Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith("w_")).map(([k, v]) => [k.slice(2), Number(v)]));
    if (Object.values(weights).some((v) => !(v >= 0 && v <= 100))) throw new ValidationError("Weights must be between 0 and 100.");
    await settings.updateScoring(ctx, { weights: weights as never, target_industries: list("target_industries"), core_services: list("core_services"), target_countries: list("target_countries"),
      budget_min: Number(r.budget_min), budget_ideal: Number(r.budget_ideal), thresholds: { hot: Number(r.t_hot), warm: Number(r.t_warm), nurture: Number(r.t_nurture) } });
    revalidatePath("/settings");
  }, "Scoring model saved — new scores apply as leads are created or updated");
}
export async function createPipelineAction(name: string) {
  const ctx = await requireCtx();
  return run(async () => { await settings.createPipeline(ctx, name); revalidatePath("/settings"); }, "Pipeline created");
}
export async function renamePipelineAction(id: string, name: string, makeDefault: boolean) {
  const ctx = await requireCtx();
  return run(async () => { await settings.renamePipeline(ctx, id, name, makeDefault); revalidatePath("/settings"); }, "Pipeline saved");
}
export async function saveStageAction(pipelineId: string, id: string | null, input: Record<string, unknown>) {
  const ctx = await requireCtx();
  return run(async () => { await settings.saveStage(ctx, pipelineId, id, input); revalidatePath("/settings"); revalidatePath("/pipeline"); }, "Stage saved");
}
export async function moveStagePosAction(pipelineId: string, stageId: string, dir: -1 | 1) {
  const ctx = await requireCtx();
  return run(async () => { await settings.moveStagePosition(ctx, pipelineId, stageId, dir); revalidatePath("/settings"); });
}
export async function deleteStageAction(stageId: string) {
  const ctx = await requireCtx();
  return run(async () => { await settings.deleteStage(ctx, stageId); revalidatePath("/settings"); }, "Stage deleted");
}
export async function addListItemAction(table: "lead_sources" | "campaigns" | "lost_reasons" | "products", input: Record<string, string>) {
  const ctx = await requireCtx();
  return run(async () => { await settings.addListItem(ctx, table, input); revalidatePath("/settings"); revalidatePath("/campaigns"); revalidatePath("/products"); }, "Added");
}
export async function removeListItemAction(table: "lead_sources" | "campaigns" | "lost_reasons" | "products", id: string) {
  const ctx = await requireCtx();
  return run(async () => { await settings.removeListItem(ctx, table, id); revalidatePath("/settings"); revalidatePath("/campaigns"); revalidatePath("/products"); }, "Removed");
}
export async function updateFxAction(_: unknown, fd: FormData) {
  const ctx = await requireCtx();
  return run(async () => { await settings.updateFx(ctx, formToObject(fd) as Record<string, string>); revalidatePath("/settings"); }, "Exchange rates saved");
}
export async function createApiKeyAction(name: string) {
  const ctx = await requireCtx();
  return run(async () => { const k = await settings.createApiKey(ctx, name); revalidatePath("/settings"); return k; });
}
export async function revokeApiKeyAction(id: string) {
  const ctx = await requireCtx();
  return run(async () => { await settings.revokeApiKey(ctx, id); revalidatePath("/settings"); }, "API key revoked");
}

// ── Platform ──
export async function platformStatusAction(orgId: string, status: "active" | "suspended") {
  const su = await getSessionUser();
  return run(async () => { await settings.platformSetStatus(!!su?.is_platform_admin, su?.user_id ?? "", orgId, status); revalidatePath("/platform"); }, status === "active" ? "Organisation reactivated" : "Organisation suspended");
}
export async function platformPlanAction(orgId: string, plan: string) {
  const su = await getSessionUser();
  return run(async () => { await settings.platformSetPlan(!!su?.is_platform_admin, orgId, plan); revalidatePath("/platform"); }, "Plan updated");
}
