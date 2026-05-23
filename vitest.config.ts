import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/**/*.d.ts",
        "lib/**/*.json",
        // Generated module — large constant array, not unit-testable
        "lib/vocabulary-pool.ts",
      ],
      // Modest baseline — tighten as suite grows. Failure here is a STRICT
      // gate (CI red), so set realistic numbers, not aspirational.
      // Baseline ratchet history (2026-05-23 single sprint):
      //   A6 initial:    75 / 65 / 75 / 75  (lines/branches/funcs/stmts)
      //   A7 (+ leitner + session-export):       80 / 70 / 80 / 80
      //   A7+ Phase 2 (+ ontology + diagnostic + queue-v1):  88 / 75 / 90 / 85
      // Current snapshot: 91.4 / 78.26 / 93.79 / 88.83
      // Next targets if pushing further: error-log global handlers (46%
      // — window events hard to mock), recommendation-store.ts drift logic.
      thresholds: {
        lines: 88,
        functions: 90,
        branches: 75,
        statements: 85,
      },
    },
  },
});
