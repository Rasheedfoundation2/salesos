import "server-only";
import type { NextRequest } from "next/server";
import { withSystem } from "./db";
import { resolveApiKey } from "./services/settings";
import { apiError } from "./http";
import type { Ctx, OrgInfo, Role } from "./types";

const buckets = new Map<string, { n: number; reset: number }>();
const LIMIT = 120; // requests per minute per key (per server instance)

/** Authenticates `Authorization: Bearer sk_live_…` and builds a tenant context acting as the key's creator. */
export async function apiContext(req: NextRequest): Promise<{ ctx: Ctx; res?: never } | { res: Response; ctx?: never }> {
  const auth = req.headers.get("authorization") ?? "";
  const secret = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!secret) return { res: apiError(401, "unauthenticated", "Missing API key (Authorization: Bearer <key>)") };
  const key = await resolveApiKey(secret);
  if (!key) return { res: apiError(401, "invalid_api_key", "API key is invalid or revoked") };
  const now = Date.now(); const b = buckets.get(key.id);
  if (!b || b.reset < now) buckets.set(key.id, { n: 1, reset: now + 60_000 });
  else if (++b.n > LIMIT) return { res: apiError(429, "rate_limited", `Rate limit of ${LIMIT} requests/minute exceeded`) };
  const info = await withSystem(async (db) => ({
    org: (await db.one<OrgInfo>("select id, name, slug, currency, timezone, date_format, plan_code, status, settings, terminology from organisations where id = $1", [key.org_id]))!,
    user: (await db.one<{ name: string; email: string; role: Role }>("select u.name, u.email, m.role from users u join memberships m on m.user_id = u.id and m.org_id = $2 where u.id = $1", [key.created_by, key.org_id]))!,
  }));
  return { ctx: { userId: key.created_by, orgId: key.org_id, role: info.user.role, sessionId: `api:${key.id}`, teamId: null, org: info.org,
    user: { id: key.created_by, name: `${info.user.name} (API)`, email: info.user.email, is_platform_admin: false, must_change_password: false } } };
}
