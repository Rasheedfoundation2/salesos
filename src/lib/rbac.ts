import type { Role } from "./types";

export type Module = "leads" | "contacts" | "companies" | "opportunities" | "activities" | "tasks" | "reports" | "team" | "settings" | "audit" | "billing" | "import" | "export" | "api_keys";
export type Action = "view" | "create" | "edit" | "archive" | "assign" | "export" | "import" | "manage";
export type Scope = "all" | "own" | "none";

type Matrix = Record<Role, Partial<Record<Module, { scope: Scope; actions: Action[] }>>>;

const FULL: Action[] = ["view", "create", "edit", "archive", "assign", "export", "import", "manage"];
const RO: Action[] = ["view"];

export const MATRIX: Matrix = {
  owner: Object.fromEntries((["leads", "contacts", "companies", "opportunities", "activities", "tasks", "reports", "team", "settings", "audit", "billing", "import", "export", "api_keys"] as Module[]).map((m) => [m, { scope: "all", actions: FULL }])),
  admin: Object.fromEntries((["leads", "contacts", "companies", "opportunities", "activities", "tasks", "reports", "team", "settings", "audit", "import", "export", "api_keys"] as Module[]).map((m) => [m, { scope: "all", actions: FULL }])),
  manager: {
    leads: { scope: "all", actions: ["view", "create", "edit", "archive", "assign", "export", "import"] },
    contacts: { scope: "all", actions: ["view", "create", "edit", "archive", "assign", "export", "import"] },
    companies: { scope: "all", actions: ["view", "create", "edit", "archive", "assign", "export", "import"] },
    opportunities: { scope: "all", actions: ["view", "create", "edit", "archive", "assign", "export"] },
    activities: { scope: "all", actions: ["view", "create", "edit"] },
    tasks: { scope: "all", actions: ["view", "create", "edit", "assign"] },
    reports: { scope: "all", actions: ["view", "export"] },
    import: { scope: "all", actions: ["import"] },
    export: { scope: "all", actions: ["export"] },
  },
  rep: {
    leads: { scope: "own", actions: ["view", "create", "edit"] },
    contacts: { scope: "all", actions: ["view", "create", "edit"] },
    companies: { scope: "all", actions: ["view", "create", "edit"] },
    opportunities: { scope: "own", actions: ["view", "create", "edit"] },
    activities: { scope: "own", actions: ["view", "create", "edit"] },
    tasks: { scope: "own", actions: ["view", "create", "edit"] },
    reports: { scope: "own", actions: ["view"] },
  },
  marketing: {
    leads: { scope: "all", actions: ["view", "create", "edit", "export", "import"] },
    contacts: { scope: "all", actions: RO },
    companies: { scope: "all", actions: RO },
    opportunities: { scope: "all", actions: RO },
    activities: { scope: "own", actions: ["view", "create"] },
    tasks: { scope: "own", actions: ["view", "create", "edit"] },
    reports: { scope: "all", actions: ["view"] },
    import: { scope: "all", actions: ["import"] },
    export: { scope: "all", actions: ["export"] },
  },
  finance: {
    contacts: { scope: "all", actions: RO },
    companies: { scope: "all", actions: RO },
    opportunities: { scope: "all", actions: ["view", "export"] },
    activities: { scope: "own", actions: ["view", "create"] },
    tasks: { scope: "own", actions: ["view", "create", "edit"] },
    reports: { scope: "all", actions: ["view", "export"] },
    export: { scope: "all", actions: ["export"] },
  },
  viewer: Object.fromEntries((["leads", "contacts", "companies", "opportunities", "activities", "tasks", "reports"] as Module[]).map((m) => [m, { scope: "all", actions: RO }])),
};

export function can(role: Role, module: Module, action: Action = "view"): boolean {
  return MATRIX[role]?.[module]?.actions.includes(action) ?? false;
}
export function scopeOf(role: Role, module: Module): Scope {
  return MATRIX[role]?.[module]?.scope ?? "none";
}

/** Fields hidden from a role when serialising a record. */
export const FIELD_RESTRICTIONS: Partial<Record<Role, Partial<Record<Module, string[]>>>> = {
  marketing: { opportunities: ["value", "weighted_value", "discount_pct", "lost_notes"] },
};
export function redact<T extends Record<string, unknown>>(role: Role, module: Module, row: T): T {
  const hidden = FIELD_RESTRICTIONS[role]?.[module];
  if (!hidden) return row;
  const copy: Record<string, unknown> = { ...row };
  for (const f of hidden) if (f in copy) copy[f] = null;
  return copy as T;
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") { super(message); this.name = "ForbiddenError"; }
}
export class ValidationError extends Error {
  constructor(message: string, public fieldErrors?: Record<string, string[]>) { super(message); this.name = "ValidationError"; }
}
export class NotFoundError extends Error {
  constructor(message = "Record not found or you do not have access to it.") { super(message); this.name = "NotFoundError"; }
}

export function assertCan(role: Role, module: Module, action: Action = "view") {
  if (!can(role, module, action)) throw new ForbiddenError();
}

/** Roles that can manage a target role (admins cannot modify owners). */
export function canManageMember(actor: Role, target: Role) {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner";
  return false;
}
