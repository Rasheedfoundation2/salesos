import { expect, type Page } from "@playwright/test";
export const PW = process.env.SEED_PASSWORD ?? "DigiFalx@2026";
export async function login(page: Page, email: string, password = PW) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
export const uniq = () => Math.random().toString(36).slice(2, 8);
