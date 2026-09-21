import { describe, expect, it } from "vitest";
import { scoreLead, scoreCategory, mergeScoring, DEFAULT_SCORING } from "@/lib/scoring";

describe("lead scoring", () => {
  it("scores an ideal lead as Hot with a full explanation", () => {
    const r = scoreLead({ industry: "Real Estate", services: ["SEO", "Performance Marketing"], budget_in_base: 80000, job_title: "CEO", company_size: "51-200", country: "United Arab Emirates", website: "https://x.ae", linkedin_url: "https://linkedin.com/x", status: "qualified", timeframe: "0-3 months" });
    expect(r.score).toBe(100);
    expect(r.category).toBe("Hot");
    expect(r.breakdown).toHaveLength(9);
    expect(r.breakdown.every((b) => b.reason.length > 0)).toBe(true);
  });
  it("scores an empty lead at zero", () => {
    expect(scoreLead({}).score).toBe(0);
  });
  it("gives partial credit and explains it", () => {
    const r = scoreLead({ industry: "Mining", job_title: "Marketing Manager", budget_in_base: 20000 });
    const ind = r.breakdown.find((b) => b.key === "industry")!;
    expect(ind.points).toBe(6);
    expect(ind.reason).toMatch(/outside target/);
    expect(r.breakdown.find((b) => b.key === "authority")!.points).toBe(5);
    expect(r.breakdown.find((b) => b.key === "budget")!.points).toBe(9);
  });
  it("respects custom weights and thresholds", () => {
    const cfg = mergeScoring({ weights: { ...DEFAULT_SCORING.weights, industry: 100 }, thresholds: { hot: 50, warm: 30, nurture: 10 } });
    const r = scoreLead({ industry: "Real Estate" }, cfg);
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.category).toBe("Hot");
    expect(scoreCategory(45)).toBe("Nurture");
    expect(scoreCategory(39)).toBe("Low Priority");
  });
});
