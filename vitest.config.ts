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
      // Baseline frozen 2026-05-23 at current snapshot - 1pp tolerance.
      // Each PR can only ratchet up, never down. Tighten in future PRs as
      // un-tested modules (leitner.ts 0%, session-export 25%) get covered.
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 65,
        statements: 75,
      },
    },
  },
});
