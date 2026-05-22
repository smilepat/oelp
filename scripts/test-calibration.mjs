#!/usr/bin/env node
/**
 * Unit tests for lib/calibration.ts (ridge regression).
 *
 * Synthetic data approach: assume true weights, generate N learners with random
 * scores, compute "correct" outcome via true_w · score + noise, then verify
 * ridge fit recovers weights close to truth.
 *
 * Mirrors lib/calibration.ts inline (TS loader avoidance).
 */

import { strict as assert } from "node:assert";

// ─── Inline mirror: question types + linear algebra + calibration ────

const QUESTION_TYPES = [
  { id: "TYPE-목적", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.1, D5_Usage: 0.25 } },
  { id: "TYPE-요지", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.25, D5_Usage: 0.1 } },
  { id: "TYPE-순서배열", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.3 } },
];
const D2_D5 = ["D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];
const D1_FIXED = 0.05;

function transpose(M) { const r = M.length, c = M[0].length; const o = Array.from({ length: c }, () => new Array(r).fill(0)); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) o[j][i] = M[i][j]; return o; }
function matmul(A, B) { const r = A.length, ic = B.length, c = B[0].length; const o = Array.from({ length: r }, () => new Array(c).fill(0)); for (let i = 0; i < r; i++) for (let k = 0; k < ic; k++) { const a = A[i][k]; if (a === 0) continue; for (let j = 0; j < c; j++) o[i][j] += a * B[k][j]; } return o; }
function matvec(A, v) { const r = A.length; const o = new Array(r).fill(0); for (let i = 0; i < r; i++) { let s = 0; for (let j = 0; j < v.length; j++) s += A[i][j] * v[j]; o[i] = s; } return o; }
function inverse(M) {
  const n = M.length;
  const a = M.map((row, i) => row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(a[k][i]) > Math.abs(a[pivot][i])) pivot = k;
    if (pivot !== i) [a[i], a[pivot]] = [a[pivot], a[i]];
    const div = a[i][i];
    if (Math.abs(div) < 1e-12) throw new Error("singular");
    for (let j = 0; j < 2 * n; j++) a[i][j] /= div;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = a[k][i];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[k][j] -= f * a[i][j];
    }
  }
  return a.map((row) => row.slice(n));
}

function ridgeFit4d(responses, prior, lambda) {
  const X = []; const y = [];
  for (const r of responses) {
    X.push(D2_D5.map((d) => (r.dimensionScores[d] ?? 0) / 100));
    y.push(r.isCorrect ? 1 : 0);
  }
  const wPrior = D2_D5.map((d) => prior[d] ?? 0.2375);
  const Xt = transpose(X);
  const XtX = matmul(Xt, X);
  const Xty = matvec(Xt, y);
  const Areg = XtX.map((row, i) => row.map((v, j) => v + (i === j ? lambda : 0)));
  const breg = Xty.map((v, i) => v + lambda * wPrior[i]);
  const Ainv = inverse(Areg);
  const wRaw = matvec(Ainv, breg);
  const wClipped = wRaw.map((v) => Math.max(0, v));
  const sum = wClipped.reduce((s, v) => s + v, 0);
  const wNormalized = sum > 0 ? wClipped.map((v) => (v / sum) * 0.95) : wPrior.slice();
  const weights = {
    D1_Form: D1_FIXED,
    D2_Meaning: wNormalized[0],
    D3_Context: wNormalized[1],
    D4_Network: wNormalized[2],
    D5_Usage: wNormalized[3],
  };
  let div = 0;
  for (let i = 0; i < D2_D5.length; i++) { const d = wNormalized[i] - wPrior[i]; div += d * d; }
  return { weights, divergence: div };
}

function calibrateWeights(input, opts = {}) {
  const lambda = opts.lambda ?? 0.1;
  const minSamplesPerQT = opts.minSamplesPerQT ?? 30;
  const byQT = {};
  for (const r of input.responses) (byQT[r.qtId] ||= []).push(r);
  const weights = {};
  const perQTSampleCount = {};
  const perQTAlgorithm = {};
  const perQTDivergence = {};
  let cal = 0, fb = 0;
  for (const qt of QUESTION_TYPES) {
    const rs = byQT[qt.id] ?? [];
    const prior = input.priorWeights[qt.id];
    perQTSampleCount[qt.id] = rs.length;
    if (rs.length < minSamplesPerQT || !prior) {
      weights[qt.id] = prior ?? { D1_Form: 0.05, D2_Meaning: 0.2375, D3_Context: 0.2375, D4_Network: 0.2375, D5_Usage: 0.2375 };
      perQTAlgorithm[qt.id] = "prior-fallback";
      perQTDivergence[qt.id] = 0;
      fb++;
      continue;
    }
    const fit = ridgeFit4d(rs, prior, lambda);
    weights[qt.id] = fit.weights;
    perQTAlgorithm[qt.id] = "ridge-v1";
    perQTDivergence[qt.id] = fit.divergence;
    cal++;
  }
  return { weights, perQTSampleCount, perQTAlgorithm, perQTDivergence, meta: { lambda, minSamplesPerQT, qtsCalibrated: cal, qtsFallback: fb, runAt: new Date().toISOString() } };
}

// ─── Synthetic data generator ────────────────────────────────────────

/**
 * Generate N responses for a given QT with known true weights.
 * Score range: [20, 90] uniform per dim.
 * isCorrect ~ Bernoulli(p) where p = true_w · score / 100.
 */
function generateResponses(qtId, trueWeights, n, noise = 0) {
  const responses = [];
  for (let i = 0; i < n; i++) {
    const scores = {};
    for (const d of D2_D5) scores[d] = 20 + Math.random() * 70;
    scores.D1_Form = 20 + Math.random() * 70;
    let p = 0;
    for (const d of D2_D5) p += trueWeights[d] * (scores[d] / 100);
    p += trueWeights.D1_Form * (scores.D1_Form / 100);
    p += (Math.random() - 0.5) * noise * 2;
    p = Math.max(0, Math.min(1, p));
    responses.push({ qtId, dimensionScores: scores, isCorrect: Math.random() < p });
  }
  return responses;
}

// ─── Tests ──────────────────────────────────────────────────────────

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
    console.log(`✗ ${name}\n   ${e.message}`);
  }
}

function priorMap() {
  const m = {};
  for (const qt of QUESTION_TYPES) m[qt.id] = { ...qt.weights };
  return m;
}

test("T1: Empty responses → all QTs fallback to prior", () => {
  const r = calibrateWeights({ responses: [], priorWeights: priorMap() });
  assert.equal(r.meta.qtsCalibrated, 0);
  assert.equal(r.meta.qtsFallback, QUESTION_TYPES.length);
  for (const qt of QUESTION_TYPES) {
    assert.equal(r.perQTAlgorithm[qt.id], "prior-fallback");
    assert.equal(r.perQTDivergence[qt.id], 0);
  }
});

test("T2: < minSamples for QT → fallback", () => {
  const responses = generateResponses("TYPE-요지", QUESTION_TYPES[1].weights, 20);
  const r = calibrateWeights({ responses, priorWeights: priorMap() }, { minSamplesPerQT: 30 });
  assert.equal(r.perQTAlgorithm["TYPE-요지"], "prior-fallback");
  assert.equal(r.perQTSampleCount["TYPE-요지"], 20);
});

test("T3: With N=300 noise-free responses, learned weights ≈ truth", () => {
  // True weights: D3 dominant
  const trueW = { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.6, D4_Network: 0.15, D5_Usage: 0.1 };
  const responses = generateResponses("TYPE-요지", trueW, 300, 0);
  const r = calibrateWeights({ responses, priorWeights: priorMap() }, { lambda: 0.01, minSamplesPerQT: 30 });
  const learned = r.weights["TYPE-요지"];
  assert.equal(r.perQTAlgorithm["TYPE-요지"], "ridge-v1");
  // D3 should be largest
  const dims = D2_D5.map((d) => ({ d, w: learned[d] })).sort((a, b) => b.w - a.w);
  assert.equal(dims[0].d, "D3_Context", `top dim should be D3, got ${dims[0].d}`);
  // D3 should be close to 0.6 (with N=300 + no noise, very close)
  assert.ok(Math.abs(learned.D3_Context - 0.6) < 0.1, `learned D3 ${learned.D3_Context} should be near 0.6`);
});

test("T4: Sum-to-1 constraint preserved", () => {
  const trueW = { D1_Form: 0.05, D2_Meaning: 0.3, D3_Context: 0.4, D4_Network: 0.15, D5_Usage: 0.1 };
  const responses = generateResponses("TYPE-요지", trueW, 200, 0.1);
  const r = calibrateWeights({ responses, priorWeights: priorMap() });
  const w = r.weights["TYPE-요지"];
  const sum = w.D1_Form + w.D2_Meaning + w.D3_Context + w.D4_Network + w.D5_Usage;
  assert.ok(Math.abs(sum - 1.0) < 0.001, `sum ${sum} should be 1.0`);
});

test("T5: D1_Form fixed at 0.05", () => {
  const trueW = { D1_Form: 0.5, D2_Meaning: 0.1, D3_Context: 0.2, D4_Network: 0.1, D5_Usage: 0.1 };
  const responses = generateResponses("TYPE-요지", trueW, 200, 0);
  const r = calibrateWeights({ responses, priorWeights: priorMap() });
  // Even with true D1=0.5 in synthetic, calibration always forces 0.05
  assert.equal(r.weights["TYPE-요지"].D1_Form, 0.05);
});

test("T6: All weights non-negative", () => {
  // High noise to potentially generate weird raw fits
  const trueW = { D1_Form: 0.05, D2_Meaning: 0.05, D3_Context: 0.7, D4_Network: 0.1, D5_Usage: 0.1 };
  const responses = generateResponses("TYPE-요지", trueW, 100, 0.3);
  const r = calibrateWeights({ responses, priorWeights: priorMap() });
  const w = r.weights["TYPE-요지"];
  for (const d of D2_D5) assert.ok(w[d] >= 0, `${d} = ${w[d]} should be ≥ 0`);
});

test("T7: High λ → closer to prior, low λ → closer to MLE", () => {
  const trueW = { D1_Form: 0.05, D2_Meaning: 0.4, D3_Context: 0.3, D4_Network: 0.15, D5_Usage: 0.1 };
  const responses = generateResponses("TYPE-요지", trueW, 100, 0.1);
  const rHigh = calibrateWeights({ responses, priorWeights: priorMap() }, { lambda: 10, minSamplesPerQT: 30 });
  const rLow = calibrateWeights({ responses, priorWeights: priorMap() }, { lambda: 0.001, minSamplesPerQT: 30 });
  // High λ: less change → smaller divergence
  // Low λ: more change → larger divergence
  assert.ok(
    rHigh.perQTDivergence["TYPE-요지"] < rLow.perQTDivergence["TYPE-요지"],
    `high-λ div ${rHigh.perQTDivergence["TYPE-요지"]} should be < low-λ ${rLow.perQTDivergence["TYPE-요지"]}`
  );
});

test("T8: Divergence > 0 when truth ≠ prior", () => {
  const trueW = { D1_Form: 0.05, D2_Meaning: 0.5, D3_Context: 0.2, D4_Network: 0.1, D5_Usage: 0.15 };
  const responses = generateResponses("TYPE-요지", trueW, 200, 0.05);
  const r = calibrateWeights({ responses, priorWeights: priorMap() }, { lambda: 0.1 });
  assert.ok(r.perQTDivergence["TYPE-요지"] > 0.01, `divergence ${r.perQTDivergence["TYPE-요지"]} should be > 0.01`);
});

test("T9: Mixed (one QT enough, others not) → partial calibration", () => {
  const r = calibrateWeights({
    responses: [
      ...generateResponses("TYPE-요지", QUESTION_TYPES[1].weights, 100),
      ...generateResponses("TYPE-목적", QUESTION_TYPES[0].weights, 5),
    ],
    priorWeights: priorMap(),
  });
  assert.equal(r.perQTAlgorithm["TYPE-요지"], "ridge-v1");
  assert.equal(r.perQTAlgorithm["TYPE-목적"], "prior-fallback");
  assert.equal(r.meta.qtsCalibrated, 1);
  assert.equal(r.meta.qtsFallback, QUESTION_TYPES.length - 1);
});

test("T10: Reproducibility — same input → same output (deterministic)", () => {
  const trueW = { D1_Form: 0.05, D2_Meaning: 0.2, D3_Context: 0.5, D4_Network: 0.15, D5_Usage: 0.1 };
  // Fixed seed via deterministic responses (not random)
  const responses = [];
  for (let i = 0; i < 100; i++) {
    const scores = { D1_Form: 50, D2_Meaning: 20 + i * 0.5, D3_Context: 30 + i * 0.4, D4_Network: 40, D5_Usage: 50 };
    let p = 0;
    for (const d of D2_D5) p += trueW[d] * (scores[d] / 100);
    p += trueW.D1_Form * (scores.D1_Form / 100);
    responses.push({ qtId: "TYPE-요지", dimensionScores: scores, isCorrect: p > 0.4 });
  }
  const r1 = calibrateWeights({ responses, priorWeights: priorMap() });
  const r2 = calibrateWeights({ responses, priorWeights: priorMap() });
  // Same input → identical output (closed-form, no Math.random)
  assert.deepEqual(r1.weights["TYPE-요지"], r2.weights["TYPE-요지"]);
});

// ─── Summary ──────────────────────────────────────────────────────

const passed = results.filter((r) => r.pass).length;
const total = results.length;
console.log(`\n${passed} / ${total} tests passed`);
if (passed < total) process.exit(1);
