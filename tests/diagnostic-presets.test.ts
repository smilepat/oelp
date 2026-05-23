/**
 * Vitest — diagnostic-presets (L4 follow-up from dogfooding-pass-2).
 *
 * Verifies:
 *  T1: All 4 presets satisfy DiagnosticInput schema.
 *  T2: Presets cover varied dimensionScores (rank > 1 across all 4).
 *  T3: getPresetById round-trip.
 *  T4: weakDim/strongDim agree with dimensionScores ranking.
 */
import { describe, test, expect } from "vitest";
import { isDiagnosticInput } from "@/lib/diagnostic";
import { DIAGNOSTIC_PRESETS, getPresetById } from "@/lib/diagnostic-presets";

describe("diagnostic-presets (L4)", () => {
  test("T1: All presets satisfy DiagnosticInput schema", () => {
    for (const p of DIAGNOSTIC_PRESETS) {
      expect(isDiagnosticInput(p.diagnostic)).toBe(true);
    }
  });

  test("T2: Presets span > 1 unique dimensionScores point", () => {
    const unique = new Set(
      DIAGNOSTIC_PRESETS.map((p) => JSON.stringify(p.diagnostic.dimensionScores))
    );
    expect(unique.size).toBe(DIAGNOSTIC_PRESETS.length);
    expect(unique.size).toBeGreaterThan(1);
  });

  test("T3: getPresetById round-trip", () => {
    for (const p of DIAGNOSTIC_PRESETS) {
      const found = getPresetById(p.id);
      expect(found).toBeDefined();
      expect(found?.diagnostic.studentName).toBe(p.diagnostic.studentName);
    }
    expect(getPresetById("alpha" as const)).toBeDefined();
    // @ts-expect-error — invalid id by design
    expect(getPresetById("zeta")).toBeUndefined();
  });

  test("T4: weakDim entries score below strongDim entries", () => {
    for (const p of DIAGNOSTIC_PRESETS) {
      const ds = p.diagnostic.dimensionScores;
      for (const w of p.diagnostic.weakDim) {
        for (const s of p.diagnostic.strongDim) {
          const wScore = ds[w] ?? 0;
          const sScore = ds[s] ?? 0;
          expect(wScore).toBeLessThan(sScore);
        }
      }
    }
  });

  test("T5: All 5 dimensions present with score 0-100", () => {
    const dims = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"] as const;
    for (const p of DIAGNOSTIC_PRESETS) {
      const ds = p.diagnostic.dimensionScores;
      for (const d of dims) {
        const score = ds[d];
        expect(score).toBeDefined();
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });
});
