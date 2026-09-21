export const CURRENCIES = ["AED", "INR", "GBP", "USD", "EUR"] as const;
export const ROLES = ["owner", "admin", "manager", "rep", "marketing", "finance", "viewer"] as const;
export const INVITABLE_ROLES = ["admin", "manager", "rep", "marketing", "finance", "viewer"] as const;
export const ROLE_LABELS: Record<string, string> = {
  owner: "Organisation Owner", admin: "Organisation Admin", manager: "Sales Manager", rep: "Sales Representative",
  marketing: "Marketing User", finance: "Finance User", viewer: "Viewer",
};

export const LEAD_STATUSES = ["new", "unassigned", "researching", "attempting_contact", "contacted", "qualified", "unqualified", "converted", "nurturing", "do_not_contact"] as const;
export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New", unassigned: "Unassigned", researching: "Researching", attempting_contact: "Attempting Contact", contacted: "Contacted",
  qualified: "Qualified", unqualified: "Unqualified", converted: "Converted", nurturing: "Nurturing", do_not_contact: "Do Not Contact",
};
export const LEAD_STATUS_TONE: Record<string, string> = {
  new: "blue", unassigned: "amber", researching: "slate", attempting_contact: "amber", contacted: "blue", qualified: "green",
  unqualified: "slate", converted: "green", nurturing: "violet", do_not_contact: "red",
};
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const PRIORITY_TONE: Record<string, string> = { low: "slate", medium: "blue", high: "amber", urgent: "red" };

export const ACTIVITY_TYPES = ["call", "email", "whatsapp", "meeting", "video_call", "note", "follow_up", "site_visit", "proposal"] as const;
export const ACTIVITY_LABELS: Record<string, string> = {
  call: "Call", email: "Email", whatsapp: "WhatsApp", meeting: "Meeting", video_call: "Video call", note: "Note",
  follow_up: "Follow-up", site_visit: "Site visit", proposal: "Proposal", status_change: "Status change",
};
export const TASK_STATUSES = ["todo", "in_progress", "waiting", "completed", "cancelled"] as const;
export const TASK_STATUS_LABELS: Record<string, string> = { todo: "To Do", in_progress: "In Progress", waiting: "Waiting", completed: "Completed", cancelled: "Cancelled", overdue: "Overdue" };

export const FORECAST_CATEGORIES = ["pipeline", "best_case", "commit", "closed_won", "closed_lost"] as const;
export const RISK_LEVELS = ["low", "medium", "high"] as const;

export const DEFAULT_LOST_REASONS = ["Price", "No budget", "No response", "Competitor selected", "Timing", "Service mismatch", "Internal decision", "Project cancelled", "Duplicate", "Invalid lead", "Other"];

export const DEFAULT_STAGES: { name: string; probability: number; color: string; kind: "open" | "won" | "lost" | "nurture"; required_fields?: string[] }[] = [
  { name: "New Lead", probability: 5, color: "#94a3b8", kind: "open" },
  { name: "Contact Attempted", probability: 10, color: "#64748b", kind: "open" },
  { name: "Contacted", probability: 15, color: "#0ea5e9", kind: "open" },
  { name: "Qualified", probability: 25, color: "#3b82f6", kind: "open" },
  { name: "Discovery Scheduled", probability: 35, color: "#6366f1", kind: "open" },
  { name: "Requirement Confirmed", probability: 45, color: "#8b5cf6", kind: "open", required_fields: ["value"] },
  { name: "Proposal Sent", probability: 60, color: "#a855f7", kind: "open", required_fields: ["value", "expected_close_date"] },
  { name: "Negotiation", probability: 75, color: "#f59e0b", kind: "open", required_fields: ["value", "expected_close_date", "contact_id"] },
  { name: "Verbal Confirmation", probability: 90, color: "#f97316", kind: "open", required_fields: ["value", "expected_close_date", "contact_id"] },
  { name: "Closed Won", probability: 100, color: "#16a34a", kind: "won", required_fields: ["value", "company_id"] },
  { name: "Closed Lost", probability: 0, color: "#dc2626", kind: "lost" },
  { name: "Nurturing", probability: 5, color: "#0d9488", kind: "nurture" },
];

export const STAGE_REQUIRABLE_FIELDS: Record<string, string> = {
  value: "Deal value", expected_close_date: "Expected close date", contact_id: "Primary contact", company_id: "Company",
  next_action: "Next action", decision_makers: "Decision makers", pain_points: "Pain points", proposed_solution: "Proposed solution", competitors: "Competitors",
};

export const DEFAULT_SOURCES = [
  { name: "Website form", channel: "web" }, { name: "Manual entry", channel: "manual" }, { name: "CSV import", channel: "import" },
  { name: "Referral", channel: "referral" }, { name: "LinkedIn", channel: "social" }, { name: "Meta Lead Ads", channel: "paid_social" },
  { name: "Google Ads", channel: "paid_search" }, { name: "WhatsApp", channel: "messaging" }, { name: "Events", channel: "offline" },
  { name: "Cold outreach", channel: "outbound" }, { name: "API", channel: "api" },
];

export const DEFAULT_FX: Record<string, number> = { AED: 1, USD: 3.6725, GBP: 4.95, EUR: 4.3, INR: 0.0415 };

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
