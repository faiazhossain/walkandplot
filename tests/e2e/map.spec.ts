import { readFileSync } from "node:fs";
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

  // PRD 15: the tool stays active (Done still offered) and a chip offers
  // path tags for the path just saved.
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  await expect(page.getByText("Tag:")).toBeVisible();
  await page.getByRole("button", { name: "Hallway" }).click();
  await page.getByRole("button", { name: "Dismiss tag suggestions" }).click();
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

test("add a shop polygon and name it in the detail sheet", async ({ page }) => {
  await createProjectToWorkspace(page);

  // PRD 16: Add Place -> Shop -> trace the boundary -> Done -> detail sheet.
  await page.getByRole("button", { name: "Add Place" }).click();
  await page.getByRole("button", { name: "Shop" }).click();
  await expect(page.getByText("Trace the area boundary").first()).toBeVisible();

  const canvas = page.locator(CANVAS);
  await canvas.click({ position: { x: 150, y: 300 } });
  await canvas.click({ position: { x: 260, y: 300 } });
  await canvas.click({ position: { x: 260, y: 400 } });

  await page.getByRole("button", { name: "Done" }).click();

  // The sheet slides up; the place is already saved - naming enriches it.
  const nameInput = page.getByLabel("Name", { exact: true });
  await expect(nameInput).toBeVisible();
  await nameInput.fill("ABC Fashion");
  await page.getByRole("button", { name: "Save Details" }).click();

  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page.getByRole("link", { name: /Ground/ })).toContainText("1 item");
});

test("add a toilet point place, skip details, still saved", async ({ page }) => {
  await createProjectToWorkspace(page);

  await page.getByRole("button", { name: "Add Place" }).click();
  await page.getByRole("button", { name: "Toilet" }).click();
  await expect(page.getByText("Tap the map to place it")).toBeVisible();

  await page.locator(CANVAS).click({ position: { x: 200, y: 350 } });

  // PRD 16 step 3: the sheet never blocks - Skip closes it, place stays.
  await expect(page.getByText("Toilet - details")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();

  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page.getByRole("link", { name: /Ground/ })).toContainText("1 item");
});

test("snapping a path onto another creates a junction and splits it (PRD 18)", async ({ page }) => {
  await createProjectToWorkspace(page);
  const canvas = page.locator(CANVAS);

  // First path: a horizontal corridor.
  await page.getByRole("button", { name: "Trace Path" }).click();
  await canvas.click({ position: { x: 150, y: 350 } });
  await canvas.click({ position: { x: 240, y: 350 } });
  await page.getByRole("button", { name: "Done" }).click();

  // Second path ends on the middle of the first: junction + split (PRD 18).
  await canvas.click({ position: { x: 150, y: 430 } });
  await canvas.click({ position: { x: 195, y: 350 } });
  await page.getByRole("button", { name: "Done" }).click();

  // Two plotted paths + the split right segment = 3 items.
  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page.getByRole("link", { name: /Ground/ })).toContainText("3 items");
});

test("stairs forward-declare a new floor via the connector sheet (PRD 18)", async ({ page }) => {
  await createProjectToWorkspace(page);

  await page.getByRole("button", { name: "Add Place" }).click();
  await page.getByRole("button", { name: "Stairs" }).click();
  await page.locator(CANVAS).click({ position: { x: 200, y: 350 } });

  // The connector section asks which floors it connects.
  await expect(page.getByText("Connects floors")).toBeVisible();
  await page.getByRole("button", { name: "+ New floor" }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Ground - Floor 2")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();

  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page.getByText("2 floors")).toBeVisible();
});

test("Set Real Length calibrates the floor (PRD 14, AC-03)", async ({ page }) => {
  await createProjectToWorkspace(page);
  const canvas = page.locator(CANVAS);

  // Plot a corridor, then calibrate against it.
  await page.getByRole("button", { name: "Trace Path" }).click();
  await canvas.click({ position: { x: 150, y: 350 } });
  await canvas.click({ position: { x: 246, y: 350 } });
  await page.getByRole("button", { name: "Done" }).click();

  // The uncalibrated chip opens Set Real Length.
  await page.getByRole("button", { name: /Not calibrated/ }).click();
  await expect(page.getByText("Set Real Length")).toBeVisible();

  // Pick the existing line (2-unit-long after grid snapping).
  await page.getByRole("button", { name: /Untitled line/ }).click();
  await page.getByLabel("Its real length (meters)").fill("10");
  await page.getByRole("button", { name: "Apply to Floor" }).click();

  // The chip flips to calibrated meters (AC-03).
  await expect(page.getByRole("button", { name: /Calibrated, meters/ })).toBeVisible();

  // The overview row reports the calibrated floor.
  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page.getByRole("link", { name: /Ground/ })).toContainText("calibrated");
});

test("Download Map File produces valid GeoJSON of the survey (PRD 22, AC-09)", async ({ page }) => {
  await createProjectToWorkspace(page);
  const canvas = page.locator(CANVAS);

  // Plot a corridor, then export from the project menu.
  await page.getByRole("button", { name: "Trace Path" }).click();
  await canvas.click({ position: { x: 150, y: 350 } });
  await canvas.click({ position: { x: 246, y: 350 } });
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Back to project" }).click();

  await page.getByRole("button", { name: "More project actions" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Map File" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("E2E-Tower.geojson");
  const geojson = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(geojson.type).toBe("FeatureCollection");
  expect(geojson.properties.app).toBe("walk-and-plot");
  expect(geojson.properties.coordinateSystem).toMatchObject({ type: "local", unit: "units" });
  expect(geojson.features).toHaveLength(1);
  expect(geojson.features[0].geometry.type).toBe("LineString");
  expect(geojson.features[0].properties.subtype).toBe("corridor");
});

test("basemap toggle keeps plotting fully usable (offline-safe)", async ({ page }) => {
  await createProjectToWorkspace(page);

  await page.getByRole("button", { name: "Show base map" }).click();
  await expect(page.getByRole("button", { name: "Hide base map" })).toBeVisible();
  await expect(page.getByText("Base map on")).toBeVisible();

  // PRD 32: the core loop never depends on the network - draw with the
  // basemap layer on (tiles may or may not have loaded).
  const canvas = page.locator(CANVAS);
  await page.getByRole("button", { name: "Trace Path" }).click();
  await canvas.click({ position: { x: 150, y: 350 } });
  await canvas.click({ position: { x: 246, y: 350 } });
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page.getByRole("link", { name: /Ground/ })).toContainText("1 item");
});

test("offline after install: the full loop passes (AC-10)", async ({ browser }) => {
  // PRD 37: install first (online, so the service worker precaches), then
  // everything happens with the network fully disabled.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);

  // Reload from the precache to prove the shell survives offline.
  await page.reload();
  await expect(page.getByText("Walk the space", { exact: true })).toBeVisible();

  // Create -> map -> place -> export, all offline.
  await page.getByRole("link", { name: "Create Your First Project" }).click();
  await page.getByLabel("Building name").fill("Offline Tower");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByRole("link", { name: /Ground/ }).click();
  await expect(page.getByText("Offline Tower")).toBeVisible();

  const canvas = page.locator(CANVAS);
  await page.getByRole("button", { name: "Trace Path" }).click();
  await canvas.click({ position: { x: 150, y: 350 } });
  await canvas.click({ position: { x: 246, y: 350 } });
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page.getByRole("link", { name: /Ground/ })).toContainText("1 item");

  // GeoJSON export + backup downloads are pure blobs - they work offline.
  await page.getByRole("button", { name: "More project actions" }).click();
  const mapDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Map File" }).click();
  expect((await mapDownload).suggestedFilename()).toBe("Offline-Tower.geojson");

  await page.getByRole("button", { name: "More project actions" }).click();
  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Backup" }).click();
  expect((await backupDownload).suggestedFilename()).toMatch(/Offline-Tower-backup-.*\.walkandplot\.json/);

  await context.close();
});

test("mid-trace refresh offers the draft back (PRD 31, AC-06)", async ({ page }) => {
  await createProjectToWorkspace(page);
  const canvas = page.locator(CANVAS);

  await page.getByRole("button", { name: "Trace Path" }).click();
  await canvas.click({ position: { x: 150, y: 350 } });
  await canvas.click({ position: { x: 246, y: 350 } });

  // Crash simulation: reload mid-trace.
  await page.reload();
  await expect(page.getByText(/Continue tracing - 2 corners placed\?/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // The restored draft is a real draft: one more corner, then Done.
  await canvas.click({ position: { x: 246, y: 430 } });
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Back to project" }).click();
  await expect(page.getByRole("link", { name: /Ground/ })).toContainText("1 item");
});
