import { expect, test } from "@playwright/test";
import { login, PW, uniq } from "./helpers";

test.describe("authentication", () => {
  test("rejects a wrong password and signs in / out", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login\?next=%2Fhome/);
    await page.fill("#email", "omar@digifalx.com"); await page.fill("#password", "wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password." })).toBeVisible();
    await expect(page.locator("#email")).toHaveValue("omar@digifalx.com");
    await page.fill("#password", PW); await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByRole("heading", { name: /Omar/ })).toBeVisible();
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("registers a new organisation", async ({ page }) => {
    const u = uniq();
    await page.goto("/register");
    await page.fill("#orgName", `E2E Org ${u}`); await page.fill("#name", "E2E Owner"); await page.fill("#email", `e2e-${u}@example.test`); await page.fill("#password", "StrongPass123");
    await page.getByRole("button", { name: "Create organisation" }).click();
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText(/Welcome to SalesOS/)).toBeVisible();
  });
});

test.describe("lead journey", () => {
  test("create lead → duplicate warning → log call → convert → opportunity", async ({ page }) => {
    const u = uniq();
    await login(page, "aisha@digifalx.com");
    await page.goto("/leads?create=1");
    const dlg = page.getByRole("dialog");
    await dlg.locator("#first_name").fill("Test"); await dlg.locator("#last_name").fill(`Buyer ${u}`);
    await dlg.locator("#company_name").fill(`E2E Co ${u}`); await dlg.locator("#email").fill(`buyer-${u}@e2e.test`); await dlg.locator("#phone").fill(`+97150${Math.floor(1000000 + Math.random() * 8999999)}`);
    await dlg.locator("#country").selectOption("United Arab Emirates");
    await dlg.getByRole("button", { name: "Create lead" }).click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: new RegExp(`Test Buyer ${u}`) })).toBeVisible();
    const leadUrl = page.url();

    // duplicate check
    await page.goto("/leads?create=1");
    await page.getByRole("dialog").locator("#first_name").fill("Again");
    await page.getByRole("dialog").locator("#email").fill(`buyer-${u}@e2e.test`);
    await page.getByRole("dialog").getByRole("button", { name: "Create lead" }).click();
    await expect(page.getByText("Possible duplicates found")).toBeVisible();
    await page.keyboard.press("Escape");

    // log a call
    await page.goto(leadUrl);
    await page.getByRole("button", { name: "Log call" }).click();
    const act = page.getByRole("dialog");
    await act.locator("#subject").fill("Discovery call");
    await act.locator("#outcome").fill("Connected — interested");
    await act.getByRole("button", { name: "Log activity" }).click();
    await expect(act).toBeHidden();
    await page.getByRole("tab", { name: /Activities/ }).click();
    await expect(page.getByText("Discovery call")).toBeVisible();

    // convert
    await page.getByRole("button", { name: "Convert" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Convert" }).click();
    await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]{36}/);
    await expect(page.getByText(`E2E Co ${u}`).first()).toBeVisible();
  });

  test("inline edit persists after refresh and is audited", async ({ page }) => {
    await login(page, "rasheed@digifalx.com");
    await page.goto("/leads?q=Noura");
    await page.getByRole("link", { name: "Noura Al Ketbi" }).click();
    await page.getByRole("button", { name: "Edit City" }).click();
    const v = `Al Ain ${uniq()}`;
    await page.getByRole("textbox", { name: "City" }).fill(v);
    await page.keyboard.press("Enter");
    await expect(page.getByText("City saved")).toBeVisible();
    await page.reload();
    await expect(page.getByText(v).first()).toBeVisible();
    await page.getByRole("tab", { name: "Audit history" }).click();
    await expect(page.getByText(v).first()).toBeVisible();
  });
});

test.describe("pipeline rules", () => {
  test("closing as lost requires a reason; required fields are requested", async ({ page }) => {
    await login(page, "aisha@digifalx.com");
    await page.goto("/opportunities?q=Falcon");
    await page.getByRole("link", { name: /Falcon Logistics — CRM/ }).click();
    await page.getByRole("listitem").filter({ hasText: "Closed Lost" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByText("A lost reason is required")).toBeVisible();
    await dlg.getByRole("button", { name: "Mark as lost" }).click();
    await expect(page.getByText(/lost reason is required/i).first()).toBeVisible();
    await dlg.getByRole("combobox").first().selectOption("Timing");
    await dlg.getByRole("button", { name: "Mark as lost" }).click();
    await expect(page.getByText("Lost reason:")).toBeVisible();
    // reopen (manager) back to Qualified
    await page.getByRole("listitem").filter({ hasText: /^Qualified$/ }).click();
    await expect(page.getByText("Qualified · 25%")).toBeVisible();
  });

  test("kanban renders stages with totals", async ({ page }) => {
    await login(page, "rasheed@digifalx.com");
    await page.goto("/pipeline");
    await expect(page.getByRole("region", { name: "Negotiation stage" })).toContainText("Palm Crest");
  });
});

test.describe("permissions & tenant isolation", () => {
  test("sales reps see only their own leads and no admin areas", async ({ page }) => {
    await login(page, "omar@digifalx.com");
    await page.goto("/leads");
    const owners = await page.locator("tbody tr td:nth-child(6)").allInnerTexts();
    expect(owners.length).toBeGreaterThan(0);
    expect(owners.every((o) => o.includes("Omar Farooq"))).toBe(true);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByText("You don’t have access to this page")).toBeVisible();
  });

  test("another organisation cannot open DigiFalx records", async ({ page }) => {
    await login(page, "rasheed@digifalx.com");
    await page.goto("/leads?q=Mohammed");
    await page.getByRole("link", { name: "Mohammed Al Hashimi" }).click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}/);
    const url = page.url();
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await login(page, "admin@acmerealty.test");
    await page.goto(url);
    await expect(page.getByText("Record not found")).toBeVisible();
    await page.goto("/leads");
    await expect(page.getByText("Mohammed Al Hashimi")).toHaveCount(0);
    await expect(page.getByText("Confidential Acme Prospect")).toBeVisible();
  });

  test("API rejects requests without a key", async ({ request }) => {
    const r = await request.post("/api/v1/leads", { data: { full_name: "x" } });
    expect(r.status()).toBe(401);
    expect((await r.json()).error.code).toBe("unauthenticated");
  });
});

test.describe("admin adds multiple users", () => {
  test("bulk-creates agents who must set their own password at first sign-in", async ({ page, browser }) => {
    const u = uniq();
    await login(page, "rasheed@digifalx.com");
    await page.goto("/team");
    await page.getByRole("button", { name: "Add users" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: "Paste a list / CSV" }).click();
    await dlg.getByRole("textbox").fill(`agent-a-${u}@e2e.test, Agent Alpha, Sales Rep, Sales\nagent-b-${u}@e2e.test, Agent Beta\nnot-an-email`);
    await dlg.getByRole("button", { name: "Check list" }).click();
    await expect(dlg.getByText(/Line 3:/)).toBeVisible();
    await dlg.getByRole("button", { name: "Create accounts", exact: true }).click();
    await expect(dlg.getByText(/2<\/b>|2 user\(s\) added/).first()).toBeVisible();
    const creds = await dlg.getByRole("textbox", { name: "Credentials" }).inputValue();
    const pw = creds.split("\n")[0]!.match(/temporary password: (\S+)/)![1]!;
    await dlg.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText(`agent-a-${u}@e2e.test`)).toBeVisible();

    const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
    await login(p2, `agent-a-${u}@e2e.test`, pw);
    await expect(p2.getByText("Choose your own password to continue")).toBeVisible();
    await p2.fill("#password", "MyOwnPass123"); await p2.fill("#confirm", "MyOwnPass123");
    await p2.getByRole("button", { name: "Save and continue" }).click();
    await expect(p2.getByRole("heading", { name: /Agent/ })).toBeVisible();
    await ctx2.close();
  });
});

test.describe("import", () => {
  test("uploads a CSV, validates, imports with round robin and can undo", async ({ page }) => {
    const u = uniq(); const base = Math.floor(1000000 + Math.random() * 8000000);
    await login(page, "aisha@digifalx.com");
    await page.goto("/leads/import");
    await page.waitForLoadState("networkidle"); // ensure the uploader is hydrated
    const csv = ["Name,Email,Mobile,Company,Country", ...Array.from({ length: 4 }, (_, i) => `Import ${u} ${i},imp-${u}-${i}@e2e.test,+97155${String(base + i)},Imp ${u},United Arab Emirates`), `Broken ${u},broken-email,,,`].join("\n");
    await page.getByLabel("Upload file").setInputFiles({ name: `e2e-${u}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByText("5 data rows detected")).toBeVisible();
    await page.getByRole("button", { name: "Validate" }).click();
    await expect(page.getByText("4 will be created")).toBeVisible();
    await page.getByRole("button", { name: /Import 5 rows/ }).click();
    await expect(page.getByText("Import complete")).toBeVisible();
    const assigned = await page.getByText(/^Assigned:/).innerText();
    const counts = [...assigned.matchAll(/\((\d+)\)/g)].map((m) => Number(m[1]));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1); // even round-robin spread
    await page.getByRole("button", { name: "Import another file" }).click();
    await page.getByRole("button", { name: "Undo" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Undo import" }).click();
    await expect(page.getByText("Undone").first()).toBeVisible();
  });
});
