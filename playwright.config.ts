import { defineConfig } from "@playwright/test";

// PRD 37: E2E runs against the real static export served locally, at the
// mobile viewport the PRD requires (320x690 minimum; 390x844 primary here).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  },
  webServer: {
    command: "npm run build && npx serve out -l 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
