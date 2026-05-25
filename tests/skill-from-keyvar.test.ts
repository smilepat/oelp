/**
 * Vitest — lib/skill-from-keyvar.ts (PR-2 of p2a-ontology).
 *
 * Sentinel tests for the reverse index keyVar → skill_id[].
 * Also asserts no orphans against the 21 keyVariables declared in
 * lib/ontology.ts QUESTION_TYPES (cross-check with seed).
 */
import { describe, test, expect } from "vitest";
import {
  skillsForKeyVar,
  getAllMappedKeyVars,
  getOrphanKeyVars,
  getKeyVarsForSkill,
  getInvalidSkillRefs,
} from "@/lib/skill-from-keyvar";
import { QUESTION_TYPES } from "@/lib/ontology";

const ALL_KEYVARS_FROM_QT = Array.from(
  new Set(QUESTION_TYPES.flatMap((qt) => qt.keyVariables))
);

describe("skill-from-keyvar — reverse index", () => {
  test("T1: getAllMappedKeyVars covers all 21 ontology keyVariables", () => {
    const mapped = new Set(getAllMappedKeyVars());
    for (const kv of ALL_KEYVARS_FROM_QT) {
      expect(mapped.has(kv), `keyVar ${kv} not mapped to any skill`).toBe(true);
    }
    expect(ALL_KEYVARS_FROM_QT.length).toBe(21);
  });

  test("T2: getOrphanKeyVars returns empty for full QT keyVar list", () => {
    expect(getOrphanKeyVars(ALL_KEYVARS_FROM_QT)).toEqual([]);
  });

  test("T3: getOrphanKeyVars detects fake/unknown keyVars", () => {
    const orphans = getOrphanKeyVars([...ALL_KEYVARS_FROM_QT, "fake_kv_xyz"]);
    expect(orphans).toEqual(["fake_kv_xyz"]);
  });

  test("T4: skillsForKeyVar('coherence_gap') includes D4 and R6", () => {
    const skills = skillsForKeyVar("coherence_gap");
    expect(skills).toContain("D4");
    expect(skills).toContain("R6");
  });

  test("T5: skillsForKeyVar returns immutable copy", () => {
    const a = skillsForKeyVar("connective_density");
    a.push("HACK");
    const b = skillsForKeyVar("connective_density");
    expect(b).not.toContain("HACK");
  });

  test("T6: getKeyVarsForSkill('R5') includes both emotion-related keyVars (PR-2 orphan fix)", () => {
    const kvs = getKeyVarsForSkill("R5");
    expect(kvs).toContain("emotional_indirectness");
    expect(kvs).toContain("emotion_vocab_density");
  });

  test("T7: getKeyVarsForSkill('R4') includes purpose_indirectness (PR-2 orphan fix)", () => {
    expect(getKeyVarsForSkill("R4")).toContain("purpose_indirectness");
  });

  test("T8: advanced_vocab maps to V1 + A1 (cross-layer, PR-2 orphan fix)", () => {
    const skills = skillsForKeyVar("advanced_vocab");
    expect(skills).toContain("V1");
    expect(skills).toContain("A1");
  });

  test("T9: no invalid skill references (seed referential integrity)", () => {
    expect(getInvalidSkillRefs()).toEqual([]);
  });

  test("T10: getKeyVarsForSkill on unknown id returns empty array", () => {
    expect(getKeyVarsForSkill("ZZ99")).toEqual([]);
  });
});
