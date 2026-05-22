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
    const cards = [
      makeValidCard({ itemId: "ok1" }),
      makeValidCard({ itemId: "" }), // V1 error
      makeValidCard({ itemId: "warn1", cefr: "Z9" }), // V8 warning only
    ];
    const result = validateCardBatch(cards);
    expect(result.isValid).toBe(false);
    expect(result.perCard[0].status).toBe("pass");
    expect(result.perCard[1].status).toBe("fail");
    expect(result.perCard[2].status).toBe("warn");
  });

  test("filterValidCards: Strips error cards, keeps warnings", () => {
    const cards = [
      makeValidCard({ itemId: "ok1" }),
      makeValidCard({ itemId: "" }), // V1 error
      makeValidCard({ itemId: "warn1", cefr: "Z9" }), // V8 warning only
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
});
