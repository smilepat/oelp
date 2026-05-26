/**
 * Vitest — lib/reasoning-strategies.ts (PR-4 of p2a-ontology).
 *
 * Ensures R10 elimination strategies stay aligned with DISTRACTOR_TYPES
 * and that every prerequisiteSkill references a real skill ontology node.
 */
import { describe, test, expect } from "vitest";
import {
  listEliminationStrategies,
  getEliminationStrategy,
  distractorsTargetingSkill,
} from "@/lib/reasoning-strategies";
import { DISTRACTOR_TYPES } from "@/lib/ontology";
import { loadSkillOntology } from "@/lib/skill-ontology";

describe("reasoning-strategies — coverage", () => {
  test("T1: one strategy per DISTRACTOR_TYPE (7/7)", () => {
    const strategies = listEliminationStrategies();
    expect(strategies.length).toBe(DISTRACTOR_TYPES.length);
    expect(strategies.length).toBe(7);
    const stratIds = new Set(strategies.map((s) => s.distractorId));
    for (const d of DISTRACTOR_TYPES) {
      expect(stratIds.has(d.id), `no strategy for ${d.id}`).toBe(true);
    }
  });

  test("T2: every strategy has non-empty countermeasure + ≥1 prerequisite skill", () => {
    for (const s of listEliminationStrategies()) {
      expect(s.countermeasure.length).toBeGreaterThan(10);
      expect(s.prerequisiteSkills.length).toBeGreaterThan(0);
    }
  });

  test("T3: every prerequisiteSkill exists in skill-ontology seed", () => {
    const seedIds = new Set(loadSkillOntology().nodes.map((n) => n.id));
    for (const s of listEliminationStrategies()) {
      for (const skill of s.prerequisiteSkills) {
        expect(seedIds.has(skill), `${s.distractorId} → unknown skill ${skill}`).toBe(true);
      }
    }
  });

  test("T4: no prerequisiteSkill points to layer P (PR-1 guard)", () => {
    const layerOf = new Map(
      loadSkillOntology().nodes.map((n) => [n.id, n.layer])
    );
    for (const s of listEliminationStrategies()) {
      for (const skill of s.prerequisiteSkills) {
        expect(layerOf.get(skill), `${skill} is P-layer`).not.toBe("P");
      }
    }
  });
});

describe("reasoning-strategies — lookups", () => {
  test("T5: getEliminationStrategy('DIST-인과혼동') returns R1 + D4", () => {
    const s = getEliminationStrategy("DIST-인과혼동");
    expect(s).toBeDefined();
    expect(s!.prerequisiteSkills).toContain("R1");
    expect(s!.prerequisiteSkills).toContain("D4");
  });

  test("T6: getEliminationStrategy on unknown id returns undefined", () => {
    expect(getEliminationStrategy("DIST-fake")).toBeUndefined();
  });

  test("T7: distractorsTargetingSkill('V4') includes 유사어휘함정", () => {
    expect(distractorsTargetingSkill("V4")).toContain("DIST-유사어휘함정");
  });

  test("T8: distractorsTargetingSkill('D5') includes both 부분일치 and 반대논지", () => {
    const targeted = distractorsTargetingSkill("D5");
    expect(targeted).toContain("DIST-부분일치");
    expect(targeted).toContain("DIST-반대논지");
  });

  test("T9: distractorsTargetingSkill on unrelated skill returns empty", () => {
    expect(distractorsTargetingSkill("ZZ99")).toEqual([]);
  });
});
