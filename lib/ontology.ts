/**
 * Ontology graph data — 10 QuestionType + 21 keyVariables + 7 DistractorType.
 *
 * Ground truth: smilepat/csat-graphdb-318/src/domains/csat/graph/csat-schema.ts
 * Dimension weights: docs/01-plan/dimension-mapping.md §2
 *
 * Numbers per [PRD §B-3](https://github.com/smilepat/myprojects/blob/main/docs/01-plan/prd-oelp-mvp-phase1.md).
 */

import type { VocabDimension } from "./diagnostic";

export interface QuestionType {
  id: string;
  name: string;
  numberRange: string;
  pointValue: number;
  keyVariables: string[];
  /** dimension weights — sum to 1.0 */
  weights: Record<VocabDimension, number>;
}

export interface DistractorType {
  id: string;
  name: string;
  description: string;
  trapMechanism: string;
}

export const QUESTION_TYPES: QuestionType[] = [
  {
    id: "TYPE-목적",
    name: "목적 파악",
    numberRange: "18",
    pointValue: 2,
    keyVariables: ["purpose_indirectness", "text_type_variation"],
    // v2 (2026-05-22): D2 0.20→0.10, D5 0.10→0.25 (text_type_variation evidence)
    weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.1, D5_Usage: 0.25 },
  },
  {
    id: "TYPE-심경",
    name: "심경·분위기",
    numberRange: "19-20",
    pointValue: 2,
    keyVariables: ["emotional_indirectness", "emotion_vocab_density"],
    // v2 (2026-05-22): D4 0.20→0.10 (no network keyVar), D2 0.25→0.35 (emotion_vocab_density)
    weights: { D1_Form: 0.05, D2_Meaning: 0.35, D3_Context: 0.4, D4_Network: 0.1, D5_Usage: 0.1 },
  },
  {
    id: "TYPE-주장",
    name: "필자 주장",
    numberRange: "22",
    pointValue: 2,
    keyVariables: ["claim_explicitness", "argument_structure"],
    // v2 (2026-05-22): D2 0.20→0.10, D5 0.10→0.20 (argument_structure)
    weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.2 },
  },
  {
    id: "TYPE-요지",
    name: "요지 파악",
    numberRange: "23",
    pointValue: 2,
    keyVariables: ["topic_abstractness", "topic_sentence_position"],
    // v2 (2026-05-22): D2 0.20→0.10, D4 0.15→0.25 (topic_abstractness has D4 component)
    weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.25, D5_Usage: 0.1 },
  },
  {
    id: "TYPE-주제",
    name: "주제 파악",
    numberRange: "24",
    pointValue: 2,
    keyVariables: ["topic_abstractness", "topic_sentence_position", "advanced_vocab"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.25, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.05 },
  },
  {
    id: "TYPE-제목",
    name: "제목 추론",
    numberRange: "25",
    pointValue: 2,
    keyVariables: ["title_abstractness", "metaphor_density"],
    // v2 (2026-05-22): D2 0.20→0.10, D4 0.30→0.40 (metaphor_density is primary D4)
    weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.35, D4_Network: 0.4, D5_Usage: 0.1 },
  },
  {
    id: "TYPE-빈칸추론",
    name: "빈칸 추론",
    numberRange: "29-34",
    pointValue: 3,
    keyVariables: ["coherence_gap", "abstractness", "context_clue", "advanced_vocab"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.2, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.1 },
  },
  {
    id: "TYPE-흐름무관",
    name: "흐름무관 문장",
    numberRange: "35",
    pointValue: 3,
    keyVariables: ["coherence_disruption", "topic_consistency"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.15 },
  },
  {
    id: "TYPE-순서배열",
    name: "순서 배열",
    numberRange: "36-37",
    pointValue: 3,
    keyVariables: ["paragraph_dependency", "discourse_marker_density", "discourse_structure"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.3 },
  },
  {
    id: "TYPE-문장삽입",
    name: "문장 삽입",
    numberRange: "38-39",
    pointValue: 3,
    keyVariables: ["coherence_disruption", "connective_density", "given_sentence_role"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.25 },
  },
];

export const DISTRACTOR_TYPES: DistractorType[] = [
  {
    id: "DIST-부분일치",
    name: "부분일치",
    description: "지문 일부 내용과 일치하지만 핵심 논지를 벗어난 선지",
    trapMechanism: "어휘 중복 활용으로 일치하는 것처럼 보임",
  },
  {
    id: "DIST-반대논지",
    name: "반대논지",
    description: "지문의 핵심 주장과 반대되는 내용을 담은 선지",
    trapMechanism: "문장 구조는 유사하나 의미가 역전됨",
  },
  {
    id: "DIST-과잉일반화",
    name: "과잉일반화",
    description: "지문의 특수한 사례를 지나치게 일반화한 선지",
    trapMechanism: "지문 내용을 확대 해석하여 그럴듯하게 보임",
  },
  {
    id: "DIST-범위이탈",
    name: "범위이탈",
    description: "지문의 범위를 벗어난 외부 정보를 포함한 선지",
    trapMechanism: "배경 지식과 결합하면 맞는 것처럼 느껴짐",
  },
  {
    id: "DIST-인과혼동",
    name: "인과혼동",
    description: "원인과 결과를 뒤바꾸거나 잘못 연결한 선지",
    trapMechanism: "지문의 인과 관계를 표면적으로만 파악할 때 혼동",
  },
  {
    id: "DIST-시제조건왜곡",
    name: "시제·조건 왜곡",
    description: "시제, 조건, 가정 등을 잘못 적용한 선지",
    trapMechanism: "문법 형태는 유사하나 의미 조건이 다름",
  },
  {
    id: "DIST-유사어휘함정",
    name: "유사어휘함정",
    description: "정답에 사용된 어휘와 유사한 어휘를 활용한 오답",
    trapMechanism: "철자나 발음이 유사한 어휘로 혼동 유발",
  },
];

/**
 * Expected correctness for each QuestionType given a learner's 5D scores (0-100).
 * Formula: sum(w_d * score_d / 100). Returns 0-1.
 */
export function predictCorrectness(
  scores: Partial<Record<VocabDimension, number>>,
  qt: QuestionType
): number {
  let sum = 0;
  for (const dim of Object.keys(qt.weights) as VocabDimension[]) {
    const s = scores[dim] ?? 0;
    sum += qt.weights[dim] * (s / 100);
  }
  return sum;
}

/** 5-bucket weakness classifier for Cytoscape class selectors. */
export type WeaknessBucket = "w0" | "w1" | "w2" | "w3" | "w4";

function bucketize(w: number): WeaknessBucket {
  if (w < 0.2) return "w0";
  if (w < 0.4) return "w1";
  if (w < 0.6) return "w2";
  if (w < 0.8) return "w3";
  return "w4";
}

/** Cytoscape-compatible element list (nodes + edges). */
export interface CyElement {
  data: {
    id: string;
    label?: string;
    parent?: string;
    source?: string;
    target?: string;
  };
  classes?: string;
}

const KV_PARENT = "cluster-keyvars";
const DIST_PARENT = "cluster-distractors";

/**
 * Build the static graph elements. Optionally annotate weakness on QuestionType nodes
 * given a learner's dimensionScores (0 = weakest, 1 = strongest).
 */
export function buildOntologyElements(
  scores?: Partial<Record<VocabDimension, number>>
): CyElement[] {
  const elements: CyElement[] = [];

  // Cluster parents (visual grouping)
  elements.push({
    data: { id: KV_PARENT, label: "key variables" },
    classes: "cluster",
  });
  elements.push({
    data: { id: DIST_PARENT, label: "distractor patterns" },
    classes: "cluster",
  });

  // QuestionType nodes
  for (const qt of QUESTION_TYPES) {
    let cls = "qt";
    if (scores) {
      const weakness = 1 - predictCorrectness(scores, qt);
      cls += ` ${bucketize(weakness)}`;
    }
    elements.push({
      data: { id: qt.id, label: qt.name },
      classes: cls,
    });
  }

  // keyVariable nodes (deduplicated) + edges
  const seenKv = new Set<string>();
  for (const qt of QUESTION_TYPES) {
    for (const kv of qt.keyVariables) {
      const kvId = `kv-${kv}`;
      if (!seenKv.has(kv)) {
        seenKv.add(kv);
        elements.push({
          data: { id: kvId, label: kv, parent: KV_PARENT },
          classes: "kv",
        });
      }
      elements.push({
        data: { id: `${qt.id}--${kvId}`, source: qt.id, target: kvId },
      });
    }
  }

  // DistractorType nodes (no edges in MVP, secondary axis)
  for (const dt of DISTRACTOR_TYPES) {
    elements.push({
      data: { id: dt.id, label: dt.name, parent: DIST_PARENT },
      classes: "dist",
    });
  }

  return elements;
}
