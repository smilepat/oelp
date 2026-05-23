/**
 * Vitest — trend-analysis (C4.3 scaffolding).
 *
 * Verifies the math layer before UI/learner data arrives. When external
 * learners accumulate (K5 KPI), the same functions feed the trend chart.
 */
import { describe, test, expect } from "vitest";
import {
  computeWindows,
  analyzeTrend,
  type DiagnosticSnapshot,
} from "@/lib/trend-analysis";

function mkSnap(at: string, scores: Partial<Record<string, number>>): DiagnosticSnapshot {
  return {
    at,
    learnerId: "u1",
    source: "test",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dimensionScores: scores as any,
  };
}

describe("computeWindows (C4.3)", () => {
  test("T1: empty snapshots → empty windows", () => {
    expect(computeWindows([])).toEqual([]);
  });

  test("T2: single snapshot → 1 window", () => {
    const wins = computeWindows([mkSnap("2026-01-01T00:00:00Z", { D1_Form: 70 })]);
    expect(wins).toHaveLength(1);
    expect(wins[0].count).toBe(1);
    expect(wins[0].mean.D1_Form).toBe(70);
  });

  test("T3: 4 snapshots over span → 4 windows (1 per window)", () => {
    const snaps = [
      mkSnap("2026-01-01T00:00:00Z", { D1_Form: 50 }),
      mkSnap("2026-01-08T00:00:00Z", { D1_Form: 55 }),
      mkSnap("2026-01-15T00:00:00Z", { D1_Form: 60 }),
      mkSnap("2026-01-22T00:00:00Z", { D1_Form: 65 }),
    ];
    const wins = computeWindows(snaps, 4);
    expect(wins).toHaveLength(4);
    // Each window has exactly 1 snapshot
    expect(wins[0].count).toBe(1);
    expect(wins[3].count).toBe(1);
    expect(wins[0].mean.D1_Form).toBe(50);
    expect(wins[3].mean.D1_Form).toBe(65);
  });

  test("T4: variance computed within window", () => {
    const snaps = [
      mkSnap("2026-01-01T00:00:00Z", { D1_Form: 50 }),
      mkSnap("2026-01-02T00:00:00Z", { D1_Form: 60 }),
      mkSnap("2026-01-03T00:00:00Z", { D1_Form: 70 }),
    ];
    const wins = computeWindows(snaps, 1);
    expect(wins[0].count).toBe(3);
    expect(wins[0].mean.D1_Form).toBe(60);
    // sample variance of [50, 60, 70] = sum_sq/(n-1) = (100+0+100)/2 = 100
    expect(wins[0].variance.D1_Form).toBe(100);
  });

  test("T5: missing dimensions handled (null mean)", () => {
    const snaps = [
      mkSnap("2026-01-01T00:00:00Z", { D1_Form: 50 }),
      mkSnap("2026-01-02T00:00:00Z", { D1_Form: 60 }),
    ];
    const wins = computeWindows(snaps, 1);
    expect(wins[0].mean.D2_Meaning).toBeNull();
    expect(wins[0].variance.D2_Meaning).toBeNull();
  });
});

describe("analyzeTrend (C4.3)", () => {
  test("T1: improving learner — slope positive, variance decreasing", () => {
    // Simulate 4 weekly snapshots: D3 improves 30 → 60, variance shrinks
    const snaps: DiagnosticSnapshot[] = [
      mkSnap("2026-01-01T00:00:00Z", { D3_Context: 25 }),
      mkSnap("2026-01-02T00:00:00Z", { D3_Context: 35 }), // var ≈ 50
      mkSnap("2026-01-15T00:00:00Z", { D3_Context: 55 }),
      mkSnap("2026-01-16T00:00:00Z", { D3_Context: 58 }), // var ≈ 4.5
    ];
    const result = analyzeTrend(snaps, 2);
    expect(result.slopes.D3_Context).toBeGreaterThan(0);
    expect(result.varianceDirection.D3_Context).toBe("decreasing");
  });

  test("T2: noisy learner — variance increasing", () => {
    const snaps: DiagnosticSnapshot[] = [
      mkSnap("2026-01-01T00:00:00Z", { D2_Meaning: 50 }),
      mkSnap("2026-01-02T00:00:00Z", { D2_Meaning: 52 }), // var ≈ 2
      mkSnap("2026-01-15T00:00:00Z", { D2_Meaning: 30 }),
      mkSnap("2026-01-16T00:00:00Z", { D2_Meaning: 80 }), // var ≈ 1250
    ];
    const result = analyzeTrend(snaps, 2);
    expect(result.varianceDirection.D2_Meaning).toBe("increasing");
  });

  test("T3: insufficient data — flagged correctly", () => {
    const snaps: DiagnosticSnapshot[] = [
      mkSnap("2026-01-01T00:00:00Z", { D1_Form: 50 }),
    ];
    const result = analyzeTrend(snaps, 4);
    expect(result.slopes.D1_Form).toBeNull();
    expect(result.varianceDirection.D1_Form).toBe("insufficient");
  });

  test("T4: learnerId propagated", () => {
    const snaps: DiagnosticSnapshot[] = [
      mkSnap("2026-01-01T00:00:00Z", { D1_Form: 50 }),
    ];
    snaps[0].learnerId = "smilepat";
    const result = analyzeTrend(snaps);
    expect(result.learnerId).toBe("smilepat");
  });

  test("T5: flat variance — flagged 'flat'", () => {
    // Variance stays within 20% of original
    const snaps: DiagnosticSnapshot[] = [
      mkSnap("2026-01-01T00:00:00Z", { D4_Network: 50 }),
      mkSnap("2026-01-02T00:00:00Z", { D4_Network: 60 }), // var=50
      mkSnap("2026-01-15T00:00:00Z", { D4_Network: 55 }),
      mkSnap("2026-01-16T00:00:00Z", { D4_Network: 65 }), // var=50
    ];
    const result = analyzeTrend(snaps, 2);
    expect(result.varianceDirection.D4_Network).toBe("flat");
  });
});
