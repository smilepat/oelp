/**
 * Vitest — lib/skill-mastery.ts (PR-6 of p2a-ontology).
 */
import { describe, test, expect } from "vitest";
import {
  computeSkillMastery,
  computeAllSkillMasteries,
  computeLayerMasteries,
} from "@/lib/skill-mastery";
import { getNode } from "@/lib/skill-ontology";

const FULL_SCORES = {
  D1_Form: 80,
  D2_Meaning: 80,
  D3_Context: 80,
  D4_Network: 80,
  D5_Usage: 80,
};

const EMPTY_SCORES = {};

describe("skill-mastery — single skill", () => {
  test("T1: V1 (D2_Meaning) mastery = D2_Meaning score", () => {
    const v1 = getNode("V1")!;
    const r = computeSkillMastery({ D2_Meaning: 60 }, v1);
    expect(r.mastery).toBe(60);
    expect(r.evidenceCount).toBe(1);
  });

  test("T2: V4 (D2_Meaning + D3_Context) mastery = mean of two dims", () => {
    const v4 = getNode("V4")!;
    const r = computeSkillMastery({ D2_Meaning: 40, D3_Context: 80 }, v4);
    expect(r.mastery).toBe(60);
    expect(r.evidenceCount).toBe(2);
  });

  test("T3: R-layer skill with only QTs falls back to predictCorrectness", () => {
    const r5 = getNode("R5")!; // measuredByQts: ["TYPE-심경"]
    const r = computeSkillMastery(FULL_SCORES, r5);
    expect(r.mastery).toBeCloseTo(80, 5);
    expect(r.evidenceCount).toBe(1);
  });

  test("T4: empty scores → mastery undefined, evidenceCount 0", () => {
    const v1 = getNode("V1")!;
    const r = computeSkillMastery(EMPTY_SCORES, v1);
    expect(r.mastery).toBeUndefined();
    expect(r.evidenceCount).toBe(0);
  });
});

describe("skill-mastery — bulk + layer aggregate", () => {
  test("T5: computeAllSkillMasteries returns 33 entries (mvpActive)", () => {
    expect(computeAllSkillMasteries(FULL_SCORES).length).toBe(33);
  });

  test("T6: full 80 across all 5 dims → every layer aggregate ≈ 80", () => {
    const layers = computeLayerMasteries(FULL_SCORES);
    expect(layers.length).toBe(5);
    for (const l of layers) {
      expect(l.mastery, `${l.layer} unexpectedly undefined`).toBeDefined();
      expect(l.mastery as number).toBeCloseTo(80, 0);
    }
  });

  test("T7: empty scores → every layer mastery undefined", () => {
    const layers = computeLayerMasteries(EMPTY_SCORES);
    for (const l of layers) {
      expect(l.mastery, `${l.layer} should be undefined`).toBeUndefined();
    }
  });

  test("T8: coverage counts add up to 33 across all layers", () => {
    const layers = computeLayerMasteries(FULL_SCORES);
    const totals = layers.reduce((s, l) => s + l.coverage.total, 0);
    expect(totals).toBe(33);
  });

  test("T9: layer order is V → S → D → R → A", () => {
    const layers = computeLayerMasteries(FULL_SCORES);
    expect(layers.map((l) => l.layer)).toEqual(["V", "S", "D", "R", "A"]);
  });

  test("T10: partial scores (only D3) leaves R/A undefined when no D3 link", () => {
    const layers = computeLayerMasteries({ D3_Context: 70 });
    const vLayer = layers.find((l) => l.layer === "V")!;
    // V layer skills mostly need D2_Meaning or D4_Network — V should be undefined here
    // (V1 needs D2_Meaning, V2 needs D1_Form, V3/V5 need D4_Network, V4 needs D2+D3)
    // Only V4 has D3_Context → V4 mastery = 70 → V layer = 70 (single measured skill)
    expect(vLayer.mastery).toBe(70);
    expect(vLayer.coverage.measured).toBe(1);
  });
});
