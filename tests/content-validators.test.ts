/**
 * Vitest — content-validators (Phase 2 P-2 Foundation).
 */
import { describe, test, expect } from "vitest";
import {
  validateCard,
  validateCardBatch,
  filterValidCards,
} from "@/lib/content-validators";
import type { VocabCard } from "@/lib/vocabulary-pool";

function makeValidCard(overrides: Partial<VocabCard> = {}): VocabCard {
  return {
    itemId: "test-1",
    word: "rigorous",
    pos: "adj.",
    cefr: "B2",
    dimension: "D4_Network",
    difficulty: 0.5,
    discrimination: 1.0,
    meaningKo: "엄격한",
    questionText: '"rigorous"와 가장 유사한 의미의 단어는?',
    options: ["lenient", "rigid", "casual", "soft"],
    answerIdx: 1,
    rationaleKo: "rigorous: 엄격한",
    ...overrides,
  };
}

describe("content-validators (Phase 2 P-2)", () => {
  test("T1: Valid card produces no issues", () => {
    expect(validateCard(makeValidCard())).toEqual([]);
  });

  test("V1: Missing itemId → V1_NO_ITEM_ID error", () => {
    const issues = validateCard(makeValidCard({ itemId: "" }));
    expect(issues.some((i) => i.code === "V1_NO_ITEM_ID")).toBe(true);
    expect(issues.find((i) => i.code === "V1_NO_ITEM_ID")?.severity).toBe("error");
  });

  test("V2: Options length != 4 → V2_OPTIONS_LENGTH error", () => {
    const issues = validateCard(makeValidCard({ options: ["a", "b", "c"] }));
    expect(issues.some((i) => i.code === "V2_OPTIONS_LENGTH")).toBe(true);
  });

  test("V3: answerIdx out of range → V3_ANSWER_OUT_OF_RANGE", () => {
    const issues = validateCard(makeValidCard({ answerIdx: 4 }));
    expect(issues.some((i) => i.code === "V3_ANSWER_OUT_OF_RANGE")).toBe(true);
  });

  test("V4: Duplicate options → V4_DUPLICATE_OPTIONS", () => {
    const issues = validateCard(makeValidCard({ options: ["a", "b", "a", "d"] }));
    expect(issues.some((i) => i.code === "V4_DUPLICATE_OPTIONS")).toBe(true);
  });

  test("V5: Empty option string → V5_EMPTY_OPTIONS", () => {
    const issues = validateCard(makeValidCard({ options: ["a", "", "c", "d"] }));
    expect(issues.some((i) => i.code === "V5_EMPTY_OPTIONS")).toBe(true);
  });

  test("V6: IRT b out of [-3, 3] → V6_DIFFICULTY_OUT_OF_RANGE warning", () => {
    const issues = validateCard(makeValidCard({ difficulty: 5.0 }));
    expect(issues.some((i) => i.code === "V6_DIFFICULTY_OUT_OF_RANGE")).toBe(true);
    expect(issues.find((i) => i.code === "V6_DIFFICULTY_OUT_OF_RANGE")?.severity).toBe("warning");
  });

  test("V7: Invalid dimension → V7_DIMENSION_INVALID error", () => {
    const issues = validateCard(makeValidCard({ dimension: "D9_Fake" as unknown as VocabCard["dimension"] }));
    expect(issues.some((i) => i.code === "V7_DIMENSION_INVALID")).toBe(true);
  });

  test("V8: Invalid CEFR → V8_CEFR_INVALID warning", () => {
    const issues = validateCard(makeValidCard({ cefr: "Z9" }));
    expect(issues.some((i) => i.code === "V8_CEFR_INVALID")).toBe(true);
  });

  test("V9: Short questionText → V9_QUESTION_TEXT_SHORT", () => {
    const issues = validateCard(makeValidCard({ questionText: "??" }));
    expect(issues.some((i) => i.code === "V9_QUESTION_TEXT_SHORT")).toBe(true);
  });

  test("validateCardBatch: Mixed batch reports per-card status", () => {
    // Each card needs unique questionText to avoid V12 batch-duplicate flag
    const cards = [
      makeValidCard({ itemId: "ok1", questionText: "첫 번째 질문은 무엇인가요?" }),
      makeValidCard({ itemId: "", questionText: "두 번째 질문은 무엇인가요?" }), // V1 error
      makeValidCard({ itemId: "warn1", cefr: "Z9", questionText: "세 번째 질문은 무엇인가요?" }), // V8 warning
    ];
    const result = validateCardBatch(cards);
    expect(result.isValid).toBe(false);
    expect(result.perCard[0].status).toBe("pass");
    expect(result.perCard[1].status).toBe("fail");
    expect(result.perCard[2].status).toBe("warn");
  });

  test("filterValidCards: Strips error cards, keeps warnings", () => {
    const cards = [
      makeValidCard({ itemId: "ok1", questionText: "첫 번째 질문은 무엇인가요?" }),
      makeValidCard({ itemId: "", questionText: "두 번째 질문은 무엇인가요?" }), // V1 error
      makeValidCard({ itemId: "warn1", cefr: "Z9", questionText: "세 번째 질문은 무엇인가요?" }), // V8 warning
    ];
    const { validCards, rejectedIndices, issues } = filterValidCards(cards);
    expect(validCards).toHaveLength(2);
    expect(rejectedIndices).toEqual([1]);
    expect(issues.length).toBeGreaterThan(0);
  });

  test("Real VOCAB_POOL sample passes validation", async () => {
    const { VOCAB_POOL } = await import("@/lib/vocabulary-pool");
    const sample = VOCAB_POOL.slice(0, 10);
    const result = validateCardBatch(sample);
    // Real pool cards must pass — if this breaks, it's a regression in build-vocab-pool.mjs
    expect(result.isValid).toBe(true);
  });

  // ─── V10-V12 (W6 EBS-demo porting) ────────────────────────────────

  test("V10: D2_Meaning with English options → V10_OPTIONS_LANG_MISMATCH", () => {
    // D2 expects Korean translations; English options should warn
    const issues = validateCard(makeValidCard({
      dimension: "D2_Meaning",
      options: ["complex", "simple", "narrow", "broad"],
    }));
    expect(issues.some((i) => i.code === "V10_OPTIONS_LANG_MISMATCH")).toBe(true);
    expect(issues.find((i) => i.code === "V10_OPTIONS_LANG_MISMATCH")?.severity).toBe("warning");
  });

  test("V10: D4_Network with Korean options → V10_OPTIONS_LANG_MISMATCH", () => {
    // D4 expects English synonyms; Korean options should warn
    const issues = validateCard(makeValidCard({
      dimension: "D4_Network",
      options: ["엄격한", "관대한", "정중한", "무관심한"],
    }));
    expect(issues.some((i) => i.code === "V10_OPTIONS_LANG_MISMATCH")).toBe(true);
  });

  test("V10: D1_Form with English spelling options → PASS (no V10 issue)", () => {
    const issues = validateCard(makeValidCard({
      dimension: "D1_Form",
      options: ["psychology", "psicology", "psychology2", "psicology2"],
    }));
    expect(issues.some((i) => i.code === "V10_OPTIONS_LANG_MISMATCH")).toBe(false);
  });

  test("V11: questionText without Hangul → V11_QUESTION_NOT_KOREAN warning", () => {
    const issues = validateCard(makeValidCard({
      questionText: "Which of the following is correct?",
    }));
    expect(issues.some((i) => i.code === "V11_QUESTION_NOT_KOREAN")).toBe(true);
    expect(issues.find((i) => i.code === "V11_QUESTION_NOT_KOREAN")?.severity).toBe("warning");
  });

  test("V11: questionText with Korean → PASS (no V11 issue)", () => {
    const issues = validateCard(makeValidCard({
      questionText: '다음 중 "rigorous"의 의미로 올바른 것은?',
    }));
    expect(issues.some((i) => i.code === "V11_QUESTION_NOT_KOREAN")).toBe(false);
  });

  test("V12: Batch with duplicate questionText → V12_DUPLICATE_STEM", () => {
    const cards = [
      makeValidCard({ itemId: "a", questionText: "동일한 질문입니다" }),
      makeValidCard({ itemId: "b", questionText: "동일한 질문입니다" }),
      makeValidCard({ itemId: "c", questionText: "다른 질문입니다" }),
    ];
    const result = validateCardBatch(cards);
    const v12Issues = result.issues.filter((i) => i.code === "V12_DUPLICATE_STEM");
    expect(v12Issues.length).toBe(2); // cards a and b both flagged
    expect(v12Issues.map((i) => i.cardIndex).sort()).toEqual([0, 1]);
  });

  test("V12: Case-insensitive + trim", () => {
    const cards = [
      makeValidCard({ itemId: "a", questionText: "  Hello  " }),
      makeValidCard({ itemId: "b", questionText: "hello" }),
    ];
    const result = validateCardBatch(cards);
    expect(result.issues.some((i) => i.code === "V12_DUPLICATE_STEM")).toBe(true);
  });

  test("V12: Empty questionText not counted as duplicate", () => {
    const cards = [
      makeValidCard({ itemId: "a", questionText: "" }), // also V9 error
      makeValidCard({ itemId: "b", questionText: "" }),
    ];
    const result = validateCardBatch(cards);
    expect(result.issues.some((i) => i.code === "V12_DUPLICATE_STEM")).toBe(false);
  });
});
