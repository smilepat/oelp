/**
 * Vitest — QT ↔ skill cross-consistency (PR-3 of p2a-ontology).
 *
 * Guards the contract that lib/ontology.ts QUESTION_TYPES.skillIds and
 * lib/skill-ontology-seed.json stay aligned.
 */
import { describe, test, expect } from "vitest";
import { QUESTION_TYPES, predictCorrectness } from "@/lib/ontology";
import { loadSkillOntology, getNode } from "@/lib/skill-ontology";
import { skillsForKeyVar } from "@/lib/skill-from-keyvar";

describe("qt-skill-mapping — referential integrity", () => {
  test("T1: every QT has ≥1 skillId", () => {
    for (const qt of QUESTION_TYPES) {
      expect(qt.skillIds.length, `${qt.id} has empty skillIds`).toBeGreaterThan(0);
    }
  });

  test("T2: every QT.skillId references an existing seed node", () => {
    const seed = loadSkillOntology();
    const seedIds = new Set(seed.nodes.map((n) => n.id));
    for (const qt of QUESTION_TYPES) {
      for (const sid of qt.skillIds) {
        expect(seedIds.has(sid), `${qt.id} → unknown skill ${sid}`).toBe(true);
      }
    }
  });

  test("T3: no QT.skillId points to layer P (forbidden in PR-1/PR-3)", () => {
    for (const qt of QUESTION_TYPES) {
      for (const sid of qt.skillIds) {
        const node = getNode(sid);
        expect(node?.layer, `${qt.id} → ${sid} is P-layer`).not.toBe("P");
      }
    }
  });
});

describe("qt-skill-mapping — semantic consistency", () => {
  test("T4: TYPE-빈칸추론 targets R6 cloze inference", () => {
    const qt = QUESTION_TYPES.find((q) => q.id === "TYPE-빈칸추론")!;
    expect(qt.skillIds).toContain("R6");
  });

  test("T5: TYPE-문장삽입 targets R7 + D8 (whole-text structure)", () => {
    const qt = QUESTION_TYPES.find((q) => q.id === "TYPE-문장삽입")!;
    expect(qt.skillIds).toContain("R7");
    expect(qt.skillIds).toContain("D8");
  });

  test("T6: TYPE-순서배열 targets R8 + D7 (paragraph) + D8 (whole text)", () => {
    const qt = QUESTION_TYPES.find((q) => q.id === "TYPE-순서배열")!;
    expect(qt.skillIds).toContain("R8");
    expect(qt.skillIds).toContain("D7");
    expect(qt.skillIds).toContain("D8");
  });

  test("T7: declared skillIds overlap with keyVar-derived skills (≥1)", () => {
    for (const qt of QUESTION_TYPES) {
      const derived = new Set<string>();
      for (const kv of qt.keyVariables) {
        for (const sid of skillsForKeyVar(kv)) derived.add(sid);
      }
      const overlap = qt.skillIds.filter((s) => derived.has(s));
      expect(
        overlap.length,
        `${qt.id} declared [${qt.skillIds.join(",")}] but keyVar-derived [${[...derived].join(",")}] has no overlap`
      ).toBeGreaterThan(0);
    }
  });

  test("T8: predictCorrectness is unaffected by skillIds (identity preserved)", () => {
    // skillIds are pure metadata; predictCorrectness reads only weights.
    // Confirm scores at 50% still produce sum(weights)/2 = 0.5 (weights ∑ = 1).
    for (const qt of QUESTION_TYPES) {
      const p = predictCorrectness(
        { D1_Form: 50, D2_Meaning: 50, D3_Context: 50, D4_Network: 50, D5_Usage: 50 },
        qt
      );
      expect(p).toBeCloseTo(0.5, 5);
    }
  });
});
