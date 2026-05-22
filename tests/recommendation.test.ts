/**
 * Vitest port of scripts/test-recommendation.mjs.
 * Imports the real lib/recommendation.ts — single source of truth.
 */
import { describe, test, expect } from "vitest";
import {
  sampleBeta,
  updatePosterior,
  priorFromDiagnostic,
  initialPosteriors,
  recommendQuestionType,
  applyResponses,
  posteriorConfidence,
  type BetaPosterior,
} from "@/lib/recommendation";
import { QUESTION_TYPES, predictCorrectness } from "@/lib/ontology";
import type { VocabDimension } from "@/lib/diagnostic";

const DEMO_SCORES: Partial<Record<VocabDimension, number>> = {
  D1_Form: 78,
  D2_Meaning: 82,
  D3_Context: 45,
  D4_Network: 60,
  D5_Usage: 71,
};

describe("recommendation (P-1 W1)", () => {
  test("T1: sampleBeta returns value in [0, 1]", () => {
    for (let i = 0; i < 100; i++) {
      const v = sampleBeta(2, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test("T2: sampleBeta mean ≈ α/(α+β) over 5000 samples", () => {
    const N = 5000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += sampleBeta(3, 7);
    const mean = sum / N;
    expect(Math.abs(mean - 0.3)).toBeLessThan(0.02);
  });

  test("T3: updatePosterior — correct adds α, wrong adds β", () => {
    const p0: BetaPosterior = { qtId: "x", alpha: 2, beta: 3, samples: 0 };
    const p1 = updatePosterior(p0, true);
    expect(p1).toMatchObject({ alpha: 3, beta: 3, samples: 1 });
    const p2 = updatePosterior(p1, false);
    expect(p2).toMatchObject({ alpha: 3, beta: 4, samples: 2 });
  });

  test("T4: priorFromDiagnostic — Laplace-smoothed anchor", () => {
    const qt = QUESTION_TYPES.find((q) => q.id === "TYPE-요지")!;
    const k = 5;
    const p = priorFromDiagnostic(qt, DEMO_SCORES);
    const expectedRaw = predictCorrectness(DEMO_SCORES, qt);
    const expectedMean = (1 + k * expectedRaw) / (2 + k);
    const mean = p.alpha / (p.alpha + p.beta);
    expect(Math.abs(mean - expectedMean)).toBeLessThan(0.001);
    expect(p.samples).toBe(0);
  });

  test("T5: Initial posteriors — strong dim QT has higher mean", () => {
    const posts = initialPosteriors(DEMO_SCORES);
    const yoji = posts["TYPE-요지"];
    const sunseo = posts["TYPE-순서배열"];
    const yojiMean = yoji.alpha / (yoji.alpha + yoji.beta);
    const sunseoMean = sunseo.alpha / (sunseo.alpha + sunseo.beta);
    expect(sunseoMean).toBeGreaterThanOrEqual(yojiMean);
  });

  test("T6: Rule-v1 fallback when totalSamples < threshold", () => {
    const posts = initialPosteriors(DEMO_SCORES);
    const r = recommendQuestionType(DEMO_SCORES, posts);
    expect(r.algorithm).toBe("rule-v1-fallback");
    expect(r.confidence).toBe("low");
    const ranked = QUESTION_TYPES.map((qt) => ({
      qt,
      p: predictCorrectness(DEMO_SCORES, qt),
    })).sort((a, b) => a.p - b.p);
    expect(r.targetQuestionType.id).toBe(ranked[0].qt.id);
  });

  test("T7: Thompson picks weak QT majority over 200 trials", () => {
    const posts = initialPosteriors(DEMO_SCORES);
    posts["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 1, beta: 20, samples: 21 };
    posts["TYPE-순서배열"] = { qtId: "TYPE-순서배열", alpha: 20, beta: 1, samples: 21 };
    let yojiHits = 0;
    let sunseoHits = 0;
    for (let i = 0; i < 200; i++) {
      const r = recommendQuestionType(DEMO_SCORES, posts);
      expect(r.algorithm).toBe("thompson-v2");
      if (r.targetQuestionType.id === "TYPE-요지") yojiHits++;
      if (r.targetQuestionType.id === "TYPE-순서배열") sunseoHits++;
    }
    expect(yojiHits).toBeGreaterThan(100);
    expect(sunseoHits).toBeLessThan(20);
  });

  test("T8: posteriorConfidence buckets", () => {
    expect(posteriorConfidence({ qtId: "x", alpha: 1, beta: 1, samples: 0 })).toBe("low");
    expect(posteriorConfidence({ qtId: "x", alpha: 50, beta: 50, samples: 100 })).toBe("high");
    expect(posteriorConfidence({ qtId: "x", alpha: 5, beta: 5, samples: 10 })).toBe("mid");
  });

  test("T9: applyResponses updates correct keys, ignores unknown", () => {
    const posts = initialPosteriors(DEMO_SCORES);
    const before = { ...posts["TYPE-요지"] };
    const next = applyResponses(posts, [
      { qtId: "TYPE-요지", isCorrect: true },
      { qtId: "TYPE-요지", isCorrect: false },
      { qtId: "UNKNOWN-QT", isCorrect: true },
    ]);
    expect(next["TYPE-요지"].alpha).toBe(before.alpha + 1);
    expect(next["TYPE-요지"].beta).toBe(before.beta + 1);
    expect(next["TYPE-요지"].samples).toBe(before.samples + 2);
    expect(next["TYPE-목적"]).toEqual(posts["TYPE-목적"]);
  });

  test("T10: After 100 correct, posterior mean → 1, confidence high", () => {
    let post: BetaPosterior = { qtId: "TYPE-요지", alpha: 2, beta: 5, samples: 5 };
    for (let i = 0; i < 100; i++) post = updatePosterior(post, true);
    const mean = post.alpha / (post.alpha + post.beta);
    expect(mean).toBeGreaterThan(0.92);
    expect(posteriorConfidence(post)).toBe("high");
  });
});
