import "server-only";
import { withSystem, withTenant } from "../db";
import { hashPassword, newToken, sha256 } from "../auth/crypto";
import { assertCan, canManageMember, ForbiddenError, ValidationError } from "../rbac";
import type { Ctx, Role } from "../types";
import { env } from "../env";
import { inviteRowSchema, memberUpdateSchema } from "../validation";
import { ROLE_LABELS } from "../constants";

export interface MemberRow {
  user_id: string; name: string; email: string; role: Role; status: string; team_id: string | null; team_name: string | null; title: string | null;
  monthly_target: string | null; max_discount_pct: string; assignment_weight: number; accepts_leads: boolean; countries: string[];
  last_login_at: string | null; open_leads: number; open_deals: number; must_change_password: boolean;
}

export async function listMembers(ctx: Ctx) {
  return withTenant(ctx, (db) => db.many<MemberRow>(
    `select m.user_id, u.name, u.email, m.role, m.status, m.team_id, t.name team_name, m.title, m.monthly_target, m.max_discount_pct,
            m.assignment_weight, m.accepts_leads, m.countries, u.last_login_at, u.must_change_password,
            (select count(*)::int from leads l where l.owner_id = m.user_id and l.archived_at is null and l.status not in ('converted','unqualified','do_not_contact')) open_leads,
            (select count(*)::int from opportunities o where o.owner_id = m.user_id and o.archived_at is null and o.status = 'open') open_deals
       from memberships m join users u on u.id = m.user_id left join teams t on t.id = m.team_id
      where m.org_id = $1 order by m.status, u.name`, [ctx.orgId]));
}

export async function listAssignableUsers(ctx: Ctx) {
  return withTenant(ctx, (db) => db.many<{ id: string; name: string; role: Role }>(
    `select u.id, u.name, m.role from memberships m join users u on u.id = m.user_id
      where m.org_id = $1 and m.status = 'active' and m.role in ('owner','admin','manager','rep','marketing') order by u.name`, [ctx.orgId]));
}

export async function listTeams(ctx: Ctx) {
  return withTenant(ctx, (db) => db.many<{ id: string; name: string; members: number }>(
    "select t.id, t.name, (select count(*)::int from memberships m where m.team_id = t.id and m.status='active') members from teams t where t.org_id = $1 order by t.name", [ctx.orgId]));
}

export async function listInvitations(ctx: Ctx) {
  assertCan(ctx.role, "team", "manage");
  return withTenant(ctx, (db) => db.many<{ id: string; email: string; name: string | null; role: string; created_at: string; expires_at: string; team_name: string | null }>(
    `select i.id, i.email, i.name, i.role, i.created_at, i.expires_at, t.name team_name from invitations i left join teams t on t.id = i.team_id
      where i.org_id = $1 and i.accepted_at is null and i.revoked_at is null and i.expires_at > now() order by i.created_at desc`, [ctx.orgId]));
}

/** Parses "email, name, role, team" lines or CSV text into invite rows. */
export function parseBulkUsers(text: string, defaultRole: string, teams: { id: string; name: string }[]) {
  const rows: { line: number; raw: string; data?: { email: string; name: string | null; role: string; team_id: string | null }; error?: string }[] = [];
  const roleAlias: Record<string, string> = {
    admin: "admin", administrator: "admin", manager: "manager", "sales manager": "manager", rep: "rep", "sales rep": "rep", "sales representative": "rep", agent: "rep",
    "sales agent": "rep", marketing: "marketing", finance: "finance", viewer: "viewer", "read only": "viewer",
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || (i === 0 && /email/i.test(line) && !/@/.test(line))) return; // skip blanks and header
    const parts = line.split(/[,;\t]/).map((p) => p.trim());
    const email = parts.find((p) => p.includes("@")) ?? "";
    const others = parts.filter((p) => p !== email);
    let role = defaultRole, team_id: string | null = null; const nameParts: string[] = [];
    for (const p of others) {
      const r = roleAlias[p.toLowerCase()];
      const t = teams.find((t) => t.name.toLowerCase() === p.toLowerCase());
      if (r) role = r; else if (t) team_id = t.id; else if (p) nameParts.push(p);
    }
    const parsed = inviteRowSchema.safeParse({ email, name: nameParts.join(" ") || null, role, team_id });
    if (!parsed.success) rows.push({ line: i + 1, raw: line, error: parsed.error.issues[0]?.message ?? "Invalid row" });
    else rows.push({ line: i + 1, raw: line, data: { email: parsed.data.email, name: parsed.data.name ?? null, role: parsed.data.role, team_id: parsed.data.team_id ?? null } });
  });
  return rows;
}

export interface AddUsersResult {
  created: { email: string; name: string; role: string; mode: "invite" | "direct"; link?: string; tempPassword?: string; existingAccount?: boolean }[];
  skipped: { email: string; reason: string }[];
}

/** Admins add many users at once — by invitation link, or by creating accounts directly with a one-time temporary password. */
export async function addUsers(ctx: Ctx, entries: { email: string; name: string | null; role: string; team_id: string | null }[], mode: "invite" | "direct"): Promise<AddUsersResult> {
  assertCan(ctx.role, "team", "manage");
  if (!entries.length) throw new ValidationError("Add at least one user.");
  if (entries.length > 200) throw new ValidationError("Add up to 200 users at a time.");
  for (const e of entries) if (!canManageMember(ctx.role, e.role as Role)) throw new ForbiddenError("You cannot grant that role.");

  return withSystem(async (db) => {
    const plan = await db.one<{ limits: { users: number } }>("select p.limits from organisations o join plans p on p.code = o.plan_code where o.id = $1", [ctx.orgId]);
    const count = await db.one<{ n: number }>(
      `select (select count(*) from memberships where org_id = $1 and status = 'active') + (select count(*) from invitations where org_id = $1 and accepted_at is null and revoked_at is null and expires_at > now()) n`, [ctx.orgId]);
    const limit = plan?.limits.users ?? 5;
    const result: AddUsersResult = { created: [], skipped: [] };
    const seen = new Set<string>();
    let used = Number(count?.n ?? 0);
    const orgName = (await db.one<{ name: string }>("select name from organisations where id = $1", [ctx.orgId]))!.name;

    for (const e of entries) {
      if (seen.has(e.email)) { result.skipped.push({ email: e.email, reason: "Duplicate in list" }); continue; }
      seen.add(e.email);
      const member = await db.one<{ status: string }>("select m.status from memberships m join users u on u.id = m.user_id where m.org_id = $1 and u.email = $2", [ctx.orgId, e.email]);
      if (member?.status === "active") { result.skipped.push({ email: e.email, reason: "Already a member" }); continue; }
      if (used >= limit) { result.skipped.push({ email: e.email, reason: `Plan limit of ${limit} users reached` }); continue; }
      const existing = await db.one<{ id: string; name: string }>("select id, name from users where email = $1", [e.email]);
      const displayName = e.name ?? existing?.name ?? e.email.split("@")[0]!;

      if (mode === "invite") {
        await db.exec("update invitations set revoked_at = now() where org_id = $1 and email = $2 and accepted_at is null and revoked_at is null", [ctx.orgId, e.email]);
        const token = newToken();
        await db.exec("insert into invitations(org_id, email, name, role, team_id, token_hash, invited_by, expires_at) values ($1,$2,$3,$4,$5,$6,$7, now() + interval '7 days')",
          [ctx.orgId, e.email, e.name, e.role, e.team_id, sha256(token), ctx.userId]);
        const link = `${env().APP_URL}/invite/${token}`;
        await db.exec("insert into email_outbox(org_id, to_email, subject, body) values ($1,$2,$3,$4)", [ctx.orgId, e.email, `You're invited to ${orgName} on DigiFalx SalesOS`,
          `Hello ${displayName},\n\n${ctx.user.name} has invited you to join ${orgName} as ${ROLE_LABELS[e.role]}.\n\nAccept within 7 days: ${link}`]);
        result.created.push({ email: e.email, name: displayName, role: e.role, mode, link, existingAccount: !!existing });
      } else {
        let userId = existing?.id; let tempPassword: string | undefined;
        if (!userId) {
          tempPassword = `Sos-${newToken(9)}1`;
          userId = (await db.one<{ id: string }>("insert into users(email, name, password_hash, must_change_password) values ($1,$2,$3,true) returning id",
            [e.email, displayName, await hashPassword(tempPassword)]))!.id;
        }
        await db.exec(`insert into memberships(org_id, user_id, role, team_id) values ($1,$2,$3,$4)
                       on conflict (org_id, user_id) do update set role = excluded.role, team_id = excluded.team_id, status = 'active'`, [ctx.orgId, userId, e.role, e.team_id]);
        await db.exec("insert into notifications(org_id, user_id, type, title, body, link) values ($1,$2,'team',$3,$4,'/home')",
          [ctx.orgId, userId, `Welcome to ${orgName}`, `${ctx.user.name} added you as ${ROLE_LABELS[e.role]}.`]);
        result.created.push({ email: e.email, name: displayName, role: e.role, mode, tempPassword, existingAccount: !!existing });
      }
      used++;
      await db.exec("insert into audit_logs(org_id, actor_id, action, entity_type, changes) values ($1,$2,$3,'member',$4)",
        [ctx.orgId, ctx.userId, mode === "invite" ? "member.invited" : "member.created", { email: e.email, role: e.role }]);
    }
    return result;
  });
}

export async function updateMember(ctx: Ctx, userId: string, raw: unknown) {
  assertCan(ctx.role, "team", "manage");
  const input = memberUpdateSchema.parse(raw);
  return withTenant(ctx, async (db) => {
    const cur = await db.one<{ role: Role }>("select role from memberships where org_id = $1 and user_id = $2", [ctx.orgId, userId]);
    if (!cur) throw new ValidationError("Member not found.");
    if (!canManageMember(ctx.role, cur.role) || !canManageMember(ctx.role, input.role)) throw new ForbiddenError("You cannot change this member's role.");
    if (cur.role === "owner" && input.role !== "owner") {
      const owners = await db.one<{ n: number }>("select count(*)::int n from memberships where org_id = $1 and role = 'owner' and status = 'active'", [ctx.orgId]);
      if ((owners?.n ?? 0) <= 1) throw new ValidationError("An organisation must keep at least one owner.");
    }
    await db.exec(`update memberships set role=$3, team_id=$4, title=$5, monthly_target=$6, max_discount_pct=$7, assignment_weight=$8, accepts_leads=$9, countries=$10
                    where org_id=$1 and user_id=$2`,
      [ctx.orgId, userId, input.role, input.team_id ?? null, input.title ?? null, input.monthly_target ?? null, input.max_discount_pct, input.assignment_weight, input.accepts_leads, input.countries]);
    if (cur.role !== input.role) await db.exec("insert into audit_logs(org_id, actor_id, action, entity_type, entity_id, changes) values ($1,$2,'permission.changed','member',$3,$4)",
      [ctx.orgId, ctx.userId, userId, { role: [cur.role, input.role] }]);
  });
}

export async function setMemberStatus(ctx: Ctx, userId: string, status: "active" | "deactivated") {
  assertCan(ctx.role, "team", "manage");
  if (userId === ctx.userId) throw new ValidationError("You cannot deactivate yourself.");
  return withTenant(ctx, async (db) => {
    const cur = await db.one<{ role: Role }>("select role from memberships where org_id = $1 and user_id = $2", [ctx.orgId, userId]);
    if (!cur || !canManageMember(ctx.role, cur.role)) throw new ForbiddenError();
    await db.exec("update memberships set status = $3 where org_id = $1 and user_id = $2", [ctx.orgId, userId, status]);
    await db.exec("insert into audit_logs(org_id, actor_id, action, entity_type, entity_id) values ($1,$2,$3,'member',$4)", [ctx.orgId, ctx.userId, `member.${status}`, userId]);
  });
}

export async function revokeInvitation(ctx: Ctx, id: string) {
  assertCan(ctx.role, "team", "manage");
  return withTenant(ctx, (db) => db.exec("update invitations set revoked_at = now() where org_id = $1 and id = $2", [ctx.orgId, id]));
}

export async function createTeam(ctx: Ctx, name: string) {
  assertCan(ctx.role, "team", "manage");
  if (!name.trim()) throw new ValidationError("Team name is required.");
  return withTenant(ctx, (db) => db.exec("insert into teams(org_id, name) values ($1,$2)", [ctx.orgId, name.trim()]));
}
