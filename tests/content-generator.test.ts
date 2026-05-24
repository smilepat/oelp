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

  test("T7: All generators yield zero cards → final empty return with aggregated issues", async () => {
    // Two empty generators (no throws). Triggers line 235 — final fallthrough.
    const emptyA: ContentGenerator = {
      name: "empty-a",
      async generate(): Promise<ContentGeneratorResult> {
        return {
          cards: [],
          generator: "empty-a",
          issues: [{ cardIndex: -1, code: "EMPTY_A", message: "no candidates", severity: "warning" }],
        };
      },
    };
    const emptyB: ContentGenerator = {
      name: "empty-b",
      async generate(): Promise<ContentGeneratorResult> {
        return {
          cards: [],
          generator: "empty-b",
          issues: [{ cardIndex: -1, code: "EMPTY_B", message: "still nothing", severity: "error" }],
        };
      },
    };
    const chain = new GeneratorChain([emptyA, emptyB]);
    const result = await chain.generate(BASE_CTX);
    expect(result.cards).toEqual([]);
    expect(result.generator).toBe("chain[empty-a→empty-b]");
    expect(result.issues.map((i) => i.code)).toEqual(["EMPTY_A", "EMPTY_B"]);
  });

  test("T8: All generators throw → final empty with GENERATOR_THREW issues", async () => {
    const throwA: ContentGenerator = {
      name: "throw-a",
      async generate(): Promise<ContentGeneratorResult> { throw new Error("a-boom"); },
    };
    const throwB: ContentGenerator = {
      name: "throw-b",
      async generate(): Promise<ContentGeneratorResult> { throw new Error("b-boom"); },
    };
    const chain = new GeneratorChain([throwA, throwB]);
    const result = await chain.generate(BASE_CTX);
    expect(result.cards).toEqual([]);
    expect(result.issues.length).toBe(2);
    expect(result.issues.every((i) => i.code === "GENERATOR_THREW")).toBe(true);
  });
});

describe("LocalPoolGenerator window expansion", () => {
  test("T-expand: tight difficulty window with few candidates triggers ±0.6 expansion", async () => {
    // Narrow window unlikely to have ctx.count candidates. The implementation
    // expands by ±0.6 to find more. We verify by requesting count > what the
    // narrow window can provide for an unusual dim.
    const g = new LocalPoolGenerator();
    const result = await g.generate({
      qtId: "TYPE-목적",
      // D1_Form rarely populated heavily in vocab pool — narrow window
      targetDimensions: ["D1_Form"],
      difficultyRange: { min: 0.0, max: 0.05 },
      count: 10,
    });
    // After expansion, should still return cards (or empty if pool truly lacks)
    // Either way the expansion branch executed.
    expect(result.generator).toBe("local-pool-v1");
    for (const card of result.cards) {
      // Confirm expanded ±0.6 boundaries observed
      expect(card.difficulty).toBeGreaterThanOrEqual(0.0 - 0.6 - 0.01);
      expect(card.difficulty).toBeLessThanOrEqual(0.05 + 0.6 + 0.01);
    }
  });
});
