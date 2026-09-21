import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { withSystem } from "../db";
import { sha256 } from "./crypto";
import { currentToken } from "./session";
import type { Ctx, OrgInfo, Role } from "../types";

interface Row {
  session_id: string; last_seen_at: string; user_id: string; name: string; email: string; is_platform_admin: boolean; must_change_password: boolean;
  active_org_id: string | null;
}

export interface Membership { org_id: string; org_name: string; role: Role; org_status: string }

export const getSessionUser = cache(async () => {
  const token = await currentToken();
  if (!token) return null;
  return withSystem(async (db) => {
    const s = await db.one<Row>(
      `select s.id session_id, s.last_seen_at, s.active_org_id, u.id user_id, u.name, u.email, u.is_platform_admin, u.must_change_password
         from sessions s join users u on u.id = s.user_id
        where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.disabled_at is null`,
      [sha256(token)],
    );
    if (!s) return null;
    if (Date.now() - new Date(s.last_seen_at).getTime() > 5 * 60_000) {
      await db.exec("update sessions set last_seen_at = now(), expires_at = now() + interval '30 days' where id = $1", [s.session_id]);
    }
    const memberships = await db.many<Membership>(
      `select m.org_id, o.name org_name, m.role, o.status org_status from memberships m join organisations o on o.id = m.org_id
        where m.user_id = $1 and m.status = 'active' order by o.name`, [s.user_id]);
    return { ...s, memberships };
  });
});

export const getCtx = cache(async (): Promise<Ctx | null> => {
  const su = await getSessionUser();
  if (!su) return null;
  const usable = su.memberships.filter((m) => m.org_status === "active");
  const m = usable.find((x) => x.org_id === su.active_org_id) ?? usable[0];
  if (!m) return null;
  return withSystem(async (db) => {
    if (m.org_id !== su.active_org_id) await db.exec("update sessions set active_org_id = $1 where id = $2", [m.org_id, su.session_id]);
    const org = await db.one<OrgInfo>("select id, name, slug, currency, timezone, date_format, plan_code, status, settings, terminology from organisations where id = $1", [m.org_id]);
    const mem = await db.one<{ team_id: string | null }>("select team_id from memberships where org_id = $1 and user_id = $2", [m.org_id, su.user_id]);
    return {
      userId: su.user_id, orgId: m.org_id, role: m.role, sessionId: su.session_id, teamId: mem?.team_id ?? null,
      user: { id: su.user_id, name: su.name, email: su.email, is_platform_admin: su.is_platform_admin, must_change_password: su.must_change_password },
      org: org!,
    };
  });
});

/** Use in every protected page / action. Redirects to sign-in when unauthenticated. */
export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) {
    const su = await getSessionUser();
    redirect(su ? "/no-organisation" : "/login");
  }
  return ctx;
}
