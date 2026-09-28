import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// PRD 35/37: axe checks on the primary screens - zero critical violations.

async function scan(page: Page, impact: "critical" | "serious" = "critical") {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => v.impact === impact);
}

test("projects screens pass axe with no critical violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Create Your First Project" })).toBeVisible();
  expect(await scan(page)).toEqual([]);

  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible();
  expect(await scan(page)).toEqual([]);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("dashboard and workspace pass axe with no critical violations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Create Your First Project" }).click();
  await page.getByLabel("Building name").fill("Axe Tower");
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page).toHaveURL(/\/projects\/view\?id=/);
  expect(await scan(page)).toEqual([]);

  await page.getByRole("link", { name: /Ground/ }).click();
  await expect(page).toHaveURL(/\/projects\/map\?id=/);
  await expect(page.getByRole("button", { name: "Trace Path" })).toBeVisible();
  expect(await scan(page)).toEqual([]);

  // Detail sheet open (PRD 35 includes sheets).
  await page.getByRole("button", { name: "Add Place" }).click();
  await page.getByRole("button", { name: "Toilet" }).click();
  await page.locator(".konvajs-content").click({ position: { x: 200, y: 350 } });
  await expect(page.getByText("Toilet - details")).toBeVisible();
  expect(await scan(page)).toEqual([]);
});
