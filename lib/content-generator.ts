/**
 * Phase 2 P-2 Foundation — Content Generator interface + implementations.
 *
 * Spec: docs/02-design/phase2-p2-ebs-demo-foundation.md §2
 *
 * Interface lets OELP swap between local pool and external generators
 * (EBS-demo, future LLM services) without changing the consumer.
 *
 * Foundation provides:
 *   - LocalPoolGenerator (immediate): filters/shuffles VOCAB_POOL
 *   - EBSCriteriaEngineGenerator (stub): pending Firebase config (W3+)
 *   - GeneratorChain: fallback orchestration
 */

import type { VocabCard } from "./vocabulary-pool";
import { VOCAB_POOL } from "./vocabulary-pool";
import type { VocabDimension } from "./diagnostic";
import {
  filterValidCards,
  type ValidatorIssue,
} from "./content-validators";

// ─── Public interface ──────────────────────────────────────────────

export interface ContentGeneratorContext {
  qtId: string;
  targetDimensions: VocabDimension[];
  difficultyRange: { min: number; max: number };
  count: number;
  /** Avoid these item IDs (already shown to learner this session). */
  excludeItemIds?: string[];
}

export interface ContentGeneratorResult {
  cards: VocabCard[];
  generator: string;
  issues: ValidatorIssue[];
}

export interface ContentGenerator {
  readonly name: string;
  generate(ctx: ContentGeneratorContext): Promise<ContentGeneratorResult>;
}

// ─── Helper: deterministic-friendly Fisher-Yates shuffle ────────────

function shuffleClone<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─── Implementation 1: LocalPoolGenerator ───────────────────────────

export class LocalPoolGenerator implements ContentGenerator {
  readonly name = "local-pool-v1";

  async generate(ctx: ContentGeneratorContext): Promise<ContentGeneratorResult> {
    const exclude = new Set(ctx.excludeItemIds ?? []);
    let candidates = VOCAB_POOL.filter(
      (c) =>
        ctx.targetDimensions.includes(c.dimension) &&
        c.difficulty >= ctx.difficultyRange.min &&
        c.difficulty <= ctx.difficultyRange.max &&
        !exclude.has(c.itemId)
    );

    // Window expansion if too few (mirrors lib/queue.ts behavior)
    if (candidates.length < ctx.count) {
      const wider = VOCAB_POOL.filter(
        (c) =>
          ctx.targetDimensions.includes(c.dimension) &&
          c.difficulty >= ctx.difficultyRange.min - 0.6 &&
          c.difficulty <= ctx.difficultyRange.max + 0.6 &&
          !exclude.has(c.itemId)
      );
      candidates = wider;
    }

    // Balanced sampling: per-dimension slots + shuffle
    const slotsPerDim = Math.ceil(ctx.count / ctx.targetDimensions.length);
    const picked: VocabCard[] = [];
    for (const dim of ctx.targetDimensions) {
      const dimCandidates = candidates.filter((c) => c.dimension === dim);
      const shuffled = shuffleClone(dimCandidates);
      picked.push(...shuffled.slice(0, slotsPerDim));
    }
    const cards = picked.slice(0, ctx.count);

    // Validate and filter
    const { validCards, issues } = filterValidCards(cards);
    return { cards: validCards, generator: this.name, issues };
  }
}

// ─── Implementation 2: EBSCriteriaEngineGenerator (stub) ────────────

export class EBSCriteriaEngineGenerator implements ContentGenerator {
  readonly name = "ebs-criteria-engine-v1";

  constructor(
    /** EBS-demo API base URL, e.g. https://ebs-demo.vercel.app */
    private endpoint?: string
  ) {}

  async generate(ctx: ContentGeneratorContext): Promise<ContentGeneratorResult> {
    void ctx; // referenced for future implementation
    if (!this.endpoint) {
      return {
        cards: [],
        generator: this.name,
        issues: [
          {
            cardIndex: -1,
            code: "EBS_NOT_CONFIGURED",
            message: "EBSCriteriaEngineGenerator: endpoint not provided (set NEXT_PUBLIC_EBS_DEMO_URL)",
            severity: "error",
          },
        ],
      };
    }

    // TODO (W3-W4): wire to EBS-demo's synthesize API
    // 1. POST { qtId, targetDimensions, difficultyRange, count } to {endpoint}/api/generate
    // 2. Parse response into VocabCard[] shape
    // 3. Apply EBS-demo's 12-rule item-validator (W6)
    // 4. Apply OELP's 9 validators via filterValidCards
    // 5. Return validated cards + accumulated issues
    return {
      cards: [],
      generator: this.name,
      issues: [
        {
          cardIndex: -1,
          code: "EBS_INTEGRATION_PENDING",
          message: "EBSCriteriaEngineGenerator: integration pending W3 (Firebase config + REST wiring)",
          severity: "error",
        },
      ],
    };
  }
}

// ─── Generator Chain (fallback orchestration) ───────────────────────

export class GeneratorChain implements ContentGenerator {
  readonly name: string;

  constructor(private generators: ContentGenerator[]) {
    if (generators.length === 0) {
      throw new Error("GeneratorChain requires at least one generator");
    }
    this.name = `chain[${generators.map((g) => g.name).join("→")}]`;
  }

  async generate(ctx: ContentGeneratorContext): Promise<ContentGeneratorResult> {
    const aggregatedIssues: ValidatorIssue[] = [];
    for (const gen of this.generators) {
      try {
        const result = await gen.generate(ctx);
        if (result.cards.length >= Math.min(ctx.count, 1)) {
          // Success — return as soon as any generator produces cards
          return {
            ...result,
            issues: [...aggregatedIssues, ...result.issues],
          };
        }
        aggregatedIssues.push(...result.issues);
      } catch (err) {
        aggregatedIssues.push({
          cardIndex: -1,
          code: "GENERATOR_THREW",
          message: `${gen.name}: ${err instanceof Error ? err.message : String(err)}`,
          severity: "error",
        });
      }
    }
    return { cards: [], generator: this.name, issues: aggregatedIssues };
  }
}

/** Default chain used by the app — EBS preferred if configured, else local. */
export function defaultGeneratorChain(): GeneratorChain {
  const ebsUrl =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_EBS_DEMO_URL : undefined;
  return new GeneratorChain([
    new EBSCriteriaEngineGenerator(ebsUrl || undefined),
    new LocalPoolGenerator(),
  ]);
}
