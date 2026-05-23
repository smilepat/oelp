/**
 * Vitest — queue.buildQueue (v1) + dimensionsInQueue (A7+ Phase 2).
 *
 * buildQueueV2 / V3 are exercised by separate test files. This file
 * covers the rule-engine v1 path which is still used as fallback in
 * recommendation-store + the default `buildQueue` export.
 */
import { describe, test, expect } from "vitest";
import { buildQueue, dimensionsInQueue } from "@/lib/queue";
import type { DiagnosticInput } from "@/lib/diagnostic";

function mkDiag(overrides: Partial<DiagnosticInput> = {}): DiagnosticInput {
  return {
    studentName: "queue-v1-test",
    theta: 0.0,
    level: 4,
    cefr: "B1",
    dimensionScores: {
      D1_Form: 70,
      D2_Meaning: 75,
      D3_Context: 40, // weakest
      D4_Network: 50, // 2nd weakest
      D5_Usage: 60,
    },
    weakDim: ["D3_Context", "D4_Network"],
    strongDim: ["D2_Meaning"],
    timestamp: "2026-05-23T00:00:00Z",
    ...overrides,
  };
}

describe("buildQueue v1 (A7+)", () => {
  test("T1: returns target QuestionType + target dimensions + 10 cards by default", () => {
    const plan = buildQueue(mkDiag());
    expect(plan.targetQuestionType).toBeTruthy();
    expect(plan.targetDimensions.length).toBeGreaterThanOrEqual(1);
    expect(plan.targetDimensions.length).toBeLessThanOrEqual(2);
    expect(plan.cards.length).toBeLessThanOrEqual(10);
    expect(plan.cards.length).toBeGreaterThan(0);
  });

  test("T2: predicted correctness lies in [0,1]", () => {
    const plan = buildQueue(mkDiag());
    expect(plan.predictedCorrectness).toBeGreaterThanOrEqual(0);
    expect(plan.predictedCorrectness).toBeLessThanOrEqual(1);
  });

  test("T3: targets the WEAKEST QT (lowest predicted correctness)", () => {
    // Force D3_Context dominant weakness — should select a D3-heavy QT
    const plan = buildQueue(
      mkDiag({
        dimensionScores: {
          D1_Form: 95,
          D2_Meaning: 95,
          D3_Context: 5, // strong weakness signal
          D4_Network: 95,
          D5_Usage: 95,
        },
      })
    );
    // Each QT row weights D3 — the QT with highest D3 weight should win
    // We don't check QT id exactly (depends on weights snapshot), but:
    // - targetDimensions should include D3_Context (top-2 weights of selected QT)
    expect(plan.targetDimensions).toContain("D3_Context");
  });

  test("T4: sessionSize option respected", () => {
    const plan = buildQueue(mkDiag(), { sessionSize: 5 });
    expect(plan.cards.length).toBeLessThanOrEqual(5);
  });

  test("T5: cards from target dimensions only (window-expansion safe)", () => {
    const plan = buildQueue(mkDiag());
    for (const c of plan.cards) {
      expect(plan.targetDimensions, `card ${c.itemId} dim ${c.dimension} not in targets`).toContain(c.dimension);
    }
  });

  test("T6: extreme theta still produces queue via window expansion", () => {
    const high = buildQueue(mkDiag({ theta: 3.5 }));
    const low = buildQueue(mkDiag({ theta: -3.5 }));
    expect(high.cards.length).toBeGreaterThan(0);
    expect(low.cards.length).toBeGreaterThan(0);
  });

  test("T7: difficultyHalfWidth option respected (narrower → fewer initial candidates)", () => {
    // With very narrow window, fallback expansion should still produce some cards
    const narrow = buildQueue(mkDiag(), { difficultyHalfWidth: 0.1 });
    expect(narrow.cards.length).toBeGreaterThan(0);
  });

  test("T8: dimensionsInQueue dedups", () => {
    const plan = buildQueue(mkDiag());
    const dims = dimensionsInQueue(plan.cards);
    expect(dims.length).toBeLessThanOrEqual(plan.targetDimensions.length);
    // All returned dims should be among target dims
    for (const d of dims) {
      expect(plan.targetDimensions).toContain(d);
    }
  });

  test("T9: dimensionsInQueue handles empty input", () => {
    expect(dimensionsInQueue([])).toEqual([]);
  });

  test("T10: cards have valid IRT params (sanity)", () => {
    const plan = buildQueue(mkDiag());
    for (const c of plan.cards) {
      expect(typeof c.difficulty).toBe("number");
      expect(typeof c.discrimination).toBe("number");
      expect(c.options).toHaveLength(4);
      expect(c.answerIdx).toBeGreaterThanOrEqual(0);
      expect(c.answerIdx).toBeLessThan(4);
    }
  });
});
