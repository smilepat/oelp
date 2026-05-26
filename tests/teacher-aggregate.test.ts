/**
 * Vitest — lib/teacher-aggregate.ts (PR-3.7 of p2a-ontology).
 */
import { describe, test, expect } from "vitest";
import {
  computeSkillClassRows,
  computeLayerClassRows,
  topClassWeaknesses,
  type LearnerInput,
} from "@/lib/teacher-aggregate";
import { MOCK_LEARNERS } from "@/lib/teacher-mock-learners";

const COHORT: LearnerInput[] = MOCK_LEARNERS.map((l) => ({
  id: l.id,
  label: l.label,
  scores: l.scores,
}));

describe("teacher-aggregate — skill rows", () => {
  test("T1: returns one row per mvpActive skill (33)", () => {
    const rows = computeSkillClassRows(COHORT);
    expect(rows.length).toBe(33);
  });

  test("T2: each row has perLearner entry for every learner", () => {
    const rows = computeSkillClassRows(COHORT);
    for (const r of rows) {
      for (const l of COHORT) {
        expect(l.id in r.perLearner).toBe(true);
      }
    }
  });

  test("T3: classMean is null when no learner has signal for that skill", () => {
    const noScoreCohort: LearnerInput[] = [
      { id: "x", label: "Empty", scores: {} },
    ];
    const rows = computeSkillClassRows(noScoreCohort);
    expect(rows.every((r) => r.classMean === null)).toBe(true);
  });

  test("T4: classMin ≤ classMean ≤ classMax for measured rows", () => {
    const rows = computeSkillClassRows(COHORT);
    for (const r of rows) {
      if (r.classMean === null) continue;
      expect(r.classMin as number).toBeLessThanOrEqual(r.classMean);
      expect(r.classMean).toBeLessThanOrEqual(r.classMax as number);
    }
  });
});

describe("teacher-aggregate — layer rows", () => {
  test("T5: returns 5 layer rows in V/S/D/R/A order", () => {
    const rows = computeLayerClassRows(COHORT);
    expect(rows.map((r) => r.layer)).toEqual(["V", "S", "D", "R", "A"]);
  });

  test("T6: measuredLearners ≤ cohort size", () => {
    const rows = computeLayerClassRows(COHORT);
    for (const r of rows) {
      expect(r.measuredLearners).toBeLessThanOrEqual(COHORT.length);
    }
  });

  test("T7: empty cohort → all classMean null and measuredLearners 0", () => {
    const rows = computeLayerClassRows([]);
    for (const r of rows) {
      expect(r.classMean).toBeNull();
      expect(r.measuredLearners).toBe(0);
    }
  });
});

describe("teacher-aggregate — topClassWeaknesses", () => {
  test("T8: returns ≤ k rows sorted by ascending classMean", () => {
    const top = topClassWeaknesses(COHORT, 5);
    expect(top.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < top.length; i++) {
      expect(top[i].classMean as number).toBeGreaterThanOrEqual(
        top[i - 1].classMean as number
      );
    }
  });

  test("T9: top weaknesses for the mock cohort all have classMean < cohort-wide median", () => {
    const top3 = topClassWeaknesses(COHORT, 3);
    const allRowsWithMean = topClassWeaknesses(COHORT, 100).filter((r) => r.classMean !== null);
    const sorted = allRowsWithMean.map((r) => r.classMean as number).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const r of top3) {
      expect(r.classMean as number).toBeLessThanOrEqual(median);
    }
  });

  test("T10: empty cohort → no weaknesses", () => {
    expect(topClassWeaknesses([], 5)).toEqual([]);
  });
});
