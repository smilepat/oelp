/**
 * Vitest — dimension-mapping ↔ ontology-weights consistency (T2.3).
 *
 * Three drift sources this catches:
 *  A. QT id set drift between ontology.ts and ontology-weights.json
 *     (e.g., adding a new QT in code but forgetting to add a weight row).
 *  B. keyVariables drift between ontology.ts and the snapshot of
 *     smilepat/myprojects/docs/01-plan/dimension-mapping.md (the cross-repo
 *     ground truth document). Snapshot lives below as DIM_MAPPING_SNAPSHOT;
 *     editing dimension-mapping.md without updating this snapshot fails CI,
 *     forcing conscious cross-repo sync.
 *  C. Distractor type set sanity (no silent additions).
 *
 * If dimension-mapping.md changes intentionally: update DIM_MAPPING_SNAPSHOT
 * and ontology.ts in the same PR.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QUESTION_TYPES, DISTRACTOR_TYPES } from "@/lib/ontology";

// ─── Snapshot of smilepat/myprojects/docs/01-plan/dimension-mapping.md §1.2 ─

const DIM_MAPPING_SNAPSHOT: Record<string, string[]> = {
  "TYPE-목적":     ["purpose_indirectness", "text_type_variation"],
  "TYPE-심경":     ["emotional_indirectness", "emotion_vocab_density"],
  "TYPE-주장":     ["claim_explicitness", "argument_structure"],
  "TYPE-요지":     ["topic_abstractness", "topic_sentence_position"],
  "TYPE-주제":     ["topic_abstractness", "topic_sentence_position", "advanced_vocab"],
  "TYPE-제목":     ["title_abstractness", "metaphor_density"],
  "TYPE-빈칸추론": ["coherence_gap", "abstractness", "context_clue", "advanced_vocab"],
  "TYPE-흐름무관": ["coherence_disruption", "topic_consistency"],
  "TYPE-순서배열": ["paragraph_dependency", "discourse_marker_density", "discourse_structure"],
  "TYPE-문장삽입": ["coherence_disruption", "connective_density", "given_sentence_role"],
};

const EXPECTED_DISTRACTOR_IDS = new Set([
  "DIST-부분일치",
  "DIST-반대논지",
  "DIST-과잉일반화",
  "DIST-범위이탈",
  "DIST-인과혼동",
  "DIST-시제조건왜곡",
  "DIST-유사어휘함정",
]);

const WEIGHTS = JSON.parse(
  readFileSync(join(process.cwd(), "lib", "ontology-weights.json"), "utf-8")
);

describe("dimension-mapping consistency (T2.3)", () => {
  test("A. QT ids in ontology.ts === keys in ontology-weights.json", () => {
    const codeIds = new Set(QUESTION_TYPES.map((qt) => qt.id));
    const weightIds = new Set(Object.keys(WEIGHTS.weights));
    expect(codeIds).toEqual(weightIds);
  });

  test("A2. There are exactly 10 QuestionTypes", () => {
    expect(QUESTION_TYPES.length).toBe(10);
    expect(Object.keys(WEIGHTS.weights).length).toBe(10);
  });

  test("B. ontology.ts keyVariables match dimension-mapping.md snapshot", () => {
    for (const qt of QUESTION_TYPES) {
      const expected = DIM_MAPPING_SNAPSHOT[qt.id];
      expect(expected, `${qt.id} missing in DIM_MAPPING_SNAPSHOT`).toBeDefined();
      expect(qt.keyVariables, `${qt.id} keyVariables drifted`).toEqual(expected);
    }
  });

  test("B2. DIM_MAPPING_SNAPSHOT has no extra QT ids", () => {
    const snapIds = new Set(Object.keys(DIM_MAPPING_SNAPSHOT));
    const codeIds = new Set(QUESTION_TYPES.map((qt) => qt.id));
    expect(snapIds).toEqual(codeIds);
  });

  test("C. Distractor types match expected set", () => {
    const actual = new Set(DISTRACTOR_TYPES.map((d) => d.id));
    expect(actual).toEqual(EXPECTED_DISTRACTOR_IDS);
  });

  test("D. Each weight row sums to ~1.0 (±0.005)", () => {
    for (const [qtId, row] of Object.entries<Record<string, number>>(WEIGHTS.weights)) {
      const sum = Object.values(row).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0), `${qtId} sum=${sum}`).toBeLessThan(0.005);
    }
  });
});
