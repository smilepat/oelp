/**
 * Vitest — buildQueueV3 (P-2 W4 generator integration).
 */
import { describe, test, expect } from "vitest";
import { buildQueueV3 } from "@/lib/queue";
import {
  LocalPoolGenerator,
  EBSCriteriaEngineGenerator,
  GeneratorChain,
} from "@/lib/content-generator";
import { initialPosteriors } from "@/lib/recommendation";
import { QUESTION_TYPES } from "@/lib/ontology";
import { DEMO_DIAGNOSTIC } from "@/lib/diagnostic";

describe("buildQueueV3 (P-2 W4)", () => {
  test("T1: With LocalPoolGenerator → 10 cards, generator name local-pool-v1", async () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = await buildQueueV3(DEMO_DIAGNOSTIC, posts, new LocalPoolGenerator());
    expect(plan.cards.length).toBeLessThanOrEqual(10);
    expect(plan.cards.length).toBeGreaterThan(0);
    expect(plan.generator).toBe("local-pool-v1");
  });

  test("T2: V3 preserves V2 fields (confidence, algorithm, alternate)", async () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = await buildQueueV3(DEMO_DIAGNOSTIC, posts, new LocalPoolGenerator());
    expect(plan.confidence).toBe("low"); // rule-v1-fallback when no samples
    expect(plan.algorithm).toBe("rule-v1-fallback");
    expect(plan.targetQuestionType).toBeDefined();
    expect(plan.alternateQuestionType).toBeDefined();
    expect(plan.targetQuestionType.id).not.toBe(plan.alternateQuestionType.id);
  });

  test("T3: Thompson sampling activates with sufficient posteriors", async () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    posts["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 2, beta: 30, samples: 30 };
    posts["TYPE-순서배열"] = { qtId: "TYPE-순서배열", alpha: 30, beta: 2, samples: 30 };
    const plan = await buildQueueV3(DEMO_DIAGNOSTIC, posts, new LocalPoolGenerator());
    expect(plan.algorithm).toBe("thompson-v2");
  });

  test("T4: targetDimensions = top-2 weights", async () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = await buildQueueV3(DEMO_DIAGNOSTIC, posts, new LocalPoolGenerator());
    const dimsRanked = Object.entries(plan.targetQuestionType.weights)
      .sort((a, b) => b[1] - a[1])
      .map(([d]) => d);
    expect(plan.targetDimensions).toEqual(dimsRanked.slice(0, 2));
  });

  test("T5: Cards dimensions ⊂ targetDimensions", async () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = await buildQueueV3(DEMO_DIAGNOSTIC, posts, new LocalPoolGenerator());
    for (const c of plan.cards) {
      expect(plan.targetDimensions).toContain(c.dimension);
    }
  });

  test("T6: GeneratorChain — EBS stub fallback to LocalPool", async () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const chain = new GeneratorChain([
      new EBSCriteriaEngineGenerator(), // empty endpoint
      new LocalPoolGenerator(),
    ]);
    const plan = await buildQueueV3(DEMO_DIAGNOSTIC, posts, chain);
    expect(plan.generator).toBe("local-pool-v1");
    expect(plan.generatorIssues.some((i) => i.code === "EBS_NOT_CONFIGURED")).toBe(true);
  });

  test("T7: excludeItemIds excluded from cards", async () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const first = await buildQueueV3(DEMO_DIAGNOSTIC, posts, new LocalPoolGenerator());
    if (first.cards.length === 0) return;
    const excludeId = first.cards[0].itemId;
    const second = await buildQueueV3(
      DEMO_DIAGNOSTIC,
      posts,
      new LocalPoolGenerator(),
      { excludeItemIds: [excludeId] }
    );
    for (const c of second.cards) {
      expect(c.itemId).not.toBe(excludeId);
    }
  });

  test("T8: generatorIssues array always present (empty when clean)", async () => {
    const posts = initialPosteriors(DEMO_DIAGNOSTIC.dimensionScores);
    const plan = await buildQueueV3(DEMO_DIAGNOSTIC, posts, new LocalPoolGenerator());
    expect(Array.isArray(plan.generatorIssues)).toBe(true);
    // VOCAB_POOL cards are all valid → no issues
    expect(plan.generatorIssues.filter((i) => i.severity === "error")).toHaveLength(0);
  });
});
