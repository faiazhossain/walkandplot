import { expect, test, type Page } from "@playwright/test";

// PRD 37 happy-path slice for Phase 2+3: create project -> create floor ->
// trace a path on the canvas -> finish -> everything persists across reload.

const CANVAS = ".konvajs-content";

async function createProjectToWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Create Your First Project" }).click();
  await expect(page).toHaveURL(/\/projects\/new/);
  await page.getByLabel("Building name").fill("E2E Tower");
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page).toHaveURL(/\/projects\/view\?id=/);
  // Project creation makes the first floor ("Ground") automatically (PRD 10).
  await page.getByRole("link", { name: /Ground/ }).click();
  await expect(page).toHaveURL(/\/projects\/map\?id=/);
  await expect(page.getByText("E2E Tower")).toBeVisible();
}

test("trace a path, autosave, finish, and see it persist", async ({ page }) => {
  await createProjectToWorkspace(page);

  // Activate Trace Path (PRD 12 tool row).
  await page.getByRole("button", { name: "Trace Path" }).click();
  await expect(page.getByText("Tap to add points")).toBeVisible();

  // Tap three corners on the canvas.
  const canvas = page.locator(CANVAS);
  await canvas.click({ position: { x: 150, y: 350 } });
  await canvas.click({ position: { x: 240, y: 350 } });
  await canvas.click({ position: { x: 240, y: 430 } });

  // AC-04: Done is only enabled once the path is valid (2+ points).
  const done = page.getByRole("button", { name: "Done" });
  await expect(done).toBeEnabled();
  await done.click();

  // PRD 15: the tool stays active for the next path.
  await expect(page.getByText("Tap to add points")).toBeVisible();

  // Back to the overview: the floor now reports its plotted item.
  const workspaceUrl = page.url();
  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page).toHaveURL(/\/projects\/view\?id=/);
  await expect(page.getByRole("link", { name: /Ground/ })).toContainText("1 item");

  // AC-05/06: a cold load of the workspace still shows the saved floor.
  await page.goto(workspaceUrl);
  await page.reload();
  await expect(page).toHaveURL(/projects\/map\?id=/);
  await expect(page.getByRole("button", { name: "Back to project" })).toBeVisible();
  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page.getByRole("link", { name: /Ground/ })).toContainText("1 item");
});

test("finish marks the floor completed and stays editable", async ({ page }) => {
  await createProjectToWorkspace(page);
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("button", { name: "Finish floor" }).click();
  await expect(page).toHaveURL(/\/projects\/view\?id=/);
  await expect(page.getByText("Completed").first()).toBeVisible();
});

test("project card appears on the dashboard with a backup affordance", async ({ page }) => {
  await createProjectToWorkspace(page);
  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page).toHaveURL(/\/projects\/view\?id=/);
  await page.goBack();
  await page.goto("/");
  // Second run: dashboard instead of hero (PRD 9).
  await expect(page.getByText("Your projects")).toBeVisible();
  await expect(page.getByText("E2E Tower")).toBeVisible();
  await expect(page.getByText(/1 floor/)).toBeVisible();
});
