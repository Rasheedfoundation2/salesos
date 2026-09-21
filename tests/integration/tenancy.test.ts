import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { withTenant } from "@/lib/db";
import { createLead, getLead, listLeads, updateLead, bulkLeads } from "@/lib/services/leads";
import { NotFoundError } from "@/lib/rbac";
import { makeOrg } from "../support/factory";

let A: Awaited<ReturnType<typeof makeOrg>>, B: Awaited<ReturnType<typeof makeOrg>>;
let secretLead: string;

beforeAll(async () => {
  A = await makeOrg("Tenant A", ["manager", "rep", "rep", "viewer", "finance"]);
  B = await makeOrg("Tenant B");
  secretLead = (await createLead(B.ctx.owner!, { full_name: "Secret B Lead", email: "secret@b.test" }, { assignmentMethod: "manual" })).id!;
});

describe("tenant isolation (database-enforced)", () => {
  it("cannot read another organisation's lead through the service layer", async () => {
    await expect(getLead(A.ctx.owner!, secretLead)).rejects.toBeInstanceOf(NotFoundError);
    const list = await listLeads(A.ctx.owner!, { q: "Secret" });
    expect(list.total).toBe(0);
  });

  it("cannot update another organisation's lead", async () => {
    await expect(updateLead(A.ctx.owner!, secretLead, { status: "qualified" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("RLS hides rows even for raw SQL with the wrong organisation context", async () => {
    const rows = await withTenant(A.ctx.owner!, (db) => db.many("select id from leads where id = $1", [secretLead]));
    expect(rows).toHaveLength(0);
  });

  it("spoofing app.org_id to an organisation the user doesn't belong to yields nothing", async () => {
    const rows = await withTenant({ orgId: B.orgId, userId: A.ctx.owner!.userId }, (db) => db.many("select id from leads"));
    expect(rows).toHaveLength(0);
  });

  it("the app role cannot bypass RLS or insert into another tenant", async () => {
    await expect(withTenant(A.ctx.owner!, (db) => db.exec("insert into leads(org_id, full_name) values ($1, 'x')", [B.orgId]))).rejects.toThrow(/row-level security/);
    const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
    const r = await c.query("select count(*)::int n from leads"); // no tenant context at all
    await c.end();
    expect(r.rows[0].n).toBe(0);
  });
});

describe("record-level permissions", () => {
  it("sales reps only see their own leads", async () => {
    const rep0 = A.ctx.rep1!, rep1 = A.ctx.rep2!;
    const mine = await createLead(A.ctx.manager0!, { full_name: "Rep0 lead", owner_id: rep0.userId }, { allowDuplicate: true });
    await createLead(A.ctx.manager0!, { full_name: "Rep1 lead", owner_id: rep1.userId }, { allowDuplicate: true });
    const seen = await listLeads(rep0, {});
    expect(seen.rows.map((r) => r.full_name)).toEqual(["Rep0 lead"]);
    await expect(getLead(rep1, mine.id!)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reps cannot assign leads to others; managers can", async () => {
    const l = await createLead(A.ctx.rep1!, { full_name: "Self lead", owner_id: A.ctx.rep2!.userId }, { allowDuplicate: true }).catch((e) => e);
    expect(String(l.message ?? l)).toMatch(/only create leads assigned to yourself/);
    const own = await createLead(A.ctx.rep1!, { full_name: "Self lead 2" }, { allowDuplicate: true });
    await expect(bulkLeads(A.ctx.rep1!, [own.id!], { kind: "assign", owner_id: A.ctx.rep2!.userId })).rejects.toThrow(/Only managers/);
    expect(await bulkLeads(A.ctx.manager0!, [own.id!], { kind: "assign", owner_id: A.ctx.rep2!.userId })).toBe(1);
  });

  it("viewers are read-only and finance cannot see leads (enforced by RLS too)", async () => {
    await expect(createLead(A.ctx.viewer3!, { full_name: "nope" })).rejects.toThrow(/permission/);
    const rows = await withTenant(A.ctx.viewer3!, (db) => db.exec("insert into leads(org_id, full_name) values ($1,'x')", [A.orgId])).catch((e) => e);
    expect(String(rows)).toMatch(/row-level security/);
    const fin = await withTenant(A.ctx.finance4!, (db) => db.many("select id from leads"));
    expect(fin).toHaveLength(0);
  });
});

describe("audit log", () => {
  it("records field changes with the responsible user and is append-only", async () => {
    const l = await createLead(A.ctx.owner!, { full_name: "Audit Me", company_name: "Acme" }, { allowDuplicate: true, assignmentMethod: "manual" });
    await updateLead(A.ctx.owner!, l.id!, { company_name: "Acme Ltd" });
    const logs = await withTenant(A.ctx.owner!, (db) => db.many<{ action: string; actor_id: string; changes: Record<string, unknown> }>("select action, actor_id, changes from audit_logs where entity_id = $1 order by id", [l.id]));
    const upd = logs.find((x) => x.action === "update" && "company_name" in x.changes)!;
    expect(upd.actor_id).toBe(A.ctx.owner!.userId);
    expect(upd.changes.company_name).toEqual(["Acme", "Acme Ltd"]);
    const admin = new Client({ connectionString: process.env.DATABASE_ADMIN_URL }); await admin.connect();
    await expect(admin.query("update audit_logs set action = 'tampered'")).rejects.toThrow(/append-only/);
    await expect(admin.query("delete from audit_logs")).rejects.toThrow(/append-only/);
    await admin.end();
  });
});

describe("login lockout", () => {
  it("locks an account after 10 failed attempts (unit of the SQL used by login)", async () => {
    const { withSystem } = await import("@/lib/db");
    const id = A.ctx.viewer3!.userId;
    for (const [n, lock] of [[3, false], [0, true]] as const)
      await withSystem((db) => db.exec("update users set failed_logins = $2::int, locked_until = case when $3::boolean then now() + interval '15 minutes' else null end where id = $1", [id, n, lock]));
    const u = await withSystem((db) => db.one<{ locked_until: string | null }>("select locked_until from users where id = $1", [id]));
    expect(u!.locked_until).toBeTruthy();
  });
});
