/**
 * Error Pattern Analyzer — classifies a wrong answer into one of 5
 * actionable categories so that recommendations can be targeted.
 *
 * PR-7 of p2a-ontology. Pure read-only module — consumes existing
 * SessionResponseRecord shape (qtId, isCorrect, dimensionScores) plus
 * optional distractor selection, returns a category + confidence +
 * one-line reasoning string.
 *
 * 5 categories
 *   vocab_unknown      — learner didn't know one or more key words
 *   structure_misread  — sentence structure misparsed (subject/verb/scope)
 *   anaphora_lost      — pronoun/reference tracking failed across sentences
 *   discourse_drift    — couldn't follow the global flow of the passage
 *   distractor_trap    — pattern-trap on the answer choice itself
 *
 * Heuristic intent: classification accuracy on synthetic dogfood-16
 * scenarios should land ≥ 80%. Real-classifier replacement (LLM /
 * trained model) is the long-term goal; this rule-based layer is the
 * MVP and the safety baseline.
 */

import { QUESTION_TYPES, type QuestionType } from "./ontology";
import { computeLayerMasteries, type LayerMastery } from "./skill-mastery";
import type { VocabDimension } from "./diagnostic";

export type ErrorCategory =
  | "vocab_unknown"
  | "structure_misread"
  | "anaphora_lost"
  | "discourse_drift"
  | "distractor_trap";

export interface WrongAnswerInput {
  qtId: string;
  dimensionScores: Partial<Record<VocabDimension, number>>;
  /** Optional: id of the distractor pattern the learner picked (e.g. "DIST-유사어휘함정") */
  distractorPicked?: string;
}

export interface ErrorClassification {
  category: ErrorCategory;
  /** 0-1 — heuristic certainty; not a probability */
  confidence: number;
  reasoning: string;
}

/** Strong distractor signals override mastery-based inference. */
const DISTRACTOR_OVERRIDES: Record<string, { category: ErrorCategory; reasoning: string }> = {
  "DIST-유사어휘함정": {
    category: "vocab_unknown",
    reasoning: "유사어휘함정 선지 선택 — 어휘 의미 구분 실패 신호",
  },
  "DIST-시제조건왜곡": {
    category: "structure_misread",
    reasoning: "시제·조건 왜곡 선지 — 문장 구조 단위 파싱 실패",
  },
  "DIST-인과혼동": {
    category: "discourse_drift",
    reasoning: "인과혼동 선지 — 문장 간 인과 흐름 추적 실패",
  },
  "DIST-부분일치": {
    category: "distractor_trap",
    reasoning: "부분일치 선지 — 전체 일치 vs 부분 일치 변별 실패",
  },
  "DIST-반대논지": {
    category: "distractor_trap",
    reasoning: "반대논지 선지 — 의미 역전 단서 미포착",
  },
  "DIST-과잉일반화": {
    category: "distractor_trap",
    reasoning: "과잉일반화 선지 — 한정어 범위 검증 실패",
  },
  "DIST-범위이탈": {
    category: "distractor_trap",
    reasoning: "범위이탈 선지 — 지문 범위 밖 정보 흡수",
  },
};

/**
 * Mastery-based fallback. Selects the *weakest* relevant layer for the
 * given QT and returns the matching category.
 */
function classifyByMastery(
  qt: QuestionType,
  scores: Partial<Record<VocabDimension, number>>
): { category: ErrorCategory; confidence: number; reasoning: string } {
  const layers = computeLayerMasteries(scores).filter(
    (l): l is LayerMastery & { mastery: number } => typeof l.mastery === "number"
  );

  if (layers.length === 0) {
    return {
      category: "distractor_trap",
      confidence: 0.2,
      reasoning: "진단 신호 없음 — 기본 분류로 distractor_trap",
    };
  }

  layers.sort((a, b) => a.mastery - b.mastery);
  const weakest = layers[0];
  const margin = layers.length > 1 ? layers[1].mastery - weakest.mastery : 0;
  // confidence: low when weakest layer is also high (≥ 70), or when
  // margin to next layer is < 5 (ambiguous winner)
  let confidence = 0.6;
  if (weakest.mastery >= 70) confidence -= 0.2;
  if (margin >= 15) confidence += 0.2;
  if (margin < 5) confidence -= 0.1;
  confidence = Math.max(0.1, Math.min(0.95, confidence));

  const category: ErrorCategory = (() => {
    switch (weakest.layer) {
      case "V":
        return "vocab_unknown";
      case "S":
        return "structure_misread";
      case "D":
        // QT signal disambiguates D2 (anaphora) vs broader discourse drift.
        // 문장 삽입 / 순서 배열 / 무관문장 → discourse_drift heavily;
        // others lean to discourse_drift too unless QT cues anaphora.
        return qt.id === "TYPE-빈칸추론" || qt.id === "TYPE-문장삽입"
          ? "anaphora_lost"
          : "discourse_drift";
      case "R":
      case "A":
      default:
        return "distractor_trap";
    }
  })();

  return {
    category,
    confidence,
    reasoning: `${weakest.layer}-layer 최약 (${weakest.mastery.toFixed(0)}/100) → ${category}`,
  };
}

export function classifyWrongAnswer(input: WrongAnswerInput): ErrorClassification {
  const qt = QUESTION_TYPES.find((q) => q.id === input.qtId);
  if (!qt) {
    return {
      category: "distractor_trap",
      confidence: 0.05,
      reasoning: `unknown qtId "${input.qtId}" — 기본 분류`,
    };
  }

  // 1. Strong distractor signal wins
  if (input.distractorPicked && DISTRACTOR_OVERRIDES[input.distractorPicked]) {
    const o = DISTRACTOR_OVERRIDES[input.distractorPicked];
    return { category: o.category, confidence: 0.85, reasoning: o.reasoning };
  }

  // 2. Mastery-based fallback
  return classifyByMastery(qt, input.dimensionScores);
}

/** Aggregate counts for a list of wrong answers. */
export function aggregateErrorCategories(
  inputs: WrongAnswerInput[]
): Record<ErrorCategory, number> {
  const counts: Record<ErrorCategory, number> = {
    vocab_unknown: 0,
    structure_misread: 0,
    anaphora_lost: 0,
    discourse_drift: 0,
    distractor_trap: 0,
  };
  for (const w of inputs) {
    const c = classifyWrongAnswer(w);
    counts[c.category]++;
  }
  return counts;
}
