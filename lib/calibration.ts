/**
 * Phase 2 P-1 W5 — Ridge regression calibration for dimension-mapping weights.
 *
 * Spec: phase2-p1-recommendation-v2.md §2.2
 *
 * Idea:
 *   For each QuestionType j, learn w[j, d] (d in D2-D5) from accumulated
 *   learner responses. D1_Form is fixed at 0.05 (vocab-level absorption).
 *
 * Model:
 *   acc[i,j] = Σ_d w[j,d] × score[i,d] / 100 + ε
 *
 * Loss (ridge regression with prior anchor):
 *   L(w) = Σ_i (acc[i,j] - pred)² + λ ||w - w_prior||²
 *
 * Closed-form solution:
 *   w = (X'X + λI)⁻¹ (X'y + λ w_prior)
 *
 * Constraints (post-processing):
 *   - w[j, d] ≥ 0 (clip negatives)
 *   - Σ w[j, d] over D2-D5 = 0.95 (normalize after clip)
 *   - D1_Form = 0.05 (prepended)
 *
 * Pure function. Caller controls when to run (typically weekly batch, W6).
 */

import type { VocabDimension } from "./diagnostic";
import { QUESTION_TYPES } from "./ontology";

// ─── Public types ───────────────────────────────────────────────────

export interface CalibrationResponse {
  qtId: string;
  dimensionScores: Partial<Record<VocabDimension, number>>;
  isCorrect: boolean;
}

export interface CalibrationInput {
  responses: CalibrationResponse[];
  priorWeights: Record<string, Record<VocabDimension, number>>;
}

export interface CalibrationResult {
  /** Updated weights — same shape as priorWeights */
  weights: Record<string, Record<VocabDimension, number>>;
  /** Number of responses seen per QT */
  perQTSampleCount: Record<string, number>;
  /** Algorithm flag per QT */
  perQTAlgorithm: Record<string, "ridge-v1" | "prior-fallback">;
  /** Sum of squared diffs (D2-D5) from prior — used for monitoring + auto-rollback */
  perQTDivergence: Record<string, number>;
  /** Overall metadata */
  meta: {
    lambda: number;
    minSamplesPerQT: number;
    qtsCalibrated: number;
    qtsFallback: number;
    runAt: string;
  };
}

export interface CalibrateOpts {
  /** Ridge penalty (anchor to prior). Default 0.1. */
  lambda?: number;
  /** Per-QT response threshold. Default 30. */
  minSamplesPerQT?: number;
}

// ─── Calibration entry point ────────────────────────────────────────

const D2_D5: VocabDimension[] = ["D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];
const D1_FIXED = 0.05;

export function calibrateWeights(
  input: CalibrationInput,
  opts: CalibrateOpts = {}
): CalibrationResult {
  const lambda = opts.lambda ?? 0.1;
  const minSamplesPerQT = opts.minSamplesPerQT ?? 30;

  // Bucket responses by qtId
  const byQT: Record<string, CalibrationResponse[]> = {};
  for (const r of input.responses) {
    (byQT[r.qtId] ||= []).push(r);
  }

  const weights: Record<string, Record<VocabDimension, number>> = {};
  const perQTSampleCount: Record<string, number> = {};
  const perQTAlgorithm: Record<string, "ridge-v1" | "prior-fallback"> = {};
  const perQTDivergence: Record<string, number> = {};
  let qtsCalibrated = 0;
  let qtsFallback = 0;

  for (const qt of QUESTION_TYPES) {
    const responses = byQT[qt.id] ?? [];
    const prior = input.priorWeights[qt.id];
    perQTSampleCount[qt.id] = responses.length;

    if (responses.length < minSamplesPerQT || !prior) {
      weights[qt.id] = prior ?? defaultWeights();
      perQTAlgorithm[qt.id] = "prior-fallback";
      perQTDivergence[qt.id] = 0;
      qtsFallback++;
      continue;
    }

    const fitted = ridgeFit4d(responses, prior, lambda);
    weights[qt.id] = fitted.weights;
    perQTAlgorithm[qt.id] = "ridge-v1";
    perQTDivergence[qt.id] = fitted.divergence;
    qtsCalibrated++;
  }

  return {
    weights,
    perQTSampleCount,
    perQTAlgorithm,
    perQTDivergence,
    meta: {
      lambda,
      minSamplesPerQT,
      qtsCalibrated,
      qtsFallback,
      runAt: new Date().toISOString(),
    },
  };
}

function defaultWeights(): Record<VocabDimension, number> {
  return { D1_Form: 0.05, D2_Meaning: 0.2375, D3_Context: 0.2375, D4_Network: 0.2375, D5_Usage: 0.2375 };
}

// ─── Ridge fit on D2-D5 ─────────────────────────────────────────────

interface RidgeFitResult {
  weights: Record<VocabDimension, number>;
  divergence: number;
}

function ridgeFit4d(
  responses: CalibrationResponse[],
  prior: Record<VocabDimension, number>,
  lambda: number
): RidgeFitResult {
  // X: n × 4 (D2, D3, D4, D5 scores / 100), y: n × 1 (correctness)
  const X: number[][] = [];
  const y: number[] = [];
  for (const r of responses) {
    const row: number[] = D2_D5.map((d) => (r.dimensionScores[d] ?? 0) / 100);
    X.push(row);
    y.push(r.isCorrect ? 1 : 0);
  }

  // Prior vector for D2-D5 (we calibrate only these)
  const wPrior: number[] = D2_D5.map((d) => prior[d] ?? 0.2375);

  // Compute X'X (4×4) and X'y (4×1)
  const Xt = transpose(X);
  const XtX = matmul(Xt, X);
  const Xty = matvec(Xt, y);

  // (X'X + λI)
  const Areg: number[][] = XtX.map((row, i) => row.map((v, j) => v + (i === j ? lambda : 0)));
  // (X'y + λ w_prior)
  const breg: number[] = Xty.map((v, i) => v + lambda * wPrior[i]);

  // Solve A w = b → w = A⁻¹ b
  const Ainv = inverse(Areg);
  const wRaw = matvec(Ainv, breg);

  // Post-process: clip non-negative
  const wClipped = wRaw.map((v) => Math.max(0, v));
  // Normalize so sum = 0.95 (D2-D5 share, D1 takes 0.05)
  const sum = wClipped.reduce((s, v) => s + v, 0);
  const wNormalized = sum > 0
    ? wClipped.map((v) => (v / sum) * 0.95)
    : wPrior.slice(); // fallback if degenerate

  const weights: Record<VocabDimension, number> = {
    D1_Form: D1_FIXED,
    D2_Meaning: wNormalized[0],
    D3_Context: wNormalized[1],
    D4_Network: wNormalized[2],
    D5_Usage: wNormalized[3],
  };

  // Divergence: sum of squared diffs from prior
  let div = 0;
  for (let i = 0; i < D2_D5.length; i++) {
    const diff = wNormalized[i] - wPrior[i];
    div += diff * diff;
  }

  return { weights, divergence: div };
}

// ─── Linear algebra ─────────────────────────────────────────────────

function transpose(M: number[][]): number[][] {
  if (M.length === 0) return [];
  const rows = M.length;
  const cols = M[0].length;
  const out: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) out[j][i] = M[i][j];
  }
  return out;
}

function matmul(A: number[][], B: number[][]): number[][] {
  const rows = A.length;
  const inner = B.length;
  const cols = B[0].length;
  const out: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < inner; k++) {
      const aik = A[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < cols; j++) out[i][j] += aik * B[k][j];
    }
  }
  return out;
}

function matvec(A: number[][], v: number[]): number[] {
  const rows = A.length;
  const cols = v.length;
  const out: number[] = new Array(rows).fill(0);
  for (let i = 0; i < rows; i++) {
    let s = 0;
    for (let j = 0; j < cols; j++) s += A[i][j] * v[j];
    out[i] = s;
  }
  return out;
}

/** Gauss-Jordan elimination for n×n matrix inverse. Throws on singular. */
function inverse(M: number[][]): number[][] {
  const n = M.length;
  // Augmented matrix [M | I]
  const a: number[][] = M.map((row, i) =>
    row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  );

  for (let i = 0; i < n; i++) {
    // Partial pivoting
    let pivot = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > Math.abs(a[pivot][i])) pivot = k;
    }
    if (pivot !== i) [a[i], a[pivot]] = [a[pivot], a[i]];

    const div = a[i][i];
    if (Math.abs(div) < 1e-12) throw new Error("inverse: singular matrix");
    for (let j = 0; j < 2 * n; j++) a[i][j] /= div;

    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = a[k][i];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[k][j] -= factor * a[i][j];
    }
  }

  return a.map((row) => row.slice(n));
}
