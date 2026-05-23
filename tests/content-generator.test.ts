/**
 * Vitest — content-generator (Phase 2 P-2 Foundation).
 */
import { describe, test, expect } from "vitest";
import {
  LocalPoolGenerator,
  EBSCriteriaEngineGenerator,
  GeneratorChain,
  type ContentGenerator,
  type ContentGeneratorContext,
  type ContentGeneratorResult,
} from "@/lib/content-generator";

const BASE_CTX: ContentGeneratorContext = {
  qtId: "TYPE-요지",
  targetDimensions: ["D3_Context", "D4_Network"],
  difficultyRange: { min: -0.5, max: 0.7 },
  count: 10,
};

describe("LocalPoolGenerator (P-2)", () => {
  test("T1: name property", () => {
    const g = new LocalPoolGenerator();
    expect(g.name).toBe("local-pool-v1");
  });

  test("T2: Returns up to ctx.count cards", async () => {
    const g = new LocalPoolGenerator();
    const result = await g.generate(BASE_CTX);
    expect(result.cards.length).toBeLessThanOrEqual(10);
    expect(result.cards.length).toBeGreaterThan(0);
  });

  test("T3: All returned cards have dimensions ⊂ targetDimensions", async () => {
    const g = new LocalPoolGenerator();
    const result = await g.generate(BASE_CTX);
    for (const card of result.cards) {
      expect(BASE_CTX.targetDimensions).toContain(card.dimension);
    }
  });

  test("T4: excludeItemIds filter respected", async () => {
    const g = new LocalPoolGenerator();
    const first = await g.generate(BASE_CTX);
    if (first.cards.length === 0) return; // skip if no candidates
    const excludeId = first.cards[0].itemId;
    const second = await g.generate({ ...BASE_CTX, excludeItemIds: [excludeId] });
    for (const card of second.cards) {
      expect(card.itemId).not.toBe(excludeId);
    }
  });

  test("T5: Difficulty within window (after possible expansion)", async () => {
    const g = new LocalPoolGenerator();
    const result = await g.generate(BASE_CTX);
    for (const card of result.cards) {
      // After expansion: ±0.6 buffer allowed
      expect(card.difficulty).toBeGreaterThanOrEqual(BASE_CTX.difficultyRange.min - 0.6);
      expect(card.difficulty).toBeLessThanOrEqual(BASE_CTX.difficultyRange.max + 0.6);
    }
  });

  test("T6: Generator name in result", async () => {
    const g = new LocalPoolGenerator();
    const result = await g.generate(BASE_CTX);
    expect(result.generator).toBe("local-pool-v1");
  });
});

describe("EBSCriteriaEngineGenerator (P-2 stub)", () => {
  test("T1: name property", () => {
    const g = new EBSCriteriaEngineGenerator("https://example.com");
    expect(g.name).toBe("ebs-criteria-engine-v1");
  });

  test("T2: No endpoint → EBS_NOT_CONFIGURED error", async () => {
    const g = new EBSCriteriaEngineGenerator();
    const result = await g.generate(BASE_CTX);
    expect(result.cards).toEqual([]);
    expect(result.issues.some((i) => i.code === "EBS_NOT_CONFIGURED")).toBe(true);
  });

  test("T3: With endpoint + unreachable host → EBS_FETCH_FAILED (activated)", async () => {
    // Was a stub returning EBS_INTEGRATION_PENDING. Now real wiring (see
    // tests/ebs-generator.test.ts for full mock coverage); without a live
    // backend, fetch throws → EBS_FETCH_FAILED.
    const origFetch = global.fetch;
    global.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    try {
      const g = new EBSCriteriaEngineGenerator("https://nonexistent.invalid");
      const result = await g.generate(BASE_CTX);
      expect(result.cards).toEqual([]);
      expect(result.issues.some((i) => i.code === "EBS_FETCH_FAILED")).toBe(true);
    } finally {
      global.fetch = origFetch;
    }
  });
});

describe("GeneratorChain (P-2)", () => {
  test("T1: Empty generators array throws", () => {
    expect(() => new GeneratorChain([])).toThrow();
  });

  test("T2: Single generator name in chain.name", () => {
    const chain = new GeneratorChain([new LocalPoolGenerator()]);
    expect(chain.name).toBe("chain[local-pool-v1]");
  });

  test("T3: Multi-generator chain.name", () => {
    const chain = new GeneratorChain([
      new EBSCriteriaEngineGenerator(),
      new LocalPoolGenerator(),
    ]);
    expect(chain.name).toBe("chain[ebs-criteria-engine-v1→local-pool-v1]");
  });

  test("T4: Falls back to LocalPool when EBS returns empty", async () => {
    const chain = new GeneratorChain([
      new EBSCriteriaEngineGenerator(), // returns empty
      new LocalPoolGenerator(),
    ]);
    const result = await chain.generate(BASE_CTX);
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.generator).toBe("local-pool-v1");
  });

  test("T5: Issues accumulate across fallback hops", async () => {
    const chain = new GeneratorChain([
      new EBSCriteriaEngineGenerator(),
      new LocalPoolGenerator(),
    ]);
    const result = await chain.generate(BASE_CTX);
    // EBS_NOT_CONFIGURED + maybe local pool warnings
    expect(result.issues.some((i) => i.code === "EBS_NOT_CONFIGURED")).toBe(true);
  });

  test("T6: Throwing generator is caught and logged", async () => {
    const throwingGen: ContentGenerator = {
      name: "throws",
      async generate(): Promise<ContentGeneratorResult> {
        throw new Error("boom");
      },
    };
    const chain = new GeneratorChain([throwingGen, new LocalPoolGenerator()]);
    const result = await chain.generate(BASE_CTX);
    expect(result.cards.length).toBeGreaterThan(0); // fallback worked
    expect(result.issues.some((i) => i.code === "GENERATOR_THREW")).toBe(true);
  });
});
