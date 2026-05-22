#!/usr/bin/env node
/**
 * Unit tests for lib/recommendation.ts (Thompson sampling).
 *
 * Without Vitest installed, this is a plain Node script using `node:assert/strict`.
 * Mirror lib/recommendation.ts logic inline (avoids TS loader) — keep in sync.
 *
 * Tests cover:
 *   T1. sampleBeta returns value in [0, 1]
 *   T2. sampleBeta mean ≈ α/(α+β) over many samples
 *   T3. updatePosterior increments α on correct, β on wrong
 *   T4. priorFromDiagnostic anchors to predictCorrectness
 *   T5. Initial posteriors: weak QT has lower α/(α+β)
 *   T6. Rule-v1 fallback when totalSamples < minSamplesForThompson
 *   T7. Thompson sampling picks weak QT more often than strong QT
 *   T8. Confidence: small variance → high, large → low
 *   T9. applyResponses updates the right keys
 *   T10. Posteriors converge after many responses
 */

import { strict as assert } from "node:assert";

// ─── Inline mirror of lib/recommendation.ts ──────────────────────────

const QUESTION_TYPES = [
  { id: "TYPE-목적", name: "목적 파악", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.1, D5_Usage: 0.25 } },
  { id: "TYPE-심경", name: "심경·분위기", weights: { D1_Form: 0.05, D2_Meaning: 0.35, D3_Context: 0.4, D4_Network: 0.1, D5_Usage: 0.1 } },
  { id: "TYPE-주장", name: "필자 주장", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.2 } },
  { id: "TYPE-요지", name: "요지 파악", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.25, D5_Usage: 0.1 } },
  { id: "TYPE-주제", name: "주제 파악", weights: { D1_Form: 0.05, D2_Meaning: 0.25, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.05 } },
  { id: "TYPE-제목", name: "제목 추론", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.35, D4_Network: 0.4, D5_Usage: 0.1 } },
  { id: "TYPE-빈칸추론", name: "빈칸 추론", weights: { D1_Form: 0.05, D2_Meaning: 0.2, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.1 } },
  { id: "TYPE-흐름무관", name: "흐름무관", weights: { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.15 } },
  { id: "TYPE-순서배열", name: "순서 배열", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.3 } },
  { id: "TYPE-문장삽입", name: "문장 삽입", weights: { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.25 } },
];

const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

function predictCorrectness(scores, qt) {
  let sum = 0;
  for (const d of DIMS) sum += qt.weights[d] * ((scores[d] ?? 0) / 100);
  return sum;
}

function updatePosterior(prev, isCorrect) {
  return {
    qtId: prev.qtId,
    alpha: prev.alpha + (isCorrect ? 1 : 0),
    beta: prev.beta + (isCorrect ? 0 : 1),
    samples: prev.samples + 1,
  };
}

function priorFromDiagnostic(qt, scores, strength = 5) {
  const p = predictCorrectness(scores, qt);
  return {
    qtId: qt.id,
    alpha: 1 + p * strength,
    beta: 1 + (1 - p) * strength,
    samples: 0,
  };
}

function initialPosteriors(scores) {
  const map = {};
  for (const qt of QUESTION_TYPES) map[qt.id] = priorFromDiagnostic(qt, scores);
  return map;
}

function sampleGamma(shape) {
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x;
    let v;
    do {
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

function sampleBeta(alpha, beta) {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

function posteriorConfidence(p) {
  const sum = p.alpha + p.beta;
  const variance = (p.alpha * p.beta) / (sum * sum * (sum + 1));
  if (variance < 0.02) return "high";
  if (variance < 0.05) return "mid";
  return "low";
}

function recommendQuestionType(scores, posteriors, opts = {}) {
  const minSamples = opts.minSamplesForThompson ?? 10;
  const totalSamples = Object.values(posteriors).reduce((s, p) => s + p.samples, 0);

  if (totalSamples < minSamples) {
    const ranked = QUESTION_TYPES.map((qt) => ({ qt, p: predictCorrectness(scores, qt) })).sort(
      (a, b) => a.p - b.p
    );
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

function applyResponses(prev, responses) {
  const next = { ...prev };
  for (const r of responses) {
    const cur = next[r.qtId];
    if (!cur) continue;
    next[r.qtId] = updatePosterior(cur, r.isCorrect);
  }
  return next;
}

// ─── Test fixtures ───────────────────────────────────────────────────

const DEMO_SCORES = {
  D1_Form: 78,
  D2_Meaning: 82,
  D3_Context: 45,
  D4_Network: 60,
  D5_Usage: 71,
};

// ─── Tests ───────────────────────────────────────────────────────────

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

test("T1: sampleBeta returns value in [0, 1]", () => {
  for (let i = 0; i < 100; i++) {
    const v = sampleBeta(2, 5);
    assert.ok(v >= 0 && v <= 1, `out of range: ${v}`);
  }
});

test("T2: sampleBeta mean ≈ α/(α+β) over 5000 samples", () => {
  const N = 5000;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += sampleBeta(3, 7);
  const mean = sum / N;
  const expected = 3 / (3 + 7);
  assert.ok(Math.abs(mean - expected) < 0.02, `mean ${mean} off expected ${expected}`);
});

test("T3: updatePosterior — correct adds α, wrong adds β", () => {
  const p0 = { qtId: "x", alpha: 2, beta: 3, samples: 0 };
  const p1 = updatePosterior(p0, true);
  assert.equal(p1.alpha, 3);
  assert.equal(p1.beta, 3);
  assert.equal(p1.samples, 1);
  const p2 = updatePosterior(p1, false);
  assert.equal(p2.alpha, 3);
  assert.equal(p2.beta, 4);
  assert.equal(p2.samples, 2);
});

test("T4: priorFromDiagnostic — Laplace-smoothed anchor to predictCorrectness", () => {
  // With strength k, α = 1 + k*p, β = 1 + k*(1-p), so mean = (1+k*p)/(2+k).
  // This is intentionally pulled toward 0.5 — Laplace smoothing avoids zero-info
  // posteriors when first observations land. Bias = (1-2p)/(2+k).
  const qt = QUESTION_TYPES.find((q) => q.id === "TYPE-요지");
  const k = 5;
  const p = priorFromDiagnostic(qt, DEMO_SCORES);
  const expectedRaw = predictCorrectness(DEMO_SCORES, qt);
  const expectedMean = (1 + k * expectedRaw) / (2 + k);
  const mean = p.alpha / (p.alpha + p.beta);
  assert.ok(Math.abs(mean - expectedMean) < 0.001, `mean ${mean} vs smoothed ${expectedMean}`);
  assert.equal(p.samples, 0);
});

test("T5: Initial posteriors — weak QT has lower mean (smaller α/(α+β))", () => {
  const posts = initialPosteriors(DEMO_SCORES);
  // 빈칸추론: D3=0.45, D4=0.2 → predict ~0.55 (D3 weak)
  // 흐름무관: D3=0.55 → predict ~0.55 (D3 weak similar)
  // 요지: D3=0.5, D4=0.25 → predict ~0.56
  // Confirm relative order: at least one weak < one strong
  const yoji = posts["TYPE-요지"];
  const yojiMean = yoji.alpha / (yoji.alpha + yoji.beta);
  const sunseo = posts["TYPE-순서배열"];
  const sunseoMean = sunseo.alpha / (sunseo.alpha + sunseo.beta);
  // 순서배열: D5=0.3 — student has D5=71 strong, so 순서배열 should be HIGHER mean
  assert.ok(sunseoMean >= yojiMean, `expected 순서배열 mean ${sunseoMean} >= 요지 ${yojiMean}`);
});

test("T6: Rule-v1 fallback when totalSamples < minSamplesForThompson", () => {
  const posts = initialPosteriors(DEMO_SCORES);
  const r = recommendQuestionType(DEMO_SCORES, posts);
  assert.equal(r.algorithm, "rule-v1-fallback");
  assert.equal(r.confidence, "low");
  // Rule-v1 always picks lowest predictCorrectness — verify
  const ranked = QUESTION_TYPES.map((qt) => ({ qt, p: predictCorrectness(DEMO_SCORES, qt) })).sort(
    (a, b) => a.p - b.p
  );
  assert.equal(r.targetQuestionType.id, ranked[0].qt.id);
});

test("T7: After 100 samples, Thompson picks weak QT majority", () => {
  // Inject artificial posteriors: 요지 is very weak (α=1, β=20), 순서배열 very strong (α=20, β=1)
  const posts = initialPosteriors(DEMO_SCORES);
  // Override
  posts["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 1, beta: 20, samples: 21 };
  posts["TYPE-순서배열"] = { qtId: "TYPE-순서배열", alpha: 20, beta: 1, samples: 21 };
  // Force total samples > 10 to use Thompson
  let yojiHits = 0;
  let sunseoHits = 0;
  for (let i = 0; i < 200; i++) {
    const r = recommendQuestionType(DEMO_SCORES, posts);
    assert.equal(r.algorithm, "thompson-v2");
    if (r.targetQuestionType.id === "TYPE-요지") yojiHits++;
    if (r.targetQuestionType.id === "TYPE-순서배열") sunseoHits++;
  }
  // 요지 should be picked ≥ 50% (vs other QTs), and 순서배열 < 5%
  assert.ok(yojiHits > 100, `요지 hits ${yojiHits} should exceed 100/200`);
  assert.ok(sunseoHits < 20, `순서배열 hits ${sunseoHits} should be < 20/200`);
});

test("T8: posteriorConfidence: high variance → low confidence", () => {
  const broad = { qtId: "x", alpha: 1, beta: 1, samples: 0 };
  // Beta(1,1) variance = 1/(4*3) = 0.083 → low
  assert.equal(posteriorConfidence(broad), "low");

  const narrow = { qtId: "x", alpha: 50, beta: 50, samples: 100 };
  // variance = 2500/(10000*101) ≈ 0.00248 → high
  assert.equal(posteriorConfidence(narrow), "high");

  const mid = { qtId: "x", alpha: 5, beta: 5, samples: 10 };
  // variance = 25/(100*11) ≈ 0.0227 → mid (threshold .02 to .05)
  assert.equal(posteriorConfidence(mid), "mid");
});

test("T9: applyResponses updates correct keys, ignores unknown", () => {
  const posts = initialPosteriors(DEMO_SCORES);
  const before = JSON.parse(JSON.stringify(posts["TYPE-요지"]));
  const next = applyResponses(posts, [
    { qtId: "TYPE-요지", isCorrect: true },
    { qtId: "TYPE-요지", isCorrect: false },
    { qtId: "UNKNOWN-QT", isCorrect: true },
  ]);
  const after = next["TYPE-요지"];
  assert.equal(after.alpha, before.alpha + 1);
  assert.equal(after.beta, before.beta + 1);
  assert.equal(after.samples, before.samples + 2);
  // Other QTs unchanged
  assert.deepEqual(next["TYPE-목적"], posts["TYPE-목적"]);
});

test("T10: After 100 correct + 0 wrong, posterior mean → 1", () => {
  let post = { qtId: "TYPE-요지", alpha: 2, beta: 5, samples: 5 };
  for (let i = 0; i < 100; i++) post = updatePosterior(post, true);
  const mean = post.alpha / (post.alpha + post.beta);
  assert.ok(mean > 0.92, `mean ${mean} should approach 1`);
  assert.equal(posteriorConfidence(post), "high");
});

// ─── Summary ──────────────────────────────────────────────────────

const passed = results.filter((r) => r.pass).length;
const total = results.length;
console.log(`\n${passed} / ${total} tests passed`);
if (passed < total) {
  process.exit(1);
}
