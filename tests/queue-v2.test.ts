/**
 * Vitest port of scripts/test-queue-v2.mjs.
 * Imports real lib/queue.ts (which loads VOCAB_POOL from vocabulary-pool.ts).
 */
import { describe, test, expect } from "vitest";
import { buildQueueV2 } from "@/lib/queue";
import { initialPosteriors } from "@/lib/recommendation";
import { QUESTION_TYPES, predictCorrectness } from "@/lib/ontology";
import { DEMO_DIAGNOSTIC } from "@/lib/diagnostic";

describe("buildQueueV2 (P-1 W3)", () => {
  test("T1: With no posterior history, algorithm = rule-v1-fallback", () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = buildQueueV2(DEMO_DIAGNOSTIC, posts);
    expect(plan.algorithm).toBe("rule-v1-fallback");
    expect(plan.confidence).toBe("low");
  });

  test("T2: Fallback picks argmin(predictCorrectness)", () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = buildQueueV2(DEMO_DIAGNOSTIC, posts);
    const ranked = QUESTION_TYPES.map((qt) => ({
      qt,
      p: predictCorrectness(DEMO_DIAGNOSTIC.dimensionScores, qt),
    })).sort((a, b) => a.p - b.p);
    expect(plan.targetQuestionType.id).toBe(ranked[0].qt.id);
    expect(plan.alternateQuestionType.id).toBe(ranked[1].qt.id);
  });

  test("T3: ≥10 samples + skewed posteriors → thompson-v2", () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    posts["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 2, beta: 30, samples: 30 };
    posts["TYPE-순서배열"] = { qtId: "TYPE-순서배열", alpha: 30, beta: 2, samples: 30 };
    const plan = buildQueueV2(DEMO_DIAGNOSTIC, posts);
    expect(plan.algorithm).toBe("thompson-v2");
  });

  test("T4: Thompson picks weak QT majority (200 trials)", () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    posts["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 2, beta: 30, samples: 30 };
    posts["TYPE-순서배열"] = { qtId: "TYPE-순서배열", alpha: 30, beta: 2, samples: 30 };
    let yojiHits = 0;
    let sunseoHits = 0;
    for (let i = 0; i < 200; i++) {
      const plan = buildQueueV2(DEMO_DIAGNOSTIC, posts);
      if (plan.targetQuestionType.id === "TYPE-요지") yojiHits++;
      if (plan.targetQuestionType.id === "TYPE-순서배열") sunseoHits++;
    }
    expect(yojiHits).toBeGreaterThan(100);
    expect(sunseoHits).toBeLessThan(20);
  });

  test("T5: Queue has exactly 10 cards (default sessionSize)", () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = buildQueueV2(DEMO_DIAGNOSTIC, posts);
    expect(plan.cards.length).toBe(10);
  });

  test("T6: targetDimensions = top-2 weights of selected QT", () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = buildQueueV2(DEMO_DIAGNOSTIC, posts);
    const dimsRanked = Object.entries(plan.targetQuestionType.weights)
      .sort((a, b) => b[1] - a[1])
      .map(([d]) => d);
    expect(plan.targetDimensions).toEqual(dimsRanked.slice(0, 2));
  });

  test("T7: Cards' dimensions ⊂ targetDimensions", () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = buildQueueV2(DEMO_DIAGNOSTIC, posts);
    for (const c of plan.cards) {
      expect(plan.targetDimensions).toContain(c.dimension);
    }
  });

  test("T8: Repeat calls produce varied cards (shuffle)", () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const plan1 = buildQueueV2(DEMO_DIAGNOSTIC, posts);
    const plan2 = buildQueueV2(DEMO_DIAGNOSTIC, posts);
    const set1 = new Set(plan1.cards.map((c) => c.itemId));
    const set2 = new Set(plan2.cards.map((c) => c.itemId));
    const overlap = [...set1].filter((x) => set2.has(x)).length;
    expect(overlap).toBeLessThan(10);
  });
});
