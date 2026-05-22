#!/usr/bin/env node
/**
 * Unit tests for buildQueueV2 (Thompson sampling integration).
 *
 * Mirrors core logic inline. Cards are drawn from a minimal stub pool so the
 * test doesn't depend on the real vocabulary-pool.ts (large + auto-generated).
 *
 * Spec: phase2-p1-recommendation-v2.md §3 + lib/queue.ts buildQueueV2.
 */

import { strict as assert } from "node:assert";

// ─── Inline QUESTION_TYPES (v2 weights) ─────────────────────────────

const QUESTION_TYPES = [
  { id: "TYPE-목적", name: "목적 파악", keyVariables: [], weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.1, D5_Usage: 0.25 } },
  { id: "TYPE-심경", name: "심경", keyVariables: [], weights: { D1_Form: 0.05, D2_Meaning: 0.35, D3_Context: 0.4, D4_Network: 0.1, D5_Usage: 0.1 } },
  { id: "TYPE-주장", name: "주장", keyVariables: [], weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.2 } },
  { id: "TYPE-요지", name: "요지", keyVariables: [], weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.25, D5_Usage: 0.1 } },
  { id: "TYPE-주제", name: "주제", keyVariables: [], weights: { D1_Form: 0.05, D2_Meaning: 0.25, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.05 } },
  { id: "TYPE-제목", name: "제목", keyVariables: [], weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.35, D4_Network: 0.4, D5_Usage: 0.1 } },
  { id: "TYPE-빈칸추론", name: "빈칸추론", keyVariables: [], weights: { D1_Form: 0.05, D2_Meaning: 0.2, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.1 } },
  { id: "TYPE-흐름무관", name: "흐름무관", keyVariables: [], weights: { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.15 } },
  { id: "TYPE-순서배열", name: "순서배열", keyVariables: [], weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.3 } },
  { id: "TYPE-문장삽입", name: "문장삽입", keyVariables: [], weights: { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.25 } },
];
const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

function predictCorrectness(scores, qt) {
  let s = 0;
  for (const d of DIMS) s += qt.weights[d] * ((scores[d] ?? 0) / 100);
  return s;
}

function priorFromDiagnostic(qt, scores, k = 5) {
  const p = predictCorrectness(scores, qt);
  return { qtId: qt.id, alpha: 1 + p * k, beta: 1 + (1 - p) * k, samples: 0 };
}

function initialPosteriors(scores) {
  const m = {};
  for (const qt of QUESTION_TYPES) m[qt.id] = priorFromDiagnostic(qt, scores);
  return m;
}

function sampleGamma(shape) {
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
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

function sampleBeta(a, b) {
  const x = sampleGamma(a), y = sampleGamma(b);
  return x / (x + y);
}

function recommendQuestionType(scores, posteriors, opts = {}) {
  const minSamples = opts.minSamplesForThompson ?? 10;
  const total = Object.values(posteriors).reduce((s, p) => s + p.samples, 0);
  if (total < minSamples) {
    const ranked = QUESTION_TYPES.map((qt) => ({ qt, p: predictCorrectness(scores, qt) })).sort(
      (a, b) => a.p - b.p
    );
    return {
      targetQuestionType: ranked[0].qt,
      targetThetaSample: ranked[0].p,
      alternateQuestionType: ranked[1].qt,
      alternateThetaSample: ranked[1].p,
      confidence: "low",
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
    confidence: "high",
    algorithm: "thompson-v2",
  };
}

// ─── Stub POOL ──────────────────────────────────────────────────────

const POOL = [];
for (const dim of DIMS) {
  for (let b = -1; b <= 1; b += 0.1) {
    POOL.push({ itemId: `${dim}-${b.toFixed(2)}`, word: `w-${dim}-${b.toFixed(2)}`, dimension: dim, difficulty: b, options: ["a","b","c","d"], answerIdx: 0 });
  }
}

// ─── buildQueueV2 inline mirror ────────────────────────────────────

function buildQueueV2(diag, posteriors, opts = {}) {
  const sessionSize = opts.sessionSize ?? 10;
  const halfWidth = opts.difficultyHalfWidth ?? 0.4;
  const rec = recommendQuestionType(diag.dimensionScores, posteriors);
  const target = rec.targetQuestionType;
  const dimsRanked = Object.entries(target.weights).sort((a, b) => b[1] - a[1]).map(([d]) => d);
  const targetDims = dimsRanked.slice(0, 2);

  const bMin = diag.theta - halfWidth;
  const bMax = diag.theta + halfWidth;
  let candidates = POOL.filter(c => targetDims.includes(c.dimension) && c.difficulty >= bMin && c.difficulty <= bMax);
  if (candidates.length < sessionSize) {
    candidates = POOL.filter(c => targetDims.includes(c.dimension) && c.difficulty >= bMin - 0.6 && c.difficulty <= bMax + 0.6);
  }
  const cards = [];
  const slotsPerDim = Math.ceil(sessionSize / targetDims.length);
  for (const dim of targetDims) {
    const ranked = candidates.filter(c => c.dimension === dim)
      .sort((a, b) => Math.abs(a.difficulty - diag.theta) - Math.abs(b.difficulty - diag.theta))
      .slice(0, slotsPerDim * 2);
    for (let i = ranked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ranked[i], ranked[j]] = [ranked[j], ranked[i]];
    }
    cards.push(...ranked.slice(0, slotsPerDim));
  }
  return {
    targetQuestionType: target,
    predictedCorrectness: rec.targetThetaSample,
    targetDimensions: targetDims,
    cards: cards.slice(0, sessionSize),
    confidence: rec.confidence,
    algorithm: rec.algorithm,
    alternateQuestionType: rec.alternateQuestionType,
    targetThetaSample: rec.targetThetaSample,
  };
}

// ─── Fixtures ──────────────────────────────────────────────────────

const DEMO = {
  studentName: "Demo",
  theta: 0.3,
  level: 4,
  cefr: "B2",
  dimensionScores: { D1_Form: 78, D2_Meaning: 82, D3_Context: 45, D4_Network: 60, D5_Usage: 71 },
  weakDim: ["D3_Context", "D4_Network"],
  strongDim: ["D2_Meaning", "D1_Form"],
  timestamp: "2026-05-23T00:00:00Z",
};

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

// ─── Tests ──────────────────────────────────────────────────────────

test("T1: With no posterior history, algorithm = rule-v1-fallback", () => {
  const posts = initialPosteriors(DEMO.dimensionScores);
  const plan = buildQueueV2(DEMO, posts);
  assert.equal(plan.algorithm, "rule-v1-fallback");
  assert.equal(plan.confidence, "low");
});

test("T2: Fallback picks same QT as deterministic argmin(predictCorrectness)", () => {
  const posts = initialPosteriors(DEMO.dimensionScores);
  const plan = buildQueueV2(DEMO, posts);
  // Find the actual weakest QT
  const ranked = QUESTION_TYPES.map(qt => ({ qt, p: predictCorrectness(DEMO.dimensionScores, qt) })).sort((a, b) => a.p - b.p);
  assert.equal(plan.targetQuestionType.id, ranked[0].qt.id);
  assert.equal(plan.alternateQuestionType.id, ranked[1].qt.id);
});

test("T3: With >=10 samples + skewed posteriors → algorithm = thompson-v2", () => {
  const posts = initialPosteriors(DEMO.dimensionScores);
  // Inject 15 samples — push 요지 to weak (low α), 순서배열 to strong (high α)
  posts["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 2, beta: 30, samples: 30 };
  posts["TYPE-순서배열"] = { qtId: "TYPE-순서배열", alpha: 30, beta: 2, samples: 30 };
  const plan = buildQueueV2(DEMO, posts);
  assert.equal(plan.algorithm, "thompson-v2");
});

test("T4: Thompson picks 요지 majority of trials (200 runs)", () => {
  const posts = initialPosteriors(DEMO.dimensionScores);
  posts["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 2, beta: 30, samples: 30 };
  posts["TYPE-순서배열"] = { qtId: "TYPE-순서배열", alpha: 30, beta: 2, samples: 30 };
  let yojiHits = 0;
  let sunseoHits = 0;
  for (let i = 0; i < 200; i++) {
    const plan = buildQueueV2(DEMO, posts);
    if (plan.targetQuestionType.id === "TYPE-요지") yojiHits++;
    if (plan.targetQuestionType.id === "TYPE-순서배열") sunseoHits++;
  }
  assert.ok(yojiHits > 100, `요지 ${yojiHits}/200 should exceed 100`);
  assert.ok(sunseoHits < 20, `순서배열 ${sunseoHits}/200 should be < 20`);
});

test("T5: Queue has exactly 10 cards", () => {
  const posts = initialPosteriors(DEMO.dimensionScores);
  const plan = buildQueueV2(DEMO, posts);
  assert.equal(plan.cards.length, 10);
});

test("T6: targetDimensions are top-2 weights of selected QT", () => {
  const posts = initialPosteriors(DEMO.dimensionScores);
  const plan = buildQueueV2(DEMO, posts);
  const dimsRanked = Object.entries(plan.targetQuestionType.weights).sort((a, b) => b[1] - a[1]).map(([d]) => d);
  assert.deepEqual(plan.targetDimensions, dimsRanked.slice(0, 2));
});

test("T7: Cards' dimensions are in targetDimensions", () => {
  const posts = initialPosteriors(DEMO.dimensionScores);
  const plan = buildQueueV2(DEMO, posts);
  for (const c of plan.cards) {
    assert.ok(plan.targetDimensions.includes(c.dimension), `card dim ${c.dimension} not in target`);
  }
});

test("T8: Repeat calls produce varied cards (shuffle works)", () => {
  const posts = initialPosteriors(DEMO.dimensionScores);
  const plan1 = buildQueueV2(DEMO, posts);
  const plan2 = buildQueueV2(DEMO, posts);
  const set1 = new Set(plan1.cards.map(c => c.itemId));
  const set2 = new Set(plan2.cards.map(c => c.itemId));
  const overlap = [...set1].filter(x => set2.has(x)).length;
  // Some overlap OK (small pool), but not 100% identical
  assert.ok(overlap < 10, `cards completely identical: ${overlap}/10`);
});

// ─── Summary ──────────────────────────────────────────────────────

const passed = results.filter(r => r.pass).length;
const total = results.length;
console.log(`\n${passed} / ${total} tests passed`);
if (passed < total) process.exit(1);
