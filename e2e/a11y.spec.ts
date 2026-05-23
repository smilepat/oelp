/**
 * Playwright + axe-core — A11y baseline scan (T4.1).
 *
 * Scans all 6 user routes for WCAG 2.1 AA violations. Filters by impact
 * "serious" or "critical" — minor/moderate issues are surfaced in the
 * report but don't fail CI yet (avoid baseline shock).
 *
 * Run locally: `npx playwright test`
 * Run in CI:   PLAYWRIGHT_BASE_URL=... npx playwright test (uses webServer)
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/diagnose", name: "diagnose" },
  { path: "/map", name: "map" },
  { path: "/queue", name: "queue" },
  { path: "/sessions", name: "sessions" },
  { path: "/regression-history", name: "regression-history" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 375, height: 667 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`A11y · ${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`${route.name} (${route.path})`, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState("networkidle");

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        const criticalSerious = results.violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious"
        );

        if (criticalSerious.length > 0) {
          console.error(
            `[${viewport.name}/${route.name}] ${criticalSerious.length} critical/serious violation(s):`
          );
          for (const v of criticalSerious) {
            console.error(`  - ${v.id} (${v.impact}): ${v.help}`);
            console.error(`    Nodes: ${v.nodes.length}`);
            v.nodes.slice(0, 3).forEach((n) => {
              console.error(`      ${n.target.join(" → ")}`);
            });
          }
        }

        const minor = results.violations.filter(
          (v) => v.impact === "minor" || v.impact === "moderate"
        );
        if (minor.length > 0) {
          console.log(`[${viewport.name}/${route.name}] ${minor.length} minor/moderate (non-blocking)`);
        }

        expect(criticalSerious).toEqual([]);
      });
    }
  });
}
