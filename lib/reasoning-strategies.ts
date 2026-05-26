/**
 * Reasoning Strategies (R10) — surfaces the 7 DISTRACTOR_TYPES from
 * lib/ontology.ts as named elimination strategies for skill R10
 * (선지 제거 전략).
 *
 * PR-4 of p2a-ontology. Pure derived module — no new domain knowledge,
 * no modifications to ontology.ts. Provides:
 *   - structured strategy descriptors (countermeasure + cue per trap)
 *   - linkage from DISTRACTOR id → recommended pre-check skill(s)
 *
 * Consumed by future PRs (UI panel on /map, recommendation engine
 * tie-in when a learner picks an obvious trap-distractor).
 */

import { DISTRACTOR_TYPES, type DistractorType } from "./ontology";

/** A learner-facing strategy that eliminates a specific distractor trap. */
export interface EliminationStrategy {
  /** Stable id, same as DISTRACTOR_TYPES.id */
  distractorId: string;
  /** Human-facing name (Korean canonical) */
  name: string;
  /** What the trap looks like — copied from DistractorType.description */
  trapDescription: string;
  /** Why the trap fools learners — DistractorType.trapMechanism */
  trapMechanism: string;
  /** Concrete action the learner should take to neutralize the trap */
  countermeasure: string;
  /**
   * Skill ids (from skill-ontology) whose mastery reduces susceptibility
   * to this trap. Used by recommendation engine to suggest practice.
   */
  prerequisiteSkills: string[];
}

const COUNTERMEASURES: Record<
  string,
  { countermeasure: string; prerequisiteSkills: string[] }
> = {
  "DIST-부분일치": {
    countermeasure:
      "선지의 모든 절을 지문과 1:1 대조 — 일부만 일치하면 핵심 논지 벗어남.",
    prerequisiteSkills: ["D5", "D6"],
  },
  "DIST-반대논지": {
    countermeasure:
      "선지의 동사·부정어·정도부사 부호를 지문과 비교 — 의미 역전 단서 확인.",
    prerequisiteSkills: ["D5", "R4"],
  },
  "DIST-과잉일반화": {
    countermeasure:
      "선지의 '모든/항상/대부분' 같은 정량 한정어를 지문 사례 범위와 비교.",
    prerequisiteSkills: ["A3", "A4"],
  },
  "DIST-범위이탈": {
    countermeasure:
      "지문에 명시되지 않은 배경 지식을 선지가 끌어들이는지 점검.",
    prerequisiteSkills: ["D6", "A4"],
  },
  "DIST-인과혼동": {
    countermeasure:
      "지문의 cause↔effect 화살표 방향을 선지와 매칭 (역전·치환 탐지).",
    prerequisiteSkills: ["R1", "D4"],
  },
  "DIST-시제조건왜곡": {
    countermeasure:
      "시제·가정법·조건절(if/unless)의 일치 여부를 표면 형태 너머 의미 단위로 확인.",
    prerequisiteSkills: ["S4", "V2"],
  },
  "DIST-유사어휘함정": {
    countermeasure:
      "철자·발음이 닮은 어휘를 의미 단위로 풀어 해석 (definition swap 검증).",
    prerequisiteSkills: ["V1", "V4"],
  },
};

let CACHE: EliminationStrategy[] | null = null;

function build(): EliminationStrategy[] {
  if (CACHE) return CACHE;
  CACHE = DISTRACTOR_TYPES.map((d: DistractorType) => {
    const c = COUNTERMEASURES[d.id];
    if (!c) {
      throw new Error(
        `reasoning-strategies: missing countermeasure for distractor "${d.id}". ` +
          `Add entry to COUNTERMEASURES.`
      );
    }
    return {
      distractorId: d.id,
      name: d.name,
      trapDescription: d.description,
      trapMechanism: d.trapMechanism,
      countermeasure: c.countermeasure,
      prerequisiteSkills: c.prerequisiteSkills,
    };
  });
  return CACHE;
}

/** All 7 elimination strategies (one per distractor type). */
export function listEliminationStrategies(): EliminationStrategy[] {
  return [...build()];
}

/** Look up one strategy by distractor id. */
export function getEliminationStrategy(
  distractorId: string
): EliminationStrategy | undefined {
  return build().find((s) => s.distractorId === distractorId);
}

/**
 * Reverse index: skill_id → distractor ids whose prerequisite list contains it.
 * Used by recommendation engine to surface "Mastering S4 will help you avoid
 * the 시제·조건 왜곡 trap".
 */
export function distractorsTargetingSkill(skillId: string): string[] {
  return build()
    .filter((s) => s.prerequisiteSkills.includes(skillId))
    .map((s) => s.distractorId);
}
