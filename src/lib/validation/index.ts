import { z } from "zod";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { CURRENCIES, INVITABLE_ROLES, LEAD_STATUSES, PRIORITIES, ACTIVITY_TYPES, TASK_STATUSES, FORECAST_CATEGORIES, RISK_LEVELS, ROLES } from "../constants";

// ── primitives ──
const empty = (v: unknown) => v === "" || v === undefined || v === null;
export const optStr = z.preprocess((v) => (empty(v) ? null : String(v).trim() || null), z.string().max(2000).nullable()).optional();
export const optLongStr = z.preprocess((v) => (empty(v) ? null : String(v).trim() || null), z.string().max(20000).nullable()).optional();
export const optNum = z.preprocess((v) => (empty(v) ? null : Number(String(v).replace(/[, ]/g, ""))), z.number({ error: "Must be a number" }).finite().min(0).nullable()).optional();
export const optUuid = z.preprocess((v) => (empty(v) ? null : v), z.uuid().nullable()).optional();
export const optDate = z.preprocess((v) => (empty(v) ? null : v), z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date").nullable()).optional();
export const optEmail = z.preprocess((v) => (empty(v) ? null : String(v).trim().toLowerCase()), z.email("Invalid email address").nullable()).optional();
export const tagList = z.preprocess((v) => {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (empty(v)) return [];
  return String(v).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}, z.array(z.string().max(60)).max(50));

const COUNTRY_CODES: Record<string, CountryCode> = { "united arab emirates": "AE", uae: "AE", "united kingdom": "GB", uk: "GB", india: "IN", "saudi arabia": "SA", "united states": "US", usa: "US" };
/** Normalises to E.164. Returns { value } or { error }. */
export function normalizePhone(raw: string | null | undefined, country?: string | null): { value: string | null; error?: string } {
  if (empty(raw)) return { value: null };
  const cleaned = String(raw).trim();
  const cc = COUNTRY_CODES[(country ?? "").toLowerCase()] ?? "AE";
  const p = parsePhoneNumberFromString(cleaned.startsWith("00") ? "+" + cleaned.slice(2) : cleaned, cc);
  if (!p || !p.isPossible()) return { value: cleaned, error: "Phone number format looks invalid" };
  return { value: p.number };
}

// ── auth ──
export const registerSchema = z.object({
  orgName: z.string().trim().min(2, "Organisation name is required").max(120),
  name: z.string().trim().min(2, "Your name is required").max(120),
  email: z.email("Enter a valid email").transform((s) => s.toLowerCase()),
  password: z.string().min(10, "At least 10 characters").max(200),
  currency: z.enum(CURRENCIES).default("AED"),
});
export const loginSchema = z.object({ email: z.email("Enter a valid email").transform((s) => s.toLowerCase()), password: z.string().min(1, "Password is required") });

// ── team ──
export const inviteRowSchema = z.object({
  email: z.email("Invalid email").transform((s) => s.trim().toLowerCase()),
  name: optStr,
  role: z.enum(INVITABLE_ROLES),
  team_id: optUuid,
});
export const memberUpdateSchema = z.object({
  role: z.enum(ROLES),
  team_id: optUuid,
  title: optStr,
  monthly_target: optNum,
  max_discount_pct: z.preprocess((v) => (empty(v) ? 10 : Number(v)), z.number().min(0).max(100)),
  assignment_weight: z.preprocess((v) => (empty(v) ? 1 : Number(v)), z.number().int().min(0).max(10)),
  accepts_leads: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  countries: tagList,
});

// ── CRM ──
export const leadSchema = z.object({
  first_name: optStr, last_name: optStr, full_name: optStr,
  job_title: optStr, company_name: optStr, email: optEmail, phone: optStr, whatsapp: optStr,
  country: optStr, city: optStr, website: optStr, linkedin_url: optStr,
  source_id: optUuid, campaign_id: optUuid, industry: optStr, company_size: optStr,
  estimated_budget: optNum, services: tagList, owner_id: optUuid, team_id: optUuid,
  status: z.enum(LEAD_STATUSES).optional(), priority: z.enum(PRIORITIES).optional(),
  expected_value: optNum, currency: z.enum(CURRENCIES).optional(), timeframe: optStr, authority: optStr,
  next_follow_up_at: optDate, consent_status: z.enum(["unknown", "granted", "denied", "unsubscribed"]).optional(),
  tags: tagList.optional(), notes: optLongStr,
}).refine((v) => v.full_name || v.first_name || v.last_name || v.email || v.company_name, { message: "Enter at least a name, email or company", path: ["full_name"] });
export type LeadInput = z.infer<typeof leadSchema>;

export const companySchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200),
  website: optStr, industry: optStr, company_size: optStr, revenue_range: optStr, phone: optStr, email: optEmail,
  linkedin_url: optStr, country: optStr, city: optStr, billing_address: optStr, owner_id: optUuid, parent_id: optUuid,
  client_status: z.enum(["prospect", "active_client", "former_client", "partner"]).optional(),
  health: z.preprocess((v) => (empty(v) ? null : v), z.enum(["healthy", "watch", "at_risk"]).nullable()).optional(),
  operating_markets: tagList.optional(), active_services: tagList.optional(), tags: tagList.optional(), notes: optLongStr,
});
export const contactSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(120), last_name: optStr,
  company_id: optUuid, job_title: optStr, email: optEmail, phone: optStr, mobile: optStr, whatsapp: optStr,
  preferred_channel: z.preprocess((v) => (empty(v) ? null : v), z.enum(["email", "phone", "whatsapp", "linkedin", "meeting"]).nullable()).optional(),
  decision_role: z.preprocess((v) => (empty(v) ? null : v), z.enum(["decision_maker", "influencer", "champion", "user", "gatekeeper", "finance", "other"]).nullable()).optional(),
  country: optStr, city: optStr, linkedin_url: optStr, owner_id: optUuid,
  consent_status: z.enum(["unknown", "granted", "denied", "unsubscribed"]).optional(), tags: tagList.optional(), notes: optLongStr,
});
export const opportunitySchema = z.object({
  name: z.string().trim().min(2, "Opportunity name is required").max(200),
  company_id: optUuid, contact_id: optUuid, owner_id: optUuid, pipeline_id: z.uuid(), stage_id: optUuid,
  value: optNum, currency: z.enum(CURRENCIES).optional(), expected_close_date: optDate, services: tagList.optional(),
  source_id: optUuid, competitors: optStr, decision_makers: optStr, pain_points: optLongStr, proposed_solution: optLongStr,
  next_action: optStr, next_action_date: optDate, risk_level: z.enum(RISK_LEVELS).optional(),
  forecast_category: z.enum(FORECAST_CATEGORIES).optional(), discount_pct: optNum, tags: tagList.optional(),
});
export const opportunityUpdateSchema = opportunitySchema.partial().extend({ pipeline_id: optUuid });

export const activitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES), subject: z.string().trim().min(1, "Subject is required").max(300), body: optLongStr, outcome: optStr,
  direction: z.preprocess((v) => (empty(v) ? null : v), z.enum(["inbound", "outbound"]).nullable()).optional(),
  duration_min: optNum, occurred_at: optDate, next_action: optStr,
  lead_id: optUuid, contact_id: optUuid, company_id: optUuid, opportunity_id: optUuid,
  follow_up_at: optDate,
});
export const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300), description: optLongStr, owner_id: optUuid,
  priority: z.enum(PRIORITIES).default("medium"), due_at: optDate, reminder_at: optDate,
  status: z.enum(TASK_STATUSES).optional(), recurrence: z.preprocess((v) => (empty(v) ? null : v), z.enum(["daily", "weekly", "monthly"]).nullable()).optional(),
  lead_id: optUuid, contact_id: optUuid, company_id: optUuid, opportunity_id: optUuid,
});

export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = fd.getAll(key).filter((v) => typeof v === "string");
    out[key] = key.endsWith("[]") ? all : all[all.length - 1];
  }
  for (const k of Object.keys(out)) if (k.endsWith("[]")) { out[k.slice(0, -2)] = out[k]; delete out[k]; }
  return out;
}

export function fieldErrors(err: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "_");
    (out[k] ??= []).push(i.message);
  }
  return out;
}
