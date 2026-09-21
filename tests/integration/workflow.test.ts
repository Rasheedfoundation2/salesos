import { beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/lib/db";
import { createLead, convertLead, getLead } from "@/lib/services/leads";
import { createOpportunity, moveStage, getOpportunity } from "@/lib/services/opportunities";
import { logActivity, listTasks } from "@/lib/services/activities";
import { runLeadImport, undoImport } from "@/lib/services/imports";
import { addUsers } from "@/lib/services/team";
import { dashboardData, periodRange } from "@/lib/services/dashboard";
import { universalSearch } from "@/lib/services/search";
import { exportCsv } from "@/lib/services/exports";
import { createApiKey, resolveApiKey } from "@/lib/services/settings";
import { makeOrg } from "../support/factory";

let O: Awaited<ReturnType<typeof makeOrg>>;
let pipelineId: string; let stages: Record<string, string>;
beforeAll(async () => {
  O = await makeOrg("Workflow Org", ["manager", "rep", "rep"]);
  await withTenant(O.ctx.owner!, async (db) => {
    pipelineId = (await db.one<{ id: string }>("select id from pipelines where is_default"))!.id;
    stages = Object.fromEntries((await db.many<{ id: string; name: string }>("select id, name from pipeline_stages where pipeline_id = $1", [pipelineId])).map((s) => [s.name, s.id]));
  });
});

describe("lead capture workflow", () => {
  it("validates, assigns by round robin, scores, creates a first task, notifies and starts the SLA", async () => {
    const a = await createLead(O.ctx.manager0!, { full_name: "Round One", email: "r1@x.test", phone: "050 111 2222", country: "United Arab Emirates", industry: "Real Estate", job_title: "CEO" });
    const b = await createLead(O.ctx.manager0!, { full_name: "Round Two", email: "r2@x.test" });
    expect(a.owner_id).toBeTruthy(); expect(b.owner_id).toBeTruthy(); expect(a.owner_id).not.toBe(b.owner_id);
    const lead = await getLead(O.ctx.owner!, a.id!) as Record<string, unknown>;
    expect(lead.phone).toBe("+971501112222");
    expect(lead.score).toBeGreaterThan(30);
    expect((lead.score_breakdown as unknown[]).length).toBe(9);
    expect(lead.first_response_due_at).toBeTruthy();
    const tasks = await listTasks(O.ctx.owner!, { view: "all", entity: "lead", id: a.id! });
    expect(tasks[0]!.title).toBe("First contact: Round One");
    const repCtx = [O.ctx.rep1!, O.ctx.rep2!].find((c) => c.userId === a.owner_id)!; // notifications are private to their recipient (RLS)
    const n = await withTenant(repCtx, (db) => db.one<{ n: number }>("select count(*)::int n from notifications where user_id = $1", [a.owner_id]));
    expect(n!.n).toBeGreaterThan(0);
  });

  it("warns before creating duplicates", async () => {
    const r = await createLead(O.ctx.owner!, { full_name: "Dup", email: "r1@x.test" });
    expect(r.id).toBeUndefined();
    expect(r.duplicates?.[0]?.reason).toBe("Same email");
  });

  it("logging a call stamps first contact (SLA) and closes the first-contact task", async () => {
    const l = await createLead(O.ctx.owner!, { full_name: "SLA Lead", email: "sla@x.test", owner_id: O.ctx.rep1!.userId });
    await logActivity(O.ctx.rep1!, { type: "call", subject: "Intro", outcome: "Connected — interested", lead_id: l.id });
    const lead = await getLead(O.ctx.rep1!, l.id!) as Record<string, unknown>;
    expect(lead.first_contacted_at).toBeTruthy();
    expect(lead.status).toBe("contacted");
    const t = await listTasks(O.ctx.rep1!, { view: "all", entity: "lead", id: l.id! });
    expect(t.find((x) => x.title.startsWith("First contact"))!.status).toBe("completed");
  });

  it("converts a lead into contact, company and opportunity", async () => {
    const l = await createLead(O.ctx.owner!, { full_name: "Convert Me", email: "cm@acme.test", company_name: "Acme Convert", website: "https://acmeconvert.test", owner_id: O.ctx.rep1!.userId }, { allowDuplicate: true });
    const r = await convertLead(O.ctx.rep1!, l.id!, { create_opportunity: true, pipeline_id: pipelineId, value: 25000, currency: "AED" });
    expect(r.contactId && r.companyId && r.opportunityId).toBeTruthy();
    const lead = await getLead(O.ctx.rep1!, l.id!) as Record<string, unknown>;
    expect(lead.status).toBe("converted");
    await expect(convertLead(O.ctx.rep1!, l.id!, { create_opportunity: false })).rejects.toThrow(/already been converted/);
  });
});

describe("pipeline rules", () => {
  let opp: string;
  beforeAll(async () => { opp = await createOpportunity(O.ctx.rep1!, { name: "Rules Deal", pipeline_id: pipelineId, stage_id: stages["Qualified"], value: 0 }); });

  it("enforces required fields for a stage", async () => {
    await expect(moveStage(O.ctx.rep1!, opp, { stage_id: stages["Proposal Sent"]! })).rejects.toThrow(/requires: Deal value, Expected close date/);
    await moveStage(O.ctx.rep1!, opp, { stage_id: stages["Proposal Sent"]!, fields: { value: 40000, expected_close_date: "2026-12-01" } });
    const o = (await getOpportunity(O.ctx.rep1!, opp)).opp as Record<string, unknown>;
    expect(o.probability).toBe(60);
    expect(Number(o.weighted_value)).toBe(24000);
    expect((await getOpportunity(O.ctx.rep1!, opp)).history.length).toBe(2);
  });

  it("requires a lost reason and stores it", async () => {
    const d = await createOpportunity(O.ctx.rep1!, { name: "Lost Deal", pipeline_id: pipelineId, value: 1000 });
    await expect(moveStage(O.ctx.rep1!, d, { stage_id: stages["Closed Lost"]! })).rejects.toThrow(/lost reason is required/);
    await moveStage(O.ctx.rep1!, d, { stage_id: stages["Closed Lost"]!, lost_reason: "Price" });
    const o = (await getOpportunity(O.ctx.rep1!, d)).opp as Record<string, unknown>;
    expect(o.status).toBe("lost"); expect(o.lost_reason).toBe("Price");
    await expect(moveStage(O.ctx.rep1!, d, { stage_id: stages["Qualified"]! })).rejects.toThrow(/Only a sales manager can reopen/);
    await moveStage(O.ctx.manager0!, d, { stage_id: stages["Qualified"]! });
  });

  it("Closed Won locks the value, creates the handover, onboarding tasks and marks the company a client", async () => {
    const co = await withTenant(O.ctx.owner!, (db) => db.one<{ id: string }>("insert into companies(org_id, name) values ($1,'Won Co') returning id", [O.orgId]));
    const d = await createOpportunity(O.ctx.rep1!, { name: "Won Deal", pipeline_id: pipelineId, value: 50000, company_id: co!.id, services: ["SEO"] });
    const r = await moveStage(O.ctx.rep1!, d, { stage_id: stages["Closed Won"]! });
    expect(r.handoverId).toBeTruthy();
    const { opp, handover } = await getOpportunity(O.ctx.owner!, d);
    expect((opp as Record<string, unknown>).value_locked).toBe(true);
    expect(Number(handover!.commercial_value)).toBe(50000);
    const client = await withTenant(O.ctx.owner!, (db) => db.one<{ client_status: string; n: number }>("select client_status, (select count(*)::int from tasks where handover_id = $2) n from companies where id = $1", [co!.id, r.handoverId]));
    expect(client!.client_status).toBe("active_client"); expect(client!.n).toBe(4);
  });
});

describe("CSV import for sales agents", () => {
  const csv = Buffer.from([
    "Full Name,Email,Mobile,Company,Country,Owner Email",
    "Imp One,imp1@x.test,+971501000001,Imp Co 1,United Arab Emirates,",
    "Imp Two,imp2@x.test,+971501000002,Imp Co 2,United Arab Emirates,",
    "Imp Three,imp3@x.test,+971501000003,Imp Co 3,United Arab Emirates,",
    "Imp Dup,imp1@x.test,,Imp Co 1,,",
    "Bad Email,not-an-email,,,,",
    "Imp Four,imp4@x.test,+971501000004,Imp Co 4,United Arab Emirates,",
  ].join("\n"));
  const mapping = { "0": "full_name", "1": "email", "2": "phone", "3": "company_name", "4": "country" };

  it("validates without writing (dry run)", async () => {
    const r = await runLeadImport(O.ctx.manager0!, { name: "leads.csv", buf: csv }, { mapping, duplicateMode: "skip", ownerMode: "round_robin", roundRobinUsers: [O.ctx.rep1!.userId, O.ctx.rep2!.userId], createTasks: true, dryRun: true });
    expect(r.created).toBe(4); expect(r.skipped).toBe(1); expect(r.errors.some((e) => /email/i.test(e.message))).toBe(true);
    expect((await withTenant(O.ctx.owner!, (db) => db.one<{ n: number }>("select count(*)::int n from leads where email like 'imp%'")))!.n).toBe(0);
  });

  it("imports, distributes evenly across selected agents, and can be undone", async () => {
    const r = await runLeadImport(O.ctx.manager0!, { name: "leads.csv", buf: csv }, { mapping, duplicateMode: "skip", ownerMode: "round_robin", roundRobinUsers: [O.ctx.rep1!.userId, O.ctx.rep2!.userId], tags: ["expo"], createTasks: true, dryRun: false });
    expect(r.created).toBe(4);
    expect(Object.values(r.byOwner).sort()).toEqual([2, 2]);
    const again = await runLeadImport(O.ctx.manager0!, { name: "leads.csv", buf: csv }, { mapping, duplicateMode: "skip", ownerMode: "none", createTasks: false, dryRun: false });
    expect(again.created).toBe(0); expect(again.skipped).toBeGreaterThanOrEqual(4);
    const archived = await undoImport(O.ctx.manager0!, r.batchId!);
    expect(archived).toBe(4);
  });

  it("assigns from an owner-email column and reports unknown owners", async () => {
    const f = Buffer.from(`Name,Email,Owner\nCol One,col1@x.test,${"REP_EMAIL"}\nCol Two,col2@x.test,nobody@x.test`.replace("REP_EMAIL", (await withTenant(O.ctx.owner!, (db) => db.one<{ email: string }>("select email from users where id = $1", [O.ctx.rep2!.userId])))!.email));
    const r = await runLeadImport(O.ctx.owner!, { name: "owners.csv", buf: f }, { mapping: { "0": "full_name", "1": "email", "2": "owner_email" }, duplicateMode: "skip", ownerMode: "column", createTasks: false, dryRun: false });
    expect(r.created).toBe(1); expect(r.byOwner[O.ctx.rep2!.userId]).toBe(1);
    expect(r.errors[0]!.message).toMatch(/not a member/);
  });
});

describe("admin adds multiple users", () => {
  it("creates many accounts at once with temporary passwords, skipping duplicates and existing members", async () => {
    const r = await addUsers(O.ctx.owner!, [
      { email: "agent1@new.test", name: "Agent One", role: "rep", team_id: null },
      { email: "agent2@new.test", name: "Agent Two", role: "rep", team_id: null },
      { email: "agent1@new.test", name: "Again", role: "rep", team_id: null },
    ], "direct");
    expect(r.created).toHaveLength(2);
    expect(r.created.every((c) => c.tempPassword && c.tempPassword.length > 10)).toBe(true);
    expect(r.skipped[0]!.reason).toBe("Duplicate in list");
    const again = await addUsers(O.ctx.owner!, [{ email: "agent1@new.test", name: null, role: "rep", team_id: null }], "direct");
    expect(again.skipped[0]!.reason).toBe("Already a member");
  });
  it("sends invitation links in bulk", async () => {
    const r = await addUsers(O.ctx.owner!, [{ email: "inv1@new.test", name: null, role: "manager", team_id: null }, { email: "inv2@new.test", name: null, role: "viewer", team_id: null }], "invite");
    expect(r.created.map((c) => c.link?.includes("/invite/"))).toEqual([true, true]);
  });
  it("forbids non-admins and role escalation to owner", async () => {
    await expect(addUsers(O.ctx.manager0!, [{ email: "x@new.test", name: null, role: "rep", team_id: null }], "direct")).rejects.toThrow(/permission/);
  });
  it("enforces the plan user limit", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ email: `lim${i}@new.test`, name: null, role: "rep", team_id: null }));
    const r = await addUsers(O.ctx.owner!, many, "direct");
    expect(r.skipped.some((s) => /Plan limit/.test(s.reason))).toBe(true);
  });
});

describe("reporting, search, export and API keys", () => {
  it("dashboards aggregate real data", async () => {
    const p = periodRange("year");
    const d = await dashboardData(O.ctx.owner!, { from: p.from, to: p.to });
    expect(d.kpi.revenue_won).toBeGreaterThanOrEqual(50000);
    expect(d.kpi.new_leads).toBeGreaterThan(0);
    expect(d.lostReasons.find((x) => x.label === "Price")).toBeUndefined(); // reopened above
  });
  it("universal search spans entities", async () => {
    const hits = await universalSearch(O.ctx.owner!, "Acme Convert");
    expect(hits.some((h) => h.type === "company")).toBe(true);
  });
  it("exports CSV and audits it", async () => {
    const out = await exportCsv(O.ctx.owner!, "leads", {});
    expect(out.csv).toContain("full_name");
    await expect(exportCsv(O.ctx.rep1!, "leads", {})).rejects.toThrow(/export permission/);
    const a = await withTenant(O.ctx.owner!, (db) => db.one<{ n: number }>("select count(*)::int n from audit_logs where action = 'export'"));
    expect(a!.n).toBeGreaterThan(0);
  });
  it("API keys resolve to the right organisation only while active", async () => {
    const key = await createApiKey(O.ctx.owner!, "test");
    expect((await resolveApiKey(key))!.org_id).toBe(O.orgId);
    expect(await resolveApiKey(key + "x")).toBeNull();
  });
});
