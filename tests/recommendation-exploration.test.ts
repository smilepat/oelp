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
  shouldExplore,
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

describe("findExplorationTarget — adaptive threshold (R5)", () => {
  test("T1: adaptive=false (default) → fixed cap 20 behavior unchanged", () => {
    const samples: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) samples[qt.id] = 50;
    // 9 QT at 50 samples, 1 at 5 samples
    samples["TYPE-제목"] = 5;
    // Without adaptive, 50 > 20 → all "well-explored" except 제목
    const result = findExplorationTarget(mkMap(samples));
    expect(result?.questionType.id).toBe("TYPE-제목");
  });

  test("T2: adaptive=true scales threshold with mean", () => {
    // 9 QT at 400 samples (mean ≈ 360), 1 at 20
    const samples: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) samples[qt.id] = 400;
    samples["TYPE-제목"] = 20;
    // Without adaptive, 20 == fixed cap → null
    expect(findExplorationTarget(mkMap(samples))).toBeNull();
    // With adaptive (mean × 0.3 ≈ 108), 20 < 108 → still explored
    const adaptive = findExplorationTarget(mkMap(samples), { adaptive: true });
    expect(adaptive?.questionType.id).toBe("TYPE-제목");
    expect(adaptive?.samples).toBe(20);
  });

  test("T3: adaptiveRatio option respected", () => {
    const samples: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) samples[qt.id] = 100;
    samples["TYPE-제목"] = 25;
    // adaptive with ratio 0.5 → threshold = max(20, 100*0.5) = 50 → 25 explored
    expect(
      findExplorationTarget(mkMap(samples), { adaptive: true, adaptiveRatio: 0.5 })
        ?.questionType.id
    ).toBe("TYPE-제목");
    // adaptive with ratio 0.1 → threshold = max(20, 10) = 20 → 25 too high
    expect(
      findExplorationTarget(mkMap(samples), { adaptive: true, adaptiveRatio: 0.1 })
    ).toBeNull();
  });

  test("T4: adaptive never below fixed (low N protection)", () => {
    // mean = 5, ratio 0.3 → 1.5. Fixed = 20. Effective threshold = 20.
    const samples: Record<string, number> = {};
    for (const qt of QUESTION_TYPES) samples[qt.id] = 5;
    // All at 5 < 20 → all candidates. adaptive shouldn't lower the cap.
    const result = findExplorationTarget(mkMap(samples), { adaptive: true });
    expect(result).not.toBeNull();
  });
});

describe("shouldExplore (adaptive frequency)", () => {
  test("T1: severe starvation (balance < 0.1) → every 2nd session", () => {
    expect(shouldExplore(0.05, 1)).toBe(false);
    expect(shouldExplore(0.05, 2)).toBe(true);
    expect(shouldExplore(0.05, 3)).toBe(false);
    expect(shouldExplore(0.05, 4)).toBe(true);
  });

  test("T2: mild starvation (0.1 ≤ balance < 0.5) → every 4th session", () => {
    expect(shouldExplore(0.3, 1)).toBe(false);
    expect(shouldExplore(0.3, 2)).toBe(false);
    expect(shouldExplore(0.3, 3)).toBe(false);
    expect(shouldExplore(0.3, 4)).toBe(true);
    expect(shouldExplore(0.3, 5)).toBe(false);
    expect(shouldExplore(0.3, 8)).toBe(true);
  });

  test("T3: well-balanced (≥ 0.5) → never explore", () => {
    expect(shouldExplore(0.5, 2)).toBe(false);
    expect(shouldExplore(0.7, 4)).toBe(false);
    expect(shouldExplore(1.0, 100)).toBe(false);
  });

  test("T4: invalid session number → false", () => {
    expect(shouldExplore(0.05, 0)).toBe(false);
    expect(shouldExplore(0.05, -1)).toBe(false);
  });

  test("T5: policy boundary 0.1 — exactly 0.1 → mild path", () => {
    // balance < 0.1 is severe; balance === 0.1 falls into mild (< 0.5)
    expect(shouldExplore(0.1, 2)).toBe(false);
    expect(shouldExplore(0.1, 4)).toBe(true);
  });
});
