import { expect, test } from "@playwright/test";

// Hello-world gate for Phase 1: the static export serves the app shell and
// the PRD routes exist. Deeper flows land with their phases.
test("first-run landing shows the product intro", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Walk & Plot" })).toBeVisible();
  await expect(page.getByText("Walk. Map. Export.")).toBeVisible();
  await expect(page.getByText("Walk the space", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create Your First Project" })).toBeVisible();
});

// PRD 24 / AC-11: the landing must fit 320px width with no horizontal scroll.
test("landing has no horizontal scroll at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 690 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("new project route exists", async ({ page }) => {
  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible();
});

test("settings route exists", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

// PRD 24 / AC-11: the complete workflow must fit 320px with no horizontal
// scroll. Sweep the Phase 2 screens and the mapping workspace.
test("project and workspace screens fit 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 690 });
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

  await page.goto("/");
  await page.getByRole("link", { name: "Create Your First Project" }).click();
  expect(await overflow()).toBe(0);

  await page.getByLabel("Building name").fill("Narrow Tower");
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page).toHaveURL(/\/projects\/view\?id=/);
  expect(await overflow()).toBe(0);

  await page.getByRole("link", { name: /Ground/ }).click();
  await expect(page).toHaveURL(/\/projects\/map\?id=/);
  await expect(page.getByRole("button", { name: "Trace Path" })).toBeVisible();
  expect(await overflow()).toBe(0);

  await page.goto("/settings");
  expect(await overflow()).toBe(0);
});

// PRD 24/38 Phase 9: the complete workflow fits every phone width with no
// horizontal scroll (AC-11).
const PHONE_WIDTHS = [320, 360, 375, 390, 412, 430];

test.describe("breakpoint sweep", () => {
  for (const width of PHONE_WIDTHS) {
    test(`all screens fit ${width}px without horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 690 });
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );

      await page.goto("/");
      expect(await overflow()).toBe(0);
      await page.goto("/projects/new");
      expect(await overflow()).toBe(0);
      await page.goto("/settings");
      expect(await overflow()).toBe(0);

      // Create a project to reach the overview and workspace.
      await page.goto("/projects/new");
      await page.getByLabel("Building name").fill(`Sweep ${width}`);
      await page.getByRole("button", { name: "Create Project" }).click();
      await expect(page).toHaveURL(/\/projects\/view\?id=/);
      expect(await overflow()).toBe(0);

      await page.getByRole("link", { name: /Ground/ }).click();
      await expect(page).toHaveURL(/\/projects\/map\?id=/);
      await expect(page.getByRole("button", { name: "Trace Path" })).toBeVisible();
      expect(await overflow()).toBe(0);
    });
  }
});

// PRD 25 / AC-12: desktop views and edits everything but is not offered the
// mobile capture tools.
test("desktop hides capture tools and offers editing", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("link", { name: "Create Your First Project" }).click();
  await page.getByLabel("Building name").fill("Desktop Tower");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByRole("link", { name: /Ground/ }).click();
  await expect(page).toHaveURL(/\/projects\/map\?id=/);

  await expect(page.getByText("Capture is designed for mobile")).toBeVisible();
  await expect(page.getByRole("button", { name: "Trace Path" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
  // Editing affordances remain: undo/redo and zoom controls.
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
});

// PRD 24/35: dark theme applies through the boot script + system preference.
test("dark theme applies from the OS preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Walk & Plot" })).toBeVisible();
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  expect(isDark).toBe(true);
});
