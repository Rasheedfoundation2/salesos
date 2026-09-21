import { withSystem } from "@/lib/db";
import { createOrganisation } from "@/lib/services/auth";
import { hashPassword } from "@/lib/auth/crypto";
import type { Ctx, OrgInfo, Role } from "@/lib/types";

let n = 0;
/** Creates an organisation with an owner plus optional extra members, returning a ctx per member. */
export async function makeOrg(name = `Org ${++n}`, members: Role[] = []) {
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return withSystem(async (db) => {
    const pw = await hashPassword("Password123");
    const owner = (await db.one<{ id: string }>("insert into users(email, name, password_hash) values ($1,$2,$3) returning id", [`owner-${uniq}@t.test`, `Owner ${name}`, pw]))!.id;
    const orgId = await createOrganisation(db, owner, name, "AED");
    const org = (await db.one<OrgInfo>("select id, name, slug, currency, timezone, date_format, plan_code, status, settings, terminology from organisations where id = $1", [orgId]))!;
    const mk = (userId: string, role: Role): Ctx => ({ userId, orgId, role, sessionId: "test", teamId: null, org, user: { id: userId, name: role, email: "", is_platform_admin: false, must_change_password: false } });
    const ctxs: Record<string, Ctx> = { owner: mk(owner, "owner") };
    let i = 0;
    for (const role of members) {
      const id = (await db.one<{ id: string }>("insert into users(email, name, password_hash) values ($1,$2,$3) returning id", [`${role}${i}-${uniq}@t.test`, `${role} ${i}`, pw]))!.id;
      await db.exec("insert into memberships(org_id, user_id, role, accepts_leads, countries) values ($1,$2,$3,$4,$5)", [orgId, id, role, role === "rep", i % 2 ? ["India"] : ["United Arab Emirates"]]);
      ctxs[`${role}${i}`] = mk(id, role); i++;
    }
    return { orgId, ctx: ctxs };
  });
}
