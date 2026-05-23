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
      //   A6 initial:                                 75 / 65 / 75 / 75
      //   A7 (+ leitner + session-export):            80 / 70 / 80 / 80
      //   A7+ Phase 2 (+ ontology + diag + queue-v1): 88 / 75 / 90 / 85
      //   A7++ (+ error-log globals + reco-store):    93 / 80 / 95 / 90
      // Current snapshot: 95.12 / 82.37 / 97.24 / 92.26
      // Remaining gaps: ontology.ts (149-200 cytoscape canvas paths),
      // recommendation-store.ts L149-150 (corner branch), queue.ts V3 chain
      // generator paths (acceptable — exercised by integration only).
      thresholds: {
        lines: 93,
        functions: 95,
        branches: 80,
        statements: 90,
      },
    },
  },
});
