/**
 * Vitest — README counter freshness (T2.1).
 *
 * Asserts that README.md counters match the live codebase. Same logic as
 * scripts/update-readme-counters.mjs --check, but run inside the unit
 * test suite so local devs see drift before pushing.
 *
 * To fix drift: run `node scripts/update-readme-counters.mjs`.
 */
import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

describe("README counters freshness (T2.1)", () => {
  test("update-readme-counters.mjs --check exits 0", () => {
    const script = join(process.cwd(), "scripts", "update-readme-counters.mjs");
    const result = spawnSync(process.execPath, [script, "--check"], {
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      console.error("README out of date:\n" + result.stderr);
    }
    expect(result.status).toBe(0);
  });
});
