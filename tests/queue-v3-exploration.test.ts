/**
 * Vitest — buildQueueV3 useExploration option (P-1 W9 integration).
 */
import { describe, test, expect } from "vitest";
import { buildQueueV3 } from "@/lib/queue";
import { LocalPoolGenerator } from "@/lib/content-generator";
import { initialPosteriors, type BetaPosterior } from "@/lib/recommendation";
import { QUESTION_TYPES } from "@/lib/ontology";
import { DEMO_DIAGNOSTIC } from "@/lib/diagnostic";

/**
 * Inflate posteriors for primary candidates so findExplorationTarget can
 * pick a different (under-sampled) QT. Without this, all QTs have 0 samples
 * → findExplorationTarget excludes the primary/alternate but might still
 * pick another QT that happens to be "well-explored" via prior (which is 0).
 */
function withInflatedSamples(scoresKey: typeof DEMO_DIAGNOSTIC.dimensionScores) {
  const posts = initialPosteriors(scoresKey);
  // Pretend primary + a few others have 50 samples; leave others at 0
  const inflated: Record<string, BetaPosterior> = { ...posts };
  let count = 0;
  for (const qt of QUESTION_TYPES) {
    if (count < 3) {
      inflated[qt.id] = { ...posts[qt.id], alpha: 30, beta: 22, samples: 50 };
      count++;
    }
  }
  return inflated;
}

describe("buildQueueV3 — exploration option (P-1 W9)", () => {
  test("T1: useExploration: false (default) → selectionMode='primary'", async () => {
    const posts = withInflatedSamples(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = await buildQueueV3(DEMO_DIAGNOSTIC, posts, new LocalPoolGenerator());
    expect(plan.selectionMode).toBe("primary");
  });

  test("T2: useExploration: true with starved QTs → selectionMode='exploration'", async () => {
    const posts = withInflatedSamples(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = await buildQueueV3(
      DEMO_DIAGNOSTIC,
      posts,
      new LocalPoolGenerator(),
      { useExploration: true }
    );
    expect(plan.selectionMode).toBe("exploration");
    // Target QT should be one of the 0-sample ones (not the inflated 3)
    const inflatedIds = QUESTION_TYPES.slice(0, 3).map((qt) => qt.id);
    expect(inflatedIds).not.toContain(plan.targetQuestionType.id);
  });

  test("T3: useExploration: true with all well-explored → falls back to primary", async () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    // Inflate every QT past maxSamplesToConsider=20
    for (const qt of QUESTION_TYPES) {
      posts[qt.id] = { ...posts[qt.id], alpha: 30, beta: 22, samples: 50 };
    }
    const plan = await buildQueueV3(
      DEMO_DIAGNOSTIC,
      posts,
      new LocalPoolGenerator(),
      { useExploration: true }
    );
    expect(plan.selectionMode).toBe("primary");
  });

  test("T4: exploration mode preserves cards count + generator metadata", async () => {
    const posts = withInflatedSamples(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = await buildQueueV3(
      DEMO_DIAGNOSTIC,
      posts,
      new LocalPoolGenerator(),
      { useExploration: true }
    );
    expect(plan.cards.length).toBeGreaterThan(0);
    expect(plan.cards.length).toBeLessThanOrEqual(10);
    expect(plan.generator).toBe("local-pool-v1");
  });

  test("T5: exploration target excludes primary + alternate (via recommendQuestionType)", async () => {
    // With all 0-sample posteriors, recommendQuestionType uses rule-v1 fallback,
    // picks weakest 2 QTs. Exploration target should be among remaining 8.
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const planPrimary = await buildQueueV3(DEMO_DIAGNOSTIC, posts, new LocalPoolGenerator());
    const planExp = await buildQueueV3(
      DEMO_DIAGNOSTIC,
      posts,
      new LocalPoolGenerator(),
      { useExploration: true }
    );
    if (planExp.selectionMode === "exploration") {
      expect(planExp.targetQuestionType.id).not.toBe(planPrimary.targetQuestionType.id);
      expect(planExp.targetQuestionType.id).not.toBe(planPrimary.alternateQuestionType.id);
    }
  });
});
