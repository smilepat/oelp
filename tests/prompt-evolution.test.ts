/**
 * Vitest — lib/prompt-evolution.ts (PR-8 of p2a-ontology).
 */
import { describe, test, expect } from "vitest";
import {
  analyseBatch,
  proposePromptAdjustments,
} from "@/lib/prompt-evolution";
import type { ValidatorIssue } from "@/lib/content-validators";
import type { ContentGeneratorResult } from "@/lib/content-generator";

function mkResult(
  cards: number,
  issues: ValidatorIssue[]
): ContentGeneratorResult {
  return {
    cards: Array.from({ length: cards }, (_, i) => ({
      itemId: `c${i}`,
      word: `word${i}`,
      translation: "x",
      dimension: "D2_Meaning",
      difficulty: 3,
      options: ["a", "b", "c", "d"],
      correctIndex: 0,
    })) as unknown as ContentGeneratorResult["cards"],
    generator: "test",
    issues,
  };
}

function mkIssue(
  cardIndex: number,
  code: string,
  severity: "error" | "warning" = "error"
): ValidatorIssue {
  return { cardIndex, code, message: code, severity };
}

describe("prompt-evolution — analyseBatch", () => {
  test("T1: 0 issues → failureRate 0, no top codes", () => {
    const stats = analyseBatch([mkResult(10, [])]);
    expect(stats.totalCards).toBe(10);
    expect(stats.failedCards).toBe(0);
    expect(stats.failureRate).toBe(0);
    expect(stats.topIssueCodes).toEqual([]);
  });

  test("T2: distinct cards with errors are counted once each", () => {
    const stats = analyseBatch([
      mkResult(5, [
        mkIssue(0, "missing-translation"),
        mkIssue(0, "duplicate-word"), // same card, two errors → counts once
        mkIssue(2, "missing-translation"),
      ]),
    ]);
    expect(stats.failedCards).toBe(2);
    expect(stats.failureRate).toBeCloseTo(0.4, 5);
    expect(stats.countsByCode["missing-translation"].error).toBe(2);
    expect(stats.countsByCode["duplicate-word"].error).toBe(1);
  });

  test("T3: topIssueCodes sorted by descending error count", () => {
    const stats = analyseBatch([
      mkResult(10, [
        mkIssue(0, "off-topic"),
        mkIssue(1, "off-topic"),
        mkIssue(2, "off-topic"),
        mkIssue(3, "missing-translation"),
      ]),
    ]);
    expect(stats.topIssueCodes[0]).toBe("off-topic");
    expect(stats.topIssueCodes[1]).toBe("missing-translation");
  });

  test("T4: warnings do not count toward failure rate", () => {
    const stats = analyseBatch([
      mkResult(10, [
        mkIssue(0, "x", "warning"),
        mkIssue(1, "y", "warning"),
      ]),
    ]);
    expect(stats.failureRate).toBe(0);
    expect(stats.countsByCode["x"].warning).toBe(1);
  });
});

describe("prompt-evolution — proposePromptAdjustments", () => {
  test("T5: below trigger (10%) → no diffs", () => {
    const stats = analyseBatch([
      mkResult(20, [
        mkIssue(0, "off-topic"),
        mkIssue(1, "off-topic"), // 2/20 = 10% < 15% trigger
      ]),
    ]);
    expect(proposePromptAdjustments(stats)).toEqual([]);
  });

  test("T6: above trigger, known code → diff returned (sorted by priority)", () => {
    const stats = analyseBatch([
      mkResult(10, [
        mkIssue(0, "off-topic"),
        mkIssue(1, "off-topic"),
        mkIssue(2, "off-topic"), // 3 errors ≥ MIN_ISSUES_FOR_DIFF
      ]),
    ]);
    const diffs = proposePromptAdjustments(stats);
    expect(diffs.length).toBeGreaterThanOrEqual(1);
    expect(diffs[0].priority).toBeGreaterThanOrEqual(diffs[diffs.length - 1].priority);
    // off-topic has priority 95 → should be first
    expect(diffs[0].motivatingIssues).toContain("off-topic");
  });

  test("T7: unknown code does not produce a code-specific diff, generic still emitted", () => {
    const stats = analyseBatch([
      mkResult(10, [
        mkIssue(0, "unknown-code"),
        mkIssue(1, "unknown-code"),
        mkIssue(2, "unknown-code"),
        mkIssue(3, "unknown-code"),
        mkIssue(4, "unknown-code"),
      ]),
    ]);
    const diffs = proposePromptAdjustments(stats);
    // Only the generic safety net should appear
    expect(diffs.length).toBe(1);
    expect(diffs[0].segment).toBe("post_validate");
  });

  test("T8: multiple distinct codes each above MIN_ISSUES → multiple diffs", () => {
    const stats = analyseBatch([
      mkResult(20, [
        ...Array.from({ length: 4 }, (_, i) => mkIssue(i, "off-topic")),
        ...Array.from({ length: 5 }, (_, i) => mkIssue(i + 4, "missing-translation")),
      ]),
    ]);
    const diffs = proposePromptAdjustments(stats);
    const codes = diffs.flatMap((d) => d.motivatingIssues);
    expect(codes).toContain("off-topic");
    expect(codes).toContain("missing-translation");
    // off-topic priority 95 should come before missing-translation 90
    const offTopicIdx = diffs.findIndex((d) => d.motivatingIssues.includes("off-topic"));
    const missTransIdx = diffs.findIndex((d) =>
      d.motivatingIssues.includes("missing-translation")
    );
    expect(offTopicIdx).toBeLessThan(missTransIdx);
  });
});
