import "server-only";
import { withSystem, type Db } from "../db";
import { hashPassword, newToken, passwordIssues, sha256, verifyPassword } from "../auth/crypto";
import { createSession, requestMeta } from "../auth/session";
import { ValidationError } from "../rbac";
import { slugify } from "../utils";
import { env } from "../env";
import { DEFAULT_ORG_SETTINGS, provisionOrg } from "./provision";

async function uniqueSlug(db: Db, name: string) {
  const base = slugify(name);
  let slug = base, n = 1;
  while (await db.one("select 1 from organisations where slug = $1", [slug])) slug = `${base}-${++n}`;
  return slug;
}

export async function createOrganisation(db: Db, userId: string, name: string, currency = "AED") {
  const org = await db.one<{ id: string }>(
    `insert into organisations(name, slug, plan_code, trial_ends_at, currency, settings) values ($1,$2,'trial', now() + interval '14 days', $3, $4) returning id`,
    [name, await uniqueSlug(db, name), currency, DEFAULT_ORG_SETTINGS],
  );
  const team = await provisionOrg(db, org!.id, currency).then(() => db.one<{ id: string }>("select id from teams where org_id = $1 limit 1", [org!.id]));
  await db.exec("insert into memberships(org_id, user_id, role, team_id, max_discount_pct) values ($1,$2,'owner',$3,100)", [org!.id, userId, team?.id ?? null]);
  await db.exec("insert into audit_logs(org_id, actor_id, action, entity_type, entity_id) values ($1,$2,'organisation.created','settings',$1)", [org!.id, userId]);
  return org!.id;
}

export async function register(input: { orgName: string; name: string; email: string; password: string; currency: string }) {
  const issue = passwordIssues(input.password);
  if (issue) throw new ValidationError(issue, { password: [issue] });
  return withSystem(async (db) => {
    if (await db.one("select 1 from users where email = $1", [input.email])) {
      throw new ValidationError("An account with this email already exists. Sign in instead.", { email: ["Already registered"] });
    }
    const u = await db.one<{ id: string }>("insert into users(email, name, password_hash) values ($1,$2,$3) returning id", [input.email, input.name, await hashPassword(input.password)]);
    const orgId = await createOrganisation(db, u!.id, input.orgName, input.currency);
    await createSession(db, u!.id, orgId);
    return { userId: u!.id, orgId };
  });
}

const MAX_FAILED = 10;
export async function login(email: string, password: string) {
  const meta = await requestMeta();
  return withSystem(async (db) => {
    const u = await db.one<{ id: string; password_hash: string; disabled_at: string | null; locked_until: string | null; failed_logins: number }>(
      "select id, password_hash, disabled_at, locked_until, failed_logins from users where email = $1", [email]);
    const fail = async (reason: string, msg = "Incorrect email or password.") => {
      await db.exec("insert into login_history(user_id, email, success, reason, ip, user_agent) values ($1,$2,false,$3,$4,$5)", [u?.id ?? null, email, reason, meta.ip, meta.ua]);
      return { ok: false as const, error: msg };
    };
    if (!u) { await hashPassword("timing-equaliser"); return fail("unknown_email"); }
    if (u.disabled_at) return fail("disabled", "This account has been disabled. Contact your administrator.");
    if (u.locked_until && new Date(u.locked_until) > new Date()) return fail("locked", "Too many failed attempts. Try again in 15 minutes.");
    if (!(await verifyPassword(password, u.password_hash))) {
      const n = u.failed_logins + 1;
      const lock = n >= MAX_FAILED;
      await db.exec("update users set failed_logins = $2::int, locked_until = case when $3::boolean then now() + interval '15 minutes' else null end where id = $1", [u.id, lock ? 0 : n, lock]);
      return fail("bad_password");
    }
    await db.exec("update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1", [u.id]);
    await db.exec("insert into login_history(user_id, email, success, ip, user_agent) values ($1,$2,true,$3,$4)", [u.id, email, meta.ip, meta.ua]);
    const m = await db.one<{ org_id: string }>(
      "select m.org_id from memberships m join organisations o on o.id = m.org_id where m.user_id = $1 and m.status = 'active' and o.status = 'active' order by m.created_at limit 1", [u.id]);
    if (m) await db.exec("insert into audit_logs(org_id, actor_id, action, entity_type, changes) values ($1,$2,'login','session',$3)", [m.org_id, u.id, { ip: meta.ip }]);
    await createSession(db, u.id, m?.org_id ?? null);
    return { ok: true as const };
  });
}

export async function requestPasswordReset(email: string) {
  await withSystem(async (db) => {
    const u = await db.one<{ id: string; name: string }>("select id, name from users where email = $1 and disabled_at is null", [email]);
    if (!u) return;
    const token = newToken();
    await db.exec("insert into password_resets(user_id, token_hash, expires_at) values ($1,$2, now() + interval '60 minutes')", [u.id, sha256(token)]);
    const link = `${env().APP_URL}/reset/${token}`;
    await db.exec("insert into email_outbox(to_email, subject, body) values ($1,$2,$3)", [email, "Reset your DigiFalx SalesOS password",
      `Hello ${u.name},\n\nUse this link within 60 minutes to set a new password:\n${link}\n\nIf you did not request this, ignore this email.`]);
    if (env().NODE_ENV !== "production") console.info(`[dev] Password reset link for ${email}: ${link}`);
  });
}

export async function resetPassword(token: string, password: string) {
  const issue = passwordIssues(password);
  if (issue) throw new ValidationError(issue, { password: [issue] });
  return withSystem(async (db) => {
    const r = await db.one<{ id: string; user_id: string }>("select id, user_id from password_resets where token_hash = $1 and used_at is null and expires_at > now()", [sha256(token)]);
    if (!r) throw new ValidationError("This reset link is invalid or has expired.");
    await db.exec("update password_resets set used_at = now() where id = $1", [r.id]);
    await db.exec("update users set password_hash = $2, must_change_password = false, failed_logins = 0, locked_until = null where id = $1", [r.user_id, await hashPassword(password)]);
    await db.exec("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [r.user_id]);
  });
}

export async function changePassword(userId: string, current: string | null, next: string, requireCurrent = true) {
  const issue = passwordIssues(next);
  if (issue) throw new ValidationError(issue, { password: [issue] });
  return withSystem(async (db) => {
    const u = await db.one<{ password_hash: string }>("select password_hash from users where id = $1", [userId]);
    if (requireCurrent && !(await verifyPassword(current ?? "", u?.password_hash ?? null))) throw new ValidationError("Current password is incorrect.", { current: ["Incorrect"] });
    await db.exec("update users set password_hash = $2, must_change_password = false where id = $1", [userId, await hashPassword(next)]);
  });
}

export async function getInvitation(token: string) {
  return withSystem((db) => db.one<{ id: string; org_id: string; org_name: string; email: string; name: string | null; role: string; user_exists: boolean }>(
    `select i.id, i.org_id, o.name org_name, i.email, i.name, i.role, exists(select 1 from users u where u.email = i.email) user_exists
       from invitations i join organisations o on o.id = i.org_id
      where i.token_hash = $1 and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()`, [sha256(token)]));
}

export async function acceptInvitation(token: string, input: { name?: string; password: string }) {
  return withSystem(async (db) => {
    const inv = await db.one<{ id: string; org_id: string; email: string; name: string | null; role: string; team_id: string | null; invited_by: string | null }>(
      "select * from invitations where token_hash = $1 and accepted_at is null and revoked_at is null and expires_at > now() for update", [sha256(token)]);
    if (!inv) throw new ValidationError("This invitation is invalid, expired or already used.");
    let user = await db.one<{ id: string; password_hash: string }>("select id, password_hash from users where email = $1", [inv.email]);
    if (user) {
      if (!(await verifyPassword(input.password, user.password_hash))) throw new ValidationError("Password is incorrect for this existing account.", { password: ["Incorrect password"] });
    } else {
      const issue = passwordIssues(input.password);
      if (issue) throw new ValidationError(issue, { password: [issue] });
      const name = (input.name ?? inv.name ?? "").trim();
      if (name.length < 2) throw new ValidationError("Enter your name.", { name: ["Required"] });
      user = await db.one("insert into users(email, name, password_hash) values ($1,$2,$3) returning id, password_hash", [inv.email, name, await hashPassword(input.password)]);
    }
    await db.exec(
      `insert into memberships(org_id, user_id, role, team_id) values ($1,$2,$3,$4)
       on conflict (org_id, user_id) do update set role = excluded.role, team_id = excluded.team_id, status = 'active'`,
      [inv.org_id, user!.id, inv.role, inv.team_id]);
    await db.exec("update invitations set accepted_at = now() where id = $1", [inv.id]);
    await db.exec("insert into audit_logs(org_id, actor_id, action, entity_type, entity_id, changes) values ($1,$2,'invitation.accepted','member',$2,$3)", [inv.org_id, user!.id, { role: inv.role }]);
    if (inv.invited_by) await db.exec("insert into notifications(org_id, user_id, type, title, link) values ($1,$2,'team','Invitation accepted: ' || $3, '/team')", [inv.org_id, inv.invited_by, inv.email]);
    await createSession(db, user!.id, inv.org_id);
  });
}

export async function switchOrganisation(sessionId: string, userId: string, orgId: string) {
  return withSystem(async (db) => {
    const ok = await db.one("select 1 from memberships m join organisations o on o.id = m.org_id where m.user_id = $1 and m.org_id = $2 and m.status = 'active' and o.status = 'active'", [userId, orgId]);
    if (!ok) throw new ValidationError("You are not a member of that organisation.");
    await db.exec("update sessions set active_org_id = $1 where id = $2", [orgId, sessionId]);
  });
}
