/**
 * @vitest-environment jsdom
 *
 * Vitest — recommendation-store additional coverage (A7++ push).
 *
 * Existing tests/recommendation-store.test.ts covers loadPosteriors +
 * reseedPosteriors basics. This file fills:
 *   - persistSessionResponses (lines 187-206)
 *   - syncFromSupabase (lines 222-226)
 *   - reseedPosteriors empty-old-posteriors path
 */
import { describe, test, expect, beforeEach } from "vitest";
import {
  loadPosteriors,
  persistSessionResponses,
  reseedPosteriors,
  syncFromSupabase,
} from "@/lib/recommendation-store";
import type { VocabDimension } from "@/lib/diagnostic";

const SCORES: Partial<Record<VocabDimension, number>> = {
  D1_Form: 70,
  D2_Meaning: 75,
  D3_Context: 50,
  D4_Network: 60,
  D5_Usage: 65,
};

beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
});

describe("recommendation-store extras (A7++)", () => {
  test("T1: persistSessionResponses bumps alpha for correct, beta for incorrect", () => {
    const before = loadPosteriors(SCORES);
    const qtId = Object.keys(before)[0];
    const initialAlpha = before[qtId].alpha;
    const initialBeta = before[qtId].beta;

    const after = persistSessionResponses(
      [
        { qtId, isCorrect: true },
        { qtId, isCorrect: true },
        { qtId, isCorrect: false },
      ],
      SCORES
    );

    expect(after[qtId].alpha).toBeCloseTo(initialAlpha + 2, 5);
    expect(after[qtId].beta).toBeCloseTo(initialBeta + 1, 5);
    expect(after[qtId].samples).toBe(before[qtId].samples + 3);
  });

  test("T2: persistSessionResponses persists across reload", () => {
    const qtId = "TYPE-요지";
    persistSessionResponses([{ qtId, isCorrect: true }], SCORES);
    const reloaded = loadPosteriors(SCORES);
    // Reloaded posteriors should reflect the +1 alpha bump
    expect(reloaded[qtId].samples).toBeGreaterThan(0);
  });

  test("T3: persistSessionResponses skips unknown QT", () => {
    const before = loadPosteriors(SCORES);
    const after = persistSessionResponses(
      [{ qtId: "TYPE-unknown", isCorrect: true }],
      SCORES
    );
    // No mutation for unknown QT
    for (const qtId of Object.keys(before)) {
      expect(after[qtId].samples).toBe(before[qtId].samples);
    }
  });

  test("T4: reseedPosteriors with empty old map → all newPriors", () => {
    const result = reseedPosteriors({}, SCORES);
    // Every QT should have a posterior
    expect(Object.keys(result).length).toBeGreaterThanOrEqual(10);
    // Samples should be 0 (fresh prior)
    for (const post of Object.values(result)) {
      expect(post.samples).toBe(0);
    }
  });

  test("T5: syncFromSupabase returns no-op when env unset", async () => {
    // process.env.NEXT_PUBLIC_SUPABASE_URL is unset in test env
    const result = await syncFromSupabase();
    expect(result.synced).toBe(0);
    expect(result.reason).toMatch(/NEXT_PUBLIC_SUPABASE_URL not configured/);
  });

  test("T6: syncFromSupabase accepts custom userId", async () => {
    const result = await syncFromSupabase("custom-user");
    expect(result.reason).toMatch(/custom-user/);
  });
});
