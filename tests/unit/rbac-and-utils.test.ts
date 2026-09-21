import { describe, expect, it } from "vitest";
import { can, canManageMember, redact, scopeOf } from "@/lib/rbac";
import { normalizePhone, leadSchema } from "@/lib/validation";
import { safeCell } from "@/lib/services/exports";
import { suggestMapping } from "@/lib/services/imports";
import { parseBulkUsers } from "@/lib/services/team";
import { leadNextAction } from "@/lib/nba";
import { money, fmtDate } from "@/lib/utils";

describe("RBAC matrix", () => {
  it("limits sales reps to their own leads without assign/export/archive", () => {
    expect(can("rep", "leads", "view")).toBe(true);
    expect(scopeOf("rep", "leads")).toBe("own");
    expect(can("rep", "leads", "assign")).toBe(false);
    expect(can("rep", "leads", "export")).toBe(false);
    expect(can("rep", "leads", "archive")).toBe(false);
  });
  it("gives admins team management but not billing", () => {
    expect(can("admin", "team", "manage")).toBe(true);
    expect(can("admin", "billing", "manage")).toBe(false);
    expect(can("owner", "billing", "manage")).toBe(true);
  });
  it("keeps viewers read-only and finance away from leads", () => {
    expect(can("viewer", "leads", "view")).toBe(true);
    expect(can("viewer", "leads", "create")).toBe(false);
    expect(can("finance", "leads", "view")).toBe(false);
    expect(can("finance", "opportunities", "view")).toBe(true);
  });
  it("prevents admins from managing owners", () => {
    expect(canManageMember("admin", "owner")).toBe(false);
    expect(canManageMember("admin", "rep")).toBe(true);
    expect(canManageMember("manager", "rep")).toBe(false);
  });
  it("redacts deal financials for marketing", () => {
    expect(redact("marketing", "opportunities", { value: "100", name: "x" })).toEqual({ value: null, name: "x" });
    expect(redact("manager", "opportunities", { value: "100" })).toEqual({ value: "100" });
  });
});

describe("validation & data quality", () => {
  it("normalises phones to E.164 using the country", () => {
    expect(normalizePhone("050 123 4567", "United Arab Emirates").value).toBe("+971501234567");
    expect(normalizePhone("07700 900123", "United Kingdom").value).toBe("+447700900123");
    expect(normalizePhone("0091 98200 12345", "India").value).toBe("+919820012345");
    expect(normalizePhone("12", "India").error).toBeTruthy();
  });
  it("requires some identity on a lead and validates email", () => {
    expect(leadSchema.safeParse({}).success).toBe(false);
    expect(leadSchema.safeParse({ email: "bad" }).success).toBe(false);
    expect(leadSchema.safeParse({ company_name: "Acme", tags: "a, b" }).data?.tags).toEqual(["a", "b"]);
  });
  it("neutralises CSV formula injection", () => {
    expect(safeCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(safeCell("+971")).toBe("'+971");
    expect(safeCell(["a", "b"])).toBe("a, b");
    expect(safeCell(null)).toBe("");
  });
  it("auto-maps common import headers", () => {
    const m = suggestMapping(["Full Name", "E-mail", "Mobile Number", "Company Name", "Assigned To", "Lead Source", "Random"]);
    expect(m).toEqual({ "0": "full_name", "1": "email", "2": "phone", "3": "company_name", "4": "owner_email", "5": "source" });
  });
  it("parses bulk user lists with roles, teams and errors", () => {
    const rows = parseBulkUsers("email,name,role\nomar@x.com, Omar Farooq, Sales Rep, Sales\npriya@x.com, Priya\nbad-line, Nobody", "viewer", [{ id: "00000000-0000-4000-8000-000000000001", name: "Sales" }]);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.data).toEqual({ email: "omar@x.com", name: "Omar Farooq", role: "rep", team_id: "00000000-0000-4000-8000-000000000001" });
    expect(rows[1]!.data?.role).toBe("viewer");
    expect(rows[2]!.error).toBeTruthy();
  });
});

describe("next best action & formatting", () => {
  const base = { status: "new", owner_id: "u", score: 50, first_contacted_at: null, first_response_due_at: null, next_follow_up_at: null, phone: "+9715", whatsapp: null, email: null };
  it("asks to assign unowned leads", () => expect(leadNextAction({ ...base, owner_id: null }).title).toMatch(/Assign/));
  it("flags breached SLA", () => expect(leadNextAction({ ...base, first_response_due_at: new Date(Date.now() - 3600_000).toISOString() }).tone).toBe("red"));
  it("suggests conversion for qualified leads", () => expect(leadNextAction({ ...base, status: "qualified", first_contacted_at: new Date().toISOString() }).action).toBe("convert"));
  it("formats money and dates deterministically", () => {
    expect(money(1234567, "AED")).toBe("AED 1,234,567");
    expect(money(180000, "AED", true)).toBe("AED 180K");
    expect(money(2400000, "INR", true)).toBe("₹2.4M");
    expect(fmtDate("2026-09-05")).toBe("05 Sept 2026");
  });
});
