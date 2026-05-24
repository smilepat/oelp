/**
 * Vitest — AdaptiveDiagnosticStats math helpers (A8 stats widget).
 *
 * Component is a UI shell over `mean` and `sampleSd`. These tests cover
 * the math layer; the rendering is covered by e2e A11y on /diagnose.
 */
import { describe, test, expect } from "vitest";
import { mean, sampleSd } from "@/components/AdaptiveDiagnosticStats";

describe("AdaptiveDiagnosticStats math (A8)", () => {
  test("mean: empty array → 0", () => {
    expect(mean([])).toBe(0);
  });

  test("mean: single value", () => {
    expect(mean([1.5])).toBe(1.5);
  });

  test("mean: averaged correctly", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  test("sampleSd: < 2 values → 0", () => {
    expect(sampleSd([])).toBe(0);
    expect(sampleSd([2.5])).toBe(0);
  });

  test("sampleSd: known sample std deviation", () => {
    // Sample SD of [2, 4, 4, 4, 5, 5, 7, 9] is sqrt(32/7) ≈ 2.138
    const sd = sampleSd([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(sd).toBeCloseTo(2.138, 2);
  });

  test("sampleSd: zero variance → 0", () => {
    expect(sampleSd([3, 3, 3, 3])).toBe(0);
  });

  test("sampleSd: KR1.1 stability — ≤ 0.3 for stable θ runs", () => {
    // θ: 0.5, 0.6, 0.55, 0.52, 0.48 → sd ≈ 0.045 (stable learner)
    expect(sampleSd([0.5, 0.6, 0.55, 0.52, 0.48])).toBeLessThan(0.3);
  });

  test("sampleSd: noisy θ runs exceed 0.3", () => {
    // θ: -1, 0.5, 1.8, -0.3, 2 → sd > 0.3
    expect(sampleSd([-1, 0.5, 1.8, -0.3, 2])).toBeGreaterThan(0.3);
  });
});
