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

// ─── Phase 2 P-1 refinement: exploration vs exploitation ────────────────
//
// When total samples are high but unevenly distributed across QTs, pure
// Thompson sampling can get stuck never picking under-sampled QTs (cold
// branches). Exploration target surfaces "the QT we know LEAST about" so
// the UI / queue builder can offer it as an alternative every N sessions.
//
// Design choice: identify the QT with the fewest samples whose Thompson
// θ_sample is also not in the top-2 weakest (otherwise it's already covered
// by primary/alternate recommendation).

export interface ExplorationCandidate {
  questionType: QuestionType;
  samples: number;
  /** Posterior mean = α / (α + β). 0 = certain wrong, 1 = certain correct. */
  posteriorMean: number;
  /** "Information value" — variance-weighted (high var × low samples = high info). */
  informationValue: number;
}

/**
 * Find the QT we know LEAST about (highest information value if probed).
 *
 * Pure function. Independent of recommendQuestionType. Use this to
 * occasionally offer the learner an under-sampled QT as a queue alternative,
 * preventing cold-start starvation when N is high but uneven.
 *
 * Returns null if all QTs have >= maxSamplesToConsider samples (well-explored).
 *
 * `adaptive` option (default false — kept off until external learner N ≥ 200):
 *   when true, maxSamplesToConsider is computed dynamically as
 *   `max(fixed, meanSamples × ratio)` so the threshold scales with mean.
 *   Addresses R5 long-run finding (smilepat/myprojects
 *   docs/03-analysis/exploration-policy-long-run-analysis.md) where fixed
 *   cap=20 caused balance regression at N>200.
 */
export function findExplorationTarget(
  posteriors: Record<string, BetaPosterior>,
  opts: {
    maxSamplesToConsider?: number;
    excludeQtIds?: readonly string[];
    adaptive?: boolean;
    adaptiveRatio?: number;
  } = {}
): ExplorationCandidate | null {
  const fixed = opts.maxSamplesToConsider ?? 20;
  let maxSamples = fixed;
  if (opts.adaptive) {
    const ratio = opts.adaptiveRatio ?? 0.3;
    const meanSamples =
      Object.values(posteriors).reduce((s, p) => s + p.samples, 0) /
      Math.max(Object.keys(posteriors).length, 1);
    maxSamples = Math.max(fixed, meanSamples * ratio);
  }
  const exclude = new Set(opts.excludeQtIds ?? []);

  let best: ExplorationCandidate | null = null;
  for (const qt of QUESTION_TYPES) {
    if (exclude.has(qt.id)) continue;
    const post = posteriors[qt.id];
    if (!post) continue;
    if (post.samples >= maxSamples) continue;

    const sum = post.alpha + post.beta;
    const mean = post.alpha / sum;
    const variance = (post.alpha * post.beta) / (sum * sum * (sum + 1));
    // Information value: high when both variance is high AND samples low.
    // Damped by (1 + samples) so already-sampled QTs lose priority.
    const informationValue = variance / (1 + post.samples);

    const candidate: ExplorationCandidate = {
      questionType: qt,
      samples: post.samples,
      posteriorMean: mean,
      informationValue,
    };
    if (!best || candidate.informationValue > best.informationValue) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Effective sample size threshold (ESS-like).
 *
 * Returns a number that tells how "well-explored" a posterior map is:
 *   - 0       = no data (just prior)
 *   - 1.0     = balanced — every QT has roughly the average samples
 *   - < 1.0   = some QTs starved
 *
 * Computed as min(samples) / mean(samples). Useful for analytics-events
 * panel to flag when exploration target should be considered.
 */
export function posteriorBalance(posteriors: Record<string, BetaPosterior>): number {
  const samples = Object.values(posteriors).map((p) => p.samples);
  if (samples.length === 0) return 0;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (mean === 0) return 0;
  const min = Math.min(...samples);
  return min / mean;
}

/**
 * Adaptive exploration policy — given current posterior balance + session
 * count, decide whether the NEXT queue should use exploration target.
 *
 * Policy (mirrors design doc §2.2):
 *   - balance < 0.1 (severe starvation) → every 2nd session use exploration
 *   - balance < 0.5 (mild starvation)   → every 4th session
 *   - balance ≥ 0.5 (well-balanced)     → exploration off (Thompson sufficient)
 *
 * `sessionNumber` is the 1-based index of the upcoming session. Caller
 * should increment monotonically across user's history.
 */
export function shouldExplore(
  balance: number,
  sessionNumber: number
): boolean {
  if (sessionNumber < 1) return false;
  if (balance < 0.1) return sessionNumber % 2 === 0;
  if (balance < 0.5) return sessionNumber % 4 === 0;
  return false;
}
