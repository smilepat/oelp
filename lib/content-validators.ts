/**
 * Phase 2 P-2 — Content validators for VocabCard.
 *
 * Spec: docs/02-design/phase2-p2-ebs-demo-foundation.md §2.4
 *
 * 9-rule chain ported from EBS-demo's item-validator.ts pattern but adapted
 * to OELP's VocabCard schema (4-option multiple choice, single dimension).
 *
 * V1: Structure       — itemId, word, dimension non-empty
 * V2: Options shape   — options.length === 4
 * V3: Answer valid    — answerIdx ∈ [0, 3]
 * V4: Unique options  — all options unique
 * V5: Non-empty opts  — each option non-empty
 * V6: IRT params      — b ∈ [-3, 3], discrimination ∈ [0.5, 2.5]
 * V7: Dimension valid — one of D1_Form..D5_Usage
 * V8: CEFR valid      — A1..C2
 * V9: questionText    — non-empty + length ≥ 5
 *
 * Pure functions. No I/O. Used by ContentGenerator implementations.
 */

import type { VocabCard } from "./vocabulary-pool";
import type { VocabDimension } from "./diagnostic";

export interface ValidatorIssue {
  cardIndex: number;
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidatorIssue[];
  perCard: { cardIndex: number; status: "pass" | "warn" | "fail"; issueCount: number }[];
}

const VALID_DIMS: VocabDimension[] = [
  "D1_Form",
  "D2_Meaning",
  "D3_Context",
  "D4_Network",
  "D5_Usage",
];

const VALID_CEFR = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

type Validator = (card: VocabCard, idx: number) => ValidatorIssue[];

const v1Structure: Validator = (card, idx) => {
  const issues: ValidatorIssue[] = [];
  if (!card.itemId || card.itemId.trim() === "") {
    issues.push({
      cardIndex: idx,
      code: "V1_NO_ITEM_ID",
      message: "itemId가 비어 있습니다",
      severity: "error",
    });
  }
  if (!card.word || card.word.trim() === "") {
    issues.push({
      cardIndex: idx,
      code: "V1_NO_WORD",
      message: "word가 비어 있습니다",
      severity: "error",
    });
  }
  if (!card.dimension) {
    issues.push({
      cardIndex: idx,
      code: "V1_NO_DIMENSION",
      message: "dimension이 비어 있습니다",
      severity: "error",
    });
  }
  return issues;
};

const v2OptionsShape: Validator = (card, idx) => {
  if (!Array.isArray(card.options)) {
    return [{
      cardIndex: idx,
      code: "V2_OPTIONS_NOT_ARRAY",
      message: "options가 배열이 아닙니다",
      severity: "error",
    }];
  }
  if (card.options.length !== 4) {
    return [{
      cardIndex: idx,
      code: "V2_OPTIONS_LENGTH",
      message: `options.length === 4여야 합니다 (현재: ${card.options.length})`,
      severity: "error",
    }];
  }
  return [];
};

const v3AnswerValid: Validator = (card, idx) => {
  if (typeof card.answerIdx !== "number") {
    return [{
      cardIndex: idx,
      code: "V3_ANSWER_NOT_NUMBER",
      message: "answerIdx가 숫자가 아닙니다",
      severity: "error",
    }];
  }
  if (card.answerIdx < 0 || card.answerIdx > 3 || !Number.isInteger(card.answerIdx)) {
    return [{
      cardIndex: idx,
      code: "V3_ANSWER_OUT_OF_RANGE",
      message: `answerIdx ∈ [0, 3] 이어야 합니다 (현재: ${card.answerIdx})`,
      severity: "error",
    }];
  }
  return [];
};

const v4UniqueOptions: Validator = (card, idx) => {
  if (!Array.isArray(card.options)) return [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const opt of card.options) {
    const key = opt.trim();
    if (seen.has(key) && key !== "") duplicates.add(key);
    seen.add(key);
  }
  if (duplicates.size > 0) {
    return [{
      cardIndex: idx,
      code: "V4_DUPLICATE_OPTIONS",
      message: `중복된 선택지: ${Array.from(duplicates).join(", ")}`,
      severity: "error",
    }];
  }
  return [];
};

const v5NonEmptyOptions: Validator = (card, idx) => {
  if (!Array.isArray(card.options)) return [];
  const emptyIndices: number[] = [];
  for (let i = 0; i < card.options.length; i++) {
    if (!card.options[i] || card.options[i].trim() === "") {
      emptyIndices.push(i);
    }
  }
  if (emptyIndices.length > 0) {
    return [{
      cardIndex: idx,
      code: "V5_EMPTY_OPTIONS",
      message: `빈 선택지 위치: ${emptyIndices.join(", ")}`,
      severity: "error",
    }];
  }
  return [];
};

const v6IrtParams: Validator = (card, idx) => {
  const issues: ValidatorIssue[] = [];
  if (typeof card.difficulty !== "number" || !Number.isFinite(card.difficulty)) {
    issues.push({
      cardIndex: idx,
      code: "V6_DIFFICULTY_NOT_NUMBER",
      message: "difficulty (IRT b)가 유효한 숫자가 아닙니다",
      severity: "error",
    });
  } else if (card.difficulty < -3 || card.difficulty > 3) {
    issues.push({
      cardIndex: idx,
      code: "V6_DIFFICULTY_OUT_OF_RANGE",
      message: `difficulty (IRT b) ∈ [-3, 3] 권장 (현재: ${card.difficulty.toFixed(2)})`,
      severity: "warning",
    });
  }
  if (typeof card.discrimination !== "number" || !Number.isFinite(card.discrimination)) {
    issues.push({
      cardIndex: idx,
      code: "V6_DISCRIMINATION_NOT_NUMBER",
      message: "discrimination (IRT a)가 유효한 숫자가 아닙니다",
      severity: "error",
    });
  } else if (card.discrimination < 0.5 || card.discrimination > 2.5) {
    issues.push({
      cardIndex: idx,
      code: "V6_DISCRIMINATION_OUT_OF_RANGE",
      message: `discrimination (IRT a) ∈ [0.5, 2.5] 권장 (현재: ${card.discrimination.toFixed(2)})`,
      severity: "warning",
    });
  }
  return issues;
};

const v7DimensionValid: Validator = (card, idx) => {
  if (!VALID_DIMS.includes(card.dimension)) {
    return [{
      cardIndex: idx,
      code: "V7_DIMENSION_INVALID",
      message: `dimension은 D1_Form..D5_Usage 중 하나여야 합니다 (현재: ${card.dimension})`,
      severity: "error",
    }];
  }
  return [];
};

const v8CefrValid: Validator = (card, idx) => {
  if (!VALID_CEFR.has(card.cefr)) {
    return [{
      cardIndex: idx,
      code: "V8_CEFR_INVALID",
      message: `CEFR은 A1..C2 중 하나여야 합니다 (현재: ${card.cefr})`,
      severity: "warning",
    }];
  }
  return [];
};

const v9QuestionText: Validator = (card, idx) => {
  if (!card.questionText || card.questionText.trim().length < 5) {
    return [{
      cardIndex: idx,
      code: "V9_QUESTION_TEXT_SHORT",
      message: "questionText가 비어있거나 5자 미만입니다",
      severity: "error",
    }];
  }
  return [];
};

const VALIDATORS: Validator[] = [
  v1Structure,
  v2OptionsShape,
  v3AnswerValid,
  v4UniqueOptions,
  v5NonEmptyOptions,
  v6IrtParams,
  v7DimensionValid,
  v8CefrValid,
  v9QuestionText,
];

/** Run all 9 validators on a single card. */
export function validateCard(card: VocabCard, idx = 0): ValidatorIssue[] {
  const out: ValidatorIssue[] = [];
  for (const v of VALIDATORS) out.push(...v(card, idx));
  return out;
}

/** Run all validators on a batch of cards. */
export function validateCardBatch(cards: VocabCard[]): ValidationResult {
  const allIssues: ValidatorIssue[] = [];
  const perCard: ValidationResult["perCard"] = [];

  for (let i = 0; i < cards.length; i++) {
    const issues = validateCard(cards[i], i);
    allIssues.push(...issues);
    const errors = issues.filter((iss) => iss.severity === "error");
    perCard.push({
      cardIndex: i,
      status: errors.length > 0 ? "fail" : issues.length > 0 ? "warn" : "pass",
      issueCount: issues.length,
    });
  }

  const hasErrors = allIssues.some((iss) => iss.severity === "error");
  return {
    isValid: !hasErrors,
    issues: allIssues,
    perCard,
  };
}

/**
 * Filter a batch to keep only cards that pass without errors (warnings OK).
 * Returns the kept cards + the rejection issues for analytics.
 */
export function filterValidCards(cards: VocabCard[]): {
  validCards: VocabCard[];
  rejectedIndices: number[];
  issues: ValidatorIssue[];
} {
  const result = validateCardBatch(cards);
  const rejectedIndices: number[] = [];
  const validCards: VocabCard[] = [];

  for (let i = 0; i < cards.length; i++) {
    const cardIssues = result.issues.filter((iss) => iss.cardIndex === i);
    const hasError = cardIssues.some((iss) => iss.severity === "error");
    if (hasError) {
      rejectedIndices.push(i);
    } else {
      validCards.push(cards[i]);
    }
  }

  return { validCards, rejectedIndices, issues: result.issues };
}
