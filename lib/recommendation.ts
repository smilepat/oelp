/**
 * Phase 2 P-1 Recommendation v2 — Thompson sampling for QuestionType selection.
 *
 * Spec: smilepat/myprojects/docs/02-design/phase2-p1-recommendation-v2.md §2.1
 *
 * Each QuestionType is modeled as a Beta(α, β) posterior over learner mastery.
 *   - α grows with correct responses, β with wrong ones.
 *   - Prior is seeded from `predictCorrectness(scores, qt)` so day-1 behavior
 *     matches the rule engine without data.
 *
 * Selection: sample θ_qt ~ Beta, then pick argmin θ (= weakest by sample).
 * Confidence: posterior variance threshold (high / mid / low).
 *
 * Pure functions — no I/O. Storage layer (W2) lives in lib/recommendation-store.ts.
 */

import type { VocabDimension } from "./diagnostic";
import { QUESTION_TYPES, predictCorrectness, type QuestionType } from "./ontology";

// ─── Beta posterior ─────────────────────────────────────────────────

export interface BetaPosterior {
  /** QuestionType id */
  qtId: string;
  alpha: number;
  beta: number;
  /** Total response count = α + β - prior — useful for "samples seen" UI */
  samples: number;
}

export type ConfidenceLevel = "low" | "mid" | "high";

/** Bayesian update — applied per response. */
export function updatePosterior(prev: BetaPosterior, isCorrect: boolean): BetaPosterior {
  return {
    qtId: prev.qtId,
    alpha: prev.alpha + (isCorrect ? 1 : 0),
    beta: prev.beta + (isCorrect ? 0 : 1),
    samples: prev.samples + 1,
  };
}

/**
 * Seed prior from diagnostic — anchors day-1 recommendations to the rule engine.
 * Strength `5` means the prior is worth ~5 observations before data overrides it.
 */
export function priorFromDiagnostic(
  qt: QuestionType,
  scores: Partial<Record<VocabDimension, number>>,
  strength = 5
): BetaPosterior {
  const p = predictCorrectness(scores, qt);
  return {
    qtId: qt.id,
    alpha: 1 + p * strength,
    beta: 1 + (1 - p) * strength,
    samples: 0,
  };
}

/** Build full posterior map from a fresh diagnostic (no prior history). */
export function initialPosteriors(
  scores: Partial<Record<VocabDimension, number>>
): Record<string, BetaPosterior> {
  const map: Record<string, BetaPosterior> = {};
  for (const qt of QUESTION_TYPES) {
    map[qt.id] = priorFromDiagnostic(qt, scores);
  }
  return map;
}

// ─── Beta distribution sampling ─────────────────────────────────────
// Marsaglia & Tsang method via Gamma sampling: Beta(α,β) = X/(X+Y) where
// X ~ Gamma(α, 1), Y ~ Gamma(β, 1).

function sampleGamma(shape: number): number {
  // For shape < 1 use boost trick. For shape >= 1 use Marsaglia & Tsang.
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number;
    let v: number;
    do {
      // Box-Muller for standard normal
      const u1 = Math.random();
      const u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Sample θ ~ Beta(α, β). */
export function sampleBeta(alpha: number, beta: number): number {
  if (alpha <= 0 || beta <= 0) {
    throw new Error(`sampleBeta: alpha and beta must be > 0 (got ${alpha}, ${beta})`);
  }
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

// ─── Confidence from posterior variance ─────────────────────────────

/**
 * Beta(α,β) variance = αβ / ((α+β)² (α+β+1)).
 * Thresholds per design doc §2.1:
 *   - var < 0.02 → high
 *   - var < 0.05 → mid
 *   - else        → low
 */
export function posteriorConfidence(p: BetaPosterior): ConfidenceLevel {
  const sum = p.alpha + p.beta;
  const variance = (p.alpha * p.beta) / (sum * sum * (sum + 1));
  if (variance < 0.02) return "high";
  if (variance < 0.05) return "mid";
  return "low";
}

// ─── Top-level recommendation ───────────────────────────────────────

export interface RecommendationResult {
  /** Targeted weakest QuestionType (Thompson argmin θ) */
  targetQuestionType: QuestionType;
  targetThetaSample: number;
  /** Runner-up — useful when top-1 confidence is low */
  alternateQuestionType: QuestionType;
  alternateThetaSample: number;
  confidence: ConfidenceLevel;
  /** Posterior map used (for transparency / persistence) */
  posteriors: Record<string, BetaPosterior>;
  /** Algorithm tag for fallback transparency */
  algorithm: "thompson-v2" | "rule-v1-fallback";
}

export interface RecommendOpts {
  /** Below this sample count threshold, force rule-v1 behavior even when posterior data exists. */
  minSamplesForThompson?: number;
}

/**
 * Recommend the weakest QuestionType for a learner.
 *
 * Fallback policy (design §3.2):
 *   - If totalSamples < minSamplesForThompson (default 10), fall back to rule-v1.
 *     Rule-v1 returns argmin(predictCorrectness) without sampling noise.
 */
export function recommendQuestionType(
  scores: Partial<Record<VocabDimension, number>>,
  posteriors: Record<string, BetaPosterior>,
  opts: RecommendOpts = {}
): RecommendationResult {
  const minSamples = opts.minSamplesForThompson ?? 10;
  const totalSamples = Object.values(posteriors).reduce((s, p) => s + p.samples, 0);

  if (totalSamples < minSamples) {
    // Rule-v1 fallback: deterministic argmin(predictCorrectness)
    const ranked = QUESTION_TYPES.map((qt) => ({
      qt,
      p: predictCorrectness(scores, qt),
    })).sort((a, b) => a.p - b.p);
    return {
      targetQuestionType: ranked[0].qt,
      targetThetaSample: ranked[0].p,
      alternateQuestionType: ranked[1].qt,
      alternateThetaSample: ranked[1].p,
      confidence: "low",
      posteriors,
      algorithm: "rule-v1-fallback",
    };
  }

  // Thompson sampling: sample θ_qt, pick argmin θ (= weakest by sample)
  const sampled = QUESTION_TYPES.map((qt) => {
    const post = posteriors[qt.id] ?? priorFromDiagnostic(qt, scores);
    return { qt, post, theta: sampleBeta(post.alpha, post.beta) };
  }).sort((a, b) => a.theta - b.theta);

  return {
    targetQuestionType: sampled[0].qt,
    targetThetaSample: sampled[0].theta,
    alternateQuestionType: sampled[1].qt,
    alternateThetaSample: sampled[1].theta,
    confidence: posteriorConfidence(sampled[0].post),
    posteriors,
    algorithm: "thompson-v2",
  };
}

/**
 * Helper: apply a batch of responses to a posterior map.
 * Used by session-end + tests.
 */
export function applyResponses(
  prev: Record<string, BetaPosterior>,
  responses: Array<{ qtId: string; isCorrect: boolean }>
): Record<string, BetaPosterior> {
  const next: Record<string, BetaPosterior> = { ...prev };
  for (const r of responses) {
    const cur = next[r.qtId];
    if (!cur) continue;
    next[r.qtId] = updatePosterior(cur, r.isCorrect);
  }
  return next;
}
