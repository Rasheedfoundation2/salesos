import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("core pages work on a phone", async ({ page }) => {
  await login(page, "omar@digifalx.com");
  await expect(page.getByRole("heading", { name: /Omar/ })).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await expect(page).toHaveURL(/\/leads/);
  await page.getByRole("link", { name: /Mohammed Al Hashimi/ }).click();
  await expect(page.getByRole("button", { name: "Log call" })).toBeVisible();
});
