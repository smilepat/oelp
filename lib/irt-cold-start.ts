/**
 * Phase 2 P-2 W5 — IRT cold-start for AI-generated cards.
 *
 * Spec: docs/02-design/phase2-p2-ebs-demo-foundation.md §3.2
 *
 * Problem: EBS-demo generated cards have no IRT b/a values. We need
 * to (a) seed reasonable initial params and (b) refine them as response
 * data accumulates.
 *
 * Approach (simple Rasch + Beta posterior):
 *   - Initial b = learner_theta (assumes generated to match learner level)
 *   - Initial a = 1.0 (standard discrimination)
 *   - As responses accumulate, update b via Bayesian Rasch with Beta(α, β)
 *     prior on per-card correctness probability
 *   - a stays at 1.0 until full 2PL MLE in Phase 3 (out of scope here)
 *
 * Pure function library. Caller owns I/O (storage of responses + cards).
 */

export interface IrtColdStartParams {
  b: number;
  a: number;
  /** Number of learner responses observed for this card */
  samples: number;
  /** "cold" → b=theta unchanged; "warming" → some data; "warm" → converged */
  status: "cold" | "warming" | "warm";
}

export interface ResponseDatum {
  theta: number; // learner's theta at time of response
  isCorrect: boolean;
}

export interface RecalibrateOpts {
  /** Strength of prior anchor to initial b (Laplace-like, default 5) */
  priorStrength?: number;
  /** Sample threshold for "warm" status (default 50) */
  warmThreshold?: number;
  /** Sample threshold to start moving from prior (default 5) */
  warmingThreshold?: number;
}

const A_DEFAULT = 1.0;

export function initialColdStartParams(learnerTheta: number): IrtColdStartParams {
  return {
    b: learnerTheta,
    a: A_DEFAULT,
    samples: 0,
    status: "cold",
  };
}

/**
 * Bayesian Rasch update for IRT b.
 *
 * Model: P(correct | theta, b) = 1 / (1 + exp(-(theta - b)))   (1PL/Rasch)
 *
 * For each response we observe `correct` from a Bernoulli(p_i) where
 * p_i depends on b. With multiple responses across different theta values,
 * we fit b via Newton-Raphson on the log-likelihood:
 *
 *   ℓ(b) = Σ_i [ y_i (theta_i - b) - log(1 + exp(theta_i - b)) ]
 *   ℓ'(b) = -Σ_i (y_i - p_i)            where p_i = σ(theta_i - b)
 *   ℓ''(b) = -Σ_i p_i (1 - p_i)
 *
 * Add ridge-like prior anchor: -priorStrength * (b - b_prior)^2 / 2
 *   gradient adjustment: + priorStrength * (b - b_prior)
 *   hessian adjustment:  + priorStrength
 *
 * Newton update: b_new = b - ℓ'(b) / ℓ''(b)
 */
function fitB(
  responses: ResponseDatum[],
  bPrior: number,
  priorStrength: number,
  maxIter = 30,
  tol = 1e-5
): number {
  let b = bPrior;
  for (let iter = 0; iter < maxIter; iter++) {
    // Likelihood gradient: dℓ/db = Σ(p - y), p = σ(theta - b)
    let grad = 0;
    let info = 0; // Fisher information = -d²ℓ/db² (positive scalar)
    for (const r of responses) {
      const p = 1 / (1 + Math.exp(b - r.theta));
      grad += p - (r.isCorrect ? 1 : 0);
      info += p * (1 - p);
    }
    // Gaussian prior gradient: d/db [-(priorStrength/2)*(b-bPrior)²] = -priorStrength*(b-bPrior)
    grad += -priorStrength * (b - bPrior);
    info += priorStrength;

    if (info < 1e-8) break;
    // Newton-Raphson maximization step: b_new = b + grad / info
    const step = grad / info;
    b += step;
    if (Math.abs(step) < tol) break;
  }
  // Clamp to reasonable IRT b range
  return Math.max(-3, Math.min(3, b));
}

export function recalibrateCard(
  initial: IrtColdStartParams,
  responses: ResponseDatum[],
  opts: RecalibrateOpts = {}
): IrtColdStartParams {
  const priorStrength = opts.priorStrength ?? 5;
  const warmThreshold = opts.warmThreshold ?? 50;
  const warmingThreshold = opts.warmingThreshold ?? 5;

  if (responses.length === 0) {
    return { ...initial };
  }

  // For cold cards: bPrior = initial.b (= learner_theta at seeding time)
  const bPrior = initial.b;
  const newB = fitB(responses, bPrior, priorStrength);

  let status: IrtColdStartParams["status"];
  if (responses.length >= warmThreshold) status = "warm";
  else if (responses.length >= warmingThreshold) status = "warming";
  else status = "cold";

  return {
    b: newB,
    a: A_DEFAULT, // 2PL MLE deferred
    samples: responses.length,
    status,
  };
}

/** Standard error of b estimate (asymptotic Fisher information). */
export function bStandardError(params: IrtColdStartParams, responses: ResponseDatum[]): number {
  if (responses.length === 0) return Infinity;
  let info = 0;
  for (const r of responses) {
    const p = 1 / (1 + Math.exp(params.b - r.theta));
    info += p * (1 - p);
  }
  return info > 0 ? 1 / Math.sqrt(info) : Infinity;
}

/**
 * Generate a recommendation for whether to expose this card more (for finer b
 * estimate) or stop using it. Used by the queue engine to balance learning
 * efficiency vs IRT calibration.
 *
 * Returns:
 *   - "expose-more": SE too high, sample more responses
 *   - "ready": SE acceptable, treat b as reliable
 *   - "retire": b estimate stable and matches learner pool poorly
 *     (heuristic: SE small AND |b - target_theta| > 1.5 for all current learners)
 */
export function exposureRecommendation(
  params: IrtColdStartParams,
  responses: ResponseDatum[],
  options: { seThreshold?: number; mismatchThreshold?: number; learnerTheta?: number } = {}
): "expose-more" | "ready" | "retire" {
  const seThreshold = options.seThreshold ?? 0.3;
  const mismatchThreshold = options.mismatchThreshold ?? 1.5;
  const se = bStandardError(params, responses);

  if (se > seThreshold) return "expose-more";
  if (
    options.learnerTheta != null &&
    Math.abs(params.b - options.learnerTheta) > mismatchThreshold
  ) {
    return "retire";
  }
  return "ready";
}
