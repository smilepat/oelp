/**
 * @vitest-environment node
 *
 * Vitest — check-dim-coverage.mjs script contract test.
 *
 * Validates the coverage matrix script output structure + production state
 * (D1_Form known to be MISSING per v10 finding until option A' PR lands).
 *
 * Locked-in expectations:
 *   - All 5 dims appear in dimSummary
 *   - D2-D5 have ≥ 2 keyVariables (OK status)
 *   - D1_Form is MISSING (will flip to OK after option A' PR — test will
 *     fail then, prompting documentation update)
 *   - No contradictions on baseline weights (D1 all 0.05 < 0.15 threshold)
 */
import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "check-dim-coverage.mjs");

interface DimSummaryEntry {
  dim: string;
  kvCount: number;
  status: "OK" | "WEAK" | "MISSING";
}
interface CoverageReport {
  totalKeyVariables: number;
  dimSummary: DimSummaryEntry[];
  missingDims: string[];
  weakDims: string[];
  contradictions: Array<{ qtId: string; dim: string; declared: number; reason: string }>;
}

function runScript(args: string[] = []): { stdout: string; status: number } {
  const r = spawnSync("node", [SCRIPT, ...args], { encoding: "utf-8" });
  return { stdout: r.stdout, status: r.status ?? -1 };
}

describe("check-dim-coverage.mjs", () => {
  test("T1: outputs valid JSON with expected structure", () => {
    const { stdout } = runScript();
    const report: CoverageReport = JSON.parse(stdout);
    expect(typeof report.totalKeyVariables).toBe("number");
    expect(Array.isArray(report.dimSummary)).toBe(true);
    expect(report.dimSummary.length).toBe(5);
    expect(Array.isArray(report.missingDims)).toBe(true);
    expect(Array.isArray(report.contradictions)).toBe(true);
  });

  test("T2: all 5 dims appear in dimSummary", () => {
    const { stdout } = runScript();
    const report: CoverageReport = JSON.parse(stdout);
    const dims = report.dimSummary.map((s) => s.dim).sort();
    expect(dims).toEqual([
      "D1_Form",
      "D2_Meaning",
      "D3_Context",
      "D4_Network",
      "D5_Usage",
    ]);
  });

  test("T3: production D2-D5 all OK (≥ 2 keyVariables)", () => {
    const { stdout } = runScript();
    const report: CoverageReport = JSON.parse(stdout);
    const okDims = ["D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];
    for (const d of okDims) {
      const entry = report.dimSummary.find((s) => s.dim === d);
      expect(entry?.status).toBe("OK");
      expect(entry?.kvCount ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  test("T4: D1_Form is MISSING (production state, v10 finding)", () => {
    // This test serves as a sentinel. When option A' PR lands with
    // form-related keyVariables, this assertion flips and reminds us to
    // update related docs (CLAUDE.md §10, dim-mapping.md, this test).
    const { stdout } = runScript();
    const report: CoverageReport = JSON.parse(stdout);
    expect(report.missingDims).toContain("D1_Form");
    const d1 = report.dimSummary.find((s) => s.dim === "D1_Form");
    expect(d1?.kvCount).toBe(0);
  });

  test("T5: no contradictions on baseline (D1 all 0.05 < 0.15 threshold)", () => {
    const { stdout } = runScript();
    const report: CoverageReport = JSON.parse(stdout);
    expect(report.contradictions).toEqual([]);
  });

  test("T6: exit code reflects missing dim (1) on production", () => {
    const { status } = runScript();
    // Exit 1: missingDims > 0 (D1_Form not covered yet)
    expect(status).toBe(1);
  });

  test("T7: --verbose includes dim detail", () => {
    const { stdout } = runScript(["--verbose"]);
    const report = JSON.parse(stdout) as CoverageReport & {
      dimDetail?: Record<string, string[]>;
    };
    expect(report.dimDetail).toBeDefined();
    expect(report.dimDetail?.D1_Form).toEqual([]);
    expect(Array.isArray(report.dimDetail?.D3_Context)).toBe(true);
    expect((report.dimDetail?.D3_Context ?? []).length).toBeGreaterThan(0);
  });
});
