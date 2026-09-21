/** Explainable, rule-based lead scoring (0–100). Weights, targets and thresholds are organisation-configurable. */
export interface ScoringConfig {
  weights: Record<DimensionKey, number>;
  target_industries: string[];
  core_services: string[];
  target_countries: string[];
  budget_min: number; // in organisation base currency
  budget_ideal: number;
  thresholds: { hot: number; warm: number; nurture: number };
}
export type DimensionKey = "industry" | "service" | "budget" | "authority" | "size" | "market" | "digital" | "engagement" | "timeframe";

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  industry: "Industry fit", service: "Service requirement fit", budget: "Budget fit", authority: "Decision-making authority",
  size: "Business size & potential", market: "Country / market fit", digital: "Digital presence opportunity", engagement: "Engagement level", timeframe: "Timeframe",
};

export const DEFAULT_SCORING: ScoringConfig = {
  weights: { industry: 15, service: 15, budget: 15, authority: 10, size: 10, market: 10, digital: 10, engagement: 10, timeframe: 5 },
  target_industries: ["Real Estate", "Hospitality", "Events", "E-commerce", "Retail", "Healthcare", "Education", "Professional Services", "Technology", "Finance", "Construction"],
  core_services: ["Performance Marketing", "SEO", "Website Development", "E-commerce", "CRM / ERP", "AI Automation", "Social Media", "Branding", "Content Production", "Market Research"],
  target_countries: ["United Arab Emirates", "United Kingdom", "India", "Saudi Arabia", "United States"],
  budget_min: 10000,
  budget_ideal: 50000,
  thresholds: { hot: 80, warm: 60, nurture: 40 },
};

export interface ScoreInput {
  industry?: string | null; services?: string[] | null; estimated_budget?: number | string | null; budget_in_base?: number | null;
  job_title?: string | null; authority?: string | null; company_size?: string | null; country?: string | null;
  website?: string | null; linkedin_url?: string | null; status?: string | null; timeframe?: string | null; last_contacted_at?: string | Date | null;
}
export interface ScoreLine { key: DimensionKey; label: string; weight: number; points: number; reason: string }

const lc = (s?: string | null) => (s ?? "").trim().toLowerCase();

export function scoreLead(input: ScoreInput, cfg: ScoringConfig = DEFAULT_SCORING): { score: number; breakdown: ScoreLine[]; category: string } {
  const lines: ScoreLine[] = [];
  const add = (key: DimensionKey, factor: number, reason: string) => {
    const weight = cfg.weights[key] ?? 0;
    lines.push({ key, label: DIMENSION_LABELS[key], weight, points: Math.round(weight * Math.max(0, Math.min(1, factor)) * 10) / 10, reason });
  };

  // Industry
  const ind = lc(input.industry);
  if (!ind) add("industry", 0, "Industry not captured");
  else if (cfg.target_industries.some((t) => lc(t) === ind)) add("industry", 1, `${input.industry} is a target industry`);
  else add("industry", 0.4, `${input.industry} is outside target industries`);

  // Services
  const svcs = (input.services ?? []).map(lc).filter(Boolean);
  const matched = svcs.filter((s) => cfg.core_services.some((c) => lc(c) === s));
  if (!svcs.length) add("service", 0, "No required services captured");
  else if (matched.length) add("service", Math.min(1, 0.7 + 0.15 * matched.length), `Needs ${matched.length} core service(s)`);
  else add("service", 0.3, "Requested services are not core offers");

  // Budget
  const budget = input.budget_in_base ?? (input.estimated_budget != null && input.estimated_budget !== "" ? Number(input.estimated_budget) : null);
  if (budget == null || Number.isNaN(budget)) add("budget", 0, "Budget unknown");
  else if (budget >= cfg.budget_ideal) add("budget", 1, "Budget at or above ideal deal size");
  else if (budget >= cfg.budget_min) add("budget", 0.6, "Budget above minimum, below ideal");
  else add("budget", 0.2, "Budget below minimum");

  // Authority
  const title = lc(input.job_title);
  const senior = /(founder|owner|ceo|chief|c[mto]o|managing|director|president|partner|head of|vp|vice president|general manager|\bgm\b|proprietor)/;
  if (lc(input.authority) === "decision_maker" || senior.test(title)) add("authority", 1, input.job_title ? `${input.job_title} is a likely decision maker` : "Marked as decision maker");
  else if (/manager|lead|supervisor/.test(title) || lc(input.authority) === "influencer") add("authority", 0.5, "Influencer-level contact");
  else if (title) add("authority", 0.2, "Contact is unlikely to decide");
  else add("authority", 0, "Job title unknown");

  // Size
  const sizeMap: Record<string, number> = { "1-10": 0.4, "11-50": 0.7, "51-200": 1, "201-500": 1, "501-1000": 1, "1000+": 1 };
  const size = input.company_size ?? "";
  add("size", sizeMap[size] ?? 0, size ? `Company size ${size}` : "Company size unknown");

  // Market
  const ctry = lc(input.country);
  if (!ctry) add("market", 0, "Country unknown");
  else if (cfg.target_countries.some((c) => lc(c) === ctry)) add("market", 1, `${input.country} is a target market`);
  else add("market", 0.3, `${input.country} is a secondary market`);

  // Digital presence
  const hasWeb = !!lc(input.website), hasLi = !!lc(input.linkedin_url);
  add("digital", (hasWeb ? 0.6 : 0) + (hasLi ? 0.4 : 0), hasWeb || hasLi ? `${[hasWeb && "website", hasLi && "LinkedIn"].filter(Boolean).join(" + ")} available to assess` : "No website or social profile captured");

  // Engagement
  const st = lc(input.status);
  if (["qualified", "converted"].includes(st)) add("engagement", 1, "Qualified and engaged");
  else if (st === "contacted") add("engagement", 0.7, "Two-way contact established");
  else if (st === "attempting_contact" || input.last_contacted_at) add("engagement", 0.3, "Outreach started, no response yet");
  else add("engagement", 0, "No engagement yet");

  // Timeframe
  const tf = lc(input.timeframe);
  if (/immediate|now|0-1|this month|0-3/.test(tf)) add("timeframe", 1, "Buying within 3 months");
  else if (/3-6|quarter/.test(tf)) add("timeframe", 0.6, "Buying in 3–6 months");
  else if (tf) add("timeframe", 0.2, "Longer timeframe");
  else add("timeframe", 0, "Timeframe unknown");

  const total = lines.reduce((s, l) => s + l.weight, 0) || 100;
  const raw = lines.reduce((s, l) => s + l.points, 0);
  const score = Math.max(0, Math.min(100, Math.round((raw / total) * 100)));
  return { score, breakdown: lines, category: scoreCategory(score, cfg) };
}

export function scoreCategory(score: number, cfg: ScoringConfig = DEFAULT_SCORING) {
  if (score >= cfg.thresholds.hot) return "Hot";
  if (score >= cfg.thresholds.warm) return "Warm";
  if (score >= cfg.thresholds.nurture) return "Nurture";
  return "Low Priority";
}

export function mergeScoring(raw: unknown): ScoringConfig {
  const r = (raw ?? {}) as Partial<ScoringConfig>;
  return { ...DEFAULT_SCORING, ...r, weights: { ...DEFAULT_SCORING.weights, ...(r.weights ?? {}) }, thresholds: { ...DEFAULT_SCORING.thresholds, ...(r.thresholds ?? {}) } };
}
