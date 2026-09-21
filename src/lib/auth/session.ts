import "server-only";
import { cookies, headers } from "next/headers";
import { withSystem, type Db } from "../db";
import { env } from "../env";
import { newToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "sos_session";
const SESSION_DAYS = 30;

export async function requestMeta() {
  const h = await headers();
  return { ip: (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown", ua: h.get("user-agent") ?? "" };
}

export async function createSession(db: Db, userId: string, orgId: string | null) {
  const token = newToken();
  const meta = await requestMeta();
  await db.exec(
    `insert into sessions(token_hash, user_id, active_org_id, ip, user_agent, expires_at) values ($1,$2,$3,$4,$5, now() + interval '${SESSION_DAYS} days')`,
    [sha256(token), userId, orgId, meta.ip, meta.ua],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: env().APP_URL.startsWith("https://"), path: "/", maxAge: SESSION_DAYS * 86400,
  });
}

export async function currentToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function destroySession() {
  const token = await currentToken();
  if (token) await withSystem((db) => db.exec("update sessions set revoked_at = now() where token_hash = $1", [sha256(token)]));
  (await cookies()).delete(SESSION_COOKIE);
}
