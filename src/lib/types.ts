export type Role = "owner" | "admin" | "manager" | "rep" | "marketing" | "finance" | "viewer";

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  date_format: string;
  plan_code: string;
  status: string;
  settings: Record<string, unknown>;
  terminology: Record<string, string>;
}

export interface Ctx {
  userId: string;
  orgId: string;
  role: Role;
  sessionId: string;
  user: { id: string; name: string; email: string; is_platform_admin: boolean; must_change_password: boolean };
  org: OrgInfo;
  teamId: string | null;
}

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
