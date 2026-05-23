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
      // Baseline frozen 2026-05-23 (A7 ratchet) at current snapshot - 3pp.
      // A6 initial: 75/65/75/75. A7 added leitner+session-export tests
      // → boost to 80/70/80/80. Next ratchet candidate: ontology.ts (30%),
      // diagnostic.ts (48%), queue.ts (51%), error-log.ts (46% — global
      // handlers untestable without window event simulation).
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
