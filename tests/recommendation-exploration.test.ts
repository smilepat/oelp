/**
 * Vitest — recommendation exploration target + posterior balance (P-1 prep).
 *
 * Prepares the codebase for Phase 2 external learner integration. When N
 * grows but specific QTs starve, exploration target surfaces the "least
 * known" QT as a queue alternative.
 */
import { describe, test, expect } from "vitest";
import {
  findExplorationTarget,
  posteriorBalance,
  initialPosteriors,
  type BetaPosterior,
} from "@/lib/recommendation";
import { QUESTION_TYPES } from "@/lib/ontology";

const SCORES = {
  D1_Form: 70,
  D2_Meaning: 75,
  D3_Context: 50,
  D4_Network: 60,
  D5_Usage: 65,
};

function mkMap(samples: Record<string, number>): Record<string, BetaPosterior> {
  const base = initialPosteriors(SCORES);
  for (const [qtId, n] of Object.entries(samples)) {
    if (!base[qtId]) continue;
    base[qtId] = {
      qtId,
      alpha: base[qtId].alpha + n * 0.5,
      beta: base[qtId].beta + n * 0.5,
      samples: n,
    };
  }
  return base;
}

describe("findExplorationTarget (P-1 prep)", () => {
  test("T1: returns lowest-samples QT among posteriors below maxSamplesToConsider", () => {
    // 9 QTs have 30 samples (well-explored), 1 has 2 samples
    const samples: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) samples[qt.id] = 30;
    samples["TYPE-제목"] = 2;

    const target = findExplorationTarget(mkMap(samples));
    expect(target).not.toBeNull();
    expect(target!.questionType.id).toBe("TYPE-제목");
    expect(target!.samples).toBe(2);
  });

  test("T2: returns null when all QTs are well-explored (≥ maxSamplesToConsider)", () => {
    const samples: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) samples[qt.id] = 50;
    const target = findExplorationTarget(mkMap(samples));
    expect(target).toBeNull();
  });

  test("T3: excludeQtIds skips listed QTs", () => {
    const samples: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) samples[qt.id] = 30;
    samples["TYPE-제목"] = 2;
    samples["TYPE-주제"] = 1; // even lower

    const target = findExplorationTarget(mkMap(samples), {
      excludeQtIds: ["TYPE-주제"],
    });
    expect(target!.questionType.id).toBe("TYPE-제목");
  });

  test("T4: lower samples = higher information value (among under-explored)", () => {
    const samples: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) samples[qt.id] = 30;
    samples["TYPE-목적"] = 5;
    samples["TYPE-제목"] = 2;

    const target = findExplorationTarget(mkMap(samples));
    expect(target!.questionType.id).toBe("TYPE-제목"); // fewer samples
  });

  test("T5: maxSamplesToConsider option respected", () => {
    const samples: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) samples[qt.id] = 15;
    samples["TYPE-목적"] = 8;

    // With default 20, both 15 and 8 considered → return 8
    expect(findExplorationTarget(mkMap(samples))!.samples).toBe(8);

    // With max 10, only 8 considered → return 8
    expect(findExplorationTarget(mkMap(samples), { maxSamplesToConsider: 10 })!.samples).toBe(8);

    // With max 5, no QT qualifies → null
    expect(findExplorationTarget(mkMap(samples), { maxSamplesToConsider: 5 })).toBeNull();
  });

  test("T6: posteriorMean computed correctly", () => {
    const map = mkMap({ "TYPE-제목": 2 });
    const target = findExplorationTarget(map)!;
    const post = map[target.questionType.id];
    const expectedMean = post.alpha / (post.alpha + post.beta);
    expect(target.posteriorMean).toBeCloseTo(expectedMean, 5);
  });
});

describe("posteriorBalance (P-1 prep)", () => {
  test("T1: empty map → 0", () => {
    expect(posteriorBalance({})).toBe(0);
  });

  test("T2: all-zero samples → 0", () => {
    const map = mkMap({});
    expect(posteriorBalance(map)).toBe(0);
  });

  test("T3: balanced samples → 1.0", () => {
    const samples: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) samples[qt.id] = 20;
    const balance = posteriorBalance(mkMap(samples));
    expect(balance).toBeCloseTo(1.0, 5);
  });

  test("T4: starved QT pulls balance down", () => {
    // 9 QTs with 20 samples, 1 with 2 → min/mean = 2 / (18.2) ≈ 0.11
    const samples: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) samples[qt.id] = 20;
    samples["TYPE-제목"] = 2;
    const balance = posteriorBalance(mkMap(samples));
    expect(balance).toBeLessThan(0.2);
  });

  test("T5: balance is monotonic — more uneven → lower", () => {
    const even: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) even[qt.id] = 10;
    const slightUneven = { ...even, "TYPE-제목": 5 };
    const heavyUneven = { ...even, "TYPE-제목": 1 };

    expect(posteriorBalance(mkMap(even))).toBeCloseTo(1.0, 5);
    expect(posteriorBalance(mkMap(slightUneven))).toBeGreaterThan(
      posteriorBalance(mkMap(heavyUneven))
    );
  });
});
