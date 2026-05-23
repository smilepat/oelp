import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — A11y e2e tests (T4.1).
 * Separate from Vitest unit tests. Run with: `npx playwright test`.
 *
 * Currently used only for axe-core accessibility scans. CI invocation
 * requires a running dev server; locally use webServer block below.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.CI
    ? {
        // pr-check.yml runs `npm run build` before this step, so just start.
        command: "npx next start -p 3001",
        url: "http://localhost:3001",
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});
