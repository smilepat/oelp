/**
 * Vitest — computeBalanceSummary (PosteriorBalancePanel pure logic).
 *
 * Tests the data transform extracted from PosteriorBalancePanel. UI
 * rendering is covered by A11y suite; this validates state derivation.
 */
import { describe, test, expect } from "vitest";
import { computeBalanceSummary } from "@/components/PosteriorBalancePanel";
import { QUESTION_TYPES } from "@/lib/ontology";

function makeEnvelope(samples: Record<string, number>) {
  const posteriors: Record<string, { qtId: string; alpha: number; beta: number; samples: number }> = {};
  for (const qt of QUESTION_TYPES) {
    const n = samples[qt.id] ?? 0;
    posteriors[qt.id] = {
      qtId: qt.id,
      alpha: 1 + n * 0.5,
      beta: 1 + n * 0.5,
      samples: n,
    };
  }
  return JSON.stringify({
    schemaVersion: 1,
    userId: "default",
    updatedAt: new Date().toISOString(),
    posteriors,
    diagnosticFingerprint: "x",
  });
}

describe("computeBalanceSummary (PosteriorBalancePanel logic)", () => {
  test("T1: null raw → empty state", () => {
    const s = computeBalanceSummary(null);
    expect(s.posteriorMap).toBeNull();
    expect(s.balance).toBe(0);
    expect(s.minSamples).toBe(0);
    expect(s.maxSamples).toBe(0);
    expect(s.starvedQTs).toEqual([]);
    expect(s.explorationTargetName).toBeNull();
    expect(s.longRunImbalance).toBe(false);
  });

  test("T2: malformed JSON → empty state (no throw)", () => {
    const s = computeBalanceSummary("not json");
    expect(s.posteriorMap).toBeNull();
  });

  test("T3: wrong schemaVersion → empty state", () => {
    const wrong = JSON.stringify({ schemaVersion: 99, posteriors: {} });
    const s = computeBalanceSummary(wrong);
    expect(s.posteriorMap).toBeNull();
  });

  test("T4: balanced posteriors → balance ≈ 1.0, no flags", () => {
    const env = makeEnvelope(
      Object.fromEntries(QUESTION_TYPES.map((qt) => [qt.id, 30]))
    );
    const s = computeBalanceSummary(env);
    expect(s.balance).toBeCloseTo(1.0, 5);
    expect(s.minSamples).toBe(30);
    expect(s.maxSamples).toBe(30);
    expect(s.starvedQTs).toEqual([]);
    expect(s.longRunImbalance).toBe(false);
  });

  test("T5: 6 starved QTs surfaced by name", () => {
    const samples: Record<string, number> = {};
    QUESTION_TYPES.forEach((qt, i) => (samples[qt.id] = i < 6 ? 0 : 100));
    const env = makeEnvelope(samples);
    const s = computeBalanceSummary(env);
    expect(s.starvedQTs.length).toBe(6);
    expect(s.balance).toBe(0);
    expect(s.minSamples).toBe(0);
    expect(s.maxSamples).toBe(100);
  });

  test("T6: longRunImbalance flag — max/min > 10 AND min > 0", () => {
    const samples: Record<string, number> = {};
    QUESTION_TYPES.forEach((qt, i) => (samples[qt.id] = i === 0 ? 20 : 300));
    const env = makeEnvelope(samples);
    const s = computeBalanceSummary(env);
    expect(s.longRunImbalance).toBe(true);
    expect(s.minSamples).toBe(20);
    expect(s.maxSamples).toBe(300);
  });

  test("T7: longRunImbalance false when starved (min=0)", () => {
    // 6 starved, 1 warm 1000 — ratio undefined per policy (min>0 required)
    const samples: Record<string, number> = {};
    QUESTION_TYPES.forEach((qt, i) => (samples[qt.id] = i === 0 ? 1000 : 0));
    const env = makeEnvelope(samples);
    const s = computeBalanceSummary(env);
    expect(s.longRunImbalance).toBe(false);
  });

  test("T8: longRunImbalance false when ratio ≤ 10", () => {
    // min=50, max=400 → ratio 8 → no flag
    const samples: Record<string, number> = {};
    QUESTION_TYPES.forEach((qt, i) => (samples[qt.id] = i === 0 ? 50 : 400));
    const env = makeEnvelope(samples);
    const s = computeBalanceSummary(env);
    expect(s.longRunImbalance).toBe(false);
  });

  test("T9: explorationTargetName populated when cold QTs exist", () => {
    const samples: Record<string, number> = {};
    QUESTION_TYPES.forEach((qt, i) => (samples[qt.id] = i === 0 ? 5 : 50));
    const env = makeEnvelope(samples);
    const s = computeBalanceSummary(env);
    expect(s.explorationTargetName).toBeTruthy();
    // Cold QT (i=0) should be the chosen target
    expect(s.explorationTargetName).toBe(QUESTION_TYPES[0].name);
  });
});
