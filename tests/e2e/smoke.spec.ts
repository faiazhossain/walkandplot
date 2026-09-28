import { expect, test } from "@playwright/test";

// Hello-world gate for Phase 1: the static export serves the app shell and
// the PRD routes exist. Deeper flows land with their phases.
test("projects home shows the shell and empty state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My Projects" })).toBeVisible();
  await expect(page.getByText("No projects yet")).toBeVisible();
});

test("new project route exists", async ({ page }) => {
  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: "New Project" })).toBeVisible();
});

test("settings route exists", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
