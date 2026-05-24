#!/usr/bin/env node
/**
 * dogfood-11 — 모든 dim의 weight sensitivity 시뮬 (예방적 분석).
 *
 * v10-v13에서 D1_Form 단독에 대해 옵션 A1 (단일 QT boost) 적용 시
 * D1 +66-81%p, D3 dominant -3%p 정도 영향이 확인됨 (dogfood-10).
 *
 * 본 script는 미래의 가중치 조정 PR을 대비해 D2/D3/D4/D5 각각에 대해
 * 동일한 sensitivity 분석 수행:
 *   - 각 dim에 대해 1개 QT에서 weight +0.15 boost (renormalize)
 *   - 5×5 매트릭스 변동량 측정
 *   - 다른 dim에 미치는 영향 (특히 dominant D3) 추적
 *
 * 결과는 미래 가중치 조정 PR의 안전 가이드:
 *   - 어느 dim을 어느 QT에서 boost해야 효과 大 + side effect 小인가
 *
 * Production weight 절대 미수정 (synthetic only).
 *
 * Run: node scripts/dogfood-11-weight-sensitivity.mjs [--weeks 12] [--seed 17]
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    }
  }
  return out;
}

const seed = args.seed ? parseInt(args.seed, 10) : 17;
const weeks = args.weeks ? parseInt(args.weeks, 10) : 12;
const sessionsPerWeek = 3;
const cardsPerSession = 10;
const LEARNING_THRESHOLD = 0.15;
const BOOST_DELTA = 0.15; // each test scenario boosts target dim by +0.15

const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

const ARCHETYPES = {
  "weak-D1": {
    baseDims: { D1_Form: 30, D2_Meaning: 55, D3_Context: 55, D4_Network: 55, D5_Usage: 55 },
    targetDims: { D1_Form: 80, D2_Meaning: 80, D3_Context: 80, D4_Network: 80, D5_Usage: 80 },
    tauDims: { D1_Form: 18, D2_Meaning: 22, D3_Context: 22, D4_Network: 22, D5_Usage: 22 },
  },
  "weak-D2": {
    baseDims: { D1_Form: 60, D2_Meaning: 30, D3_Context: 55, D4_Network: 60, D5_Usage: 55 },
    targetDims: { D1_Form: 85, D2_Meaning: 80, D3_Context: 85, D4_Network: 80, D5_Usage: 80 },
    tauDims: { D1_Form: 20, D2_Meaning: 18, D3_Context: 25, D4_Network: 22, D5_Usage: 24 },
  },
  "weak-D3": {
    baseDims: { D1_Form: 60, D2_Meaning: 55, D3_Context: 30, D4_Network: 60, D5_Usage: 55 },
    targetDims: { D1_Form: 85, D2_Meaning: 80, D3_Context: 80, D4_Network: 80, D5_Usage: 80 },
    tauDims: { D1_Form: 20, D2_Meaning: 22, D3_Context: 18, D4_Network: 22, D5_Usage: 24 },
  },
  "weak-D4": {
    baseDims: { D1_Form: 60, D2_Meaning: 55, D3_Context: 55, D4_Network: 30, D5_Usage: 55 },
    targetDims: { D1_Form: 85, D2_Meaning: 80, D3_Context: 80, D4_Network: 80, D5_Usage: 80 },
    tauDims: { D1_Form: 20, D2_Meaning: 22, D3_Context: 25, D4_Network: 18, D5_Usage: 24 },
  },
  "weak-D5": {
    baseDims: { D1_Form: 60, D2_Meaning: 55, D3_Context: 55, D4_Network: 55, D5_Usage: 30 },
    targetDims: { D1_Form: 85, D2_Meaning: 80, D3_Context: 80, D4_Network: 80, D5_Usage: 80 },
    tauDims: { D1_Form: 20, D2_Meaning: 22, D3_Context: 22, D4_Network: 22, D5_Usage: 18 },
  },
};

const BASELINE_WEIGHTS = {
  "TYPE-목적":   { D1_Form: 0.05, D2_Meaning: 0.10, D3_Context: 0.50, D4_Network: 0.10, D5_Usage: 0.25 },
  "TYPE-심경":   { D1_Form: 0.05, D2_Meaning: 0.35, D3_Context: 0.40, D4_Network: 0.10, D5_Usage: 0.10 },
  "TYPE-주장":   { D1_Form: 0.05, D2_Meaning: 0.10, D3_Context: 0.55, D4_Network: 0.10, D5_Usage: 0.20 },
  "TYPE-요지":   { D1_Form: 0.05, D2_Meaning: 0.10, D3_Context: 0.50, D4_Network: 0.25, D5_Usage: 0.10 },
  "TYPE-주제":   { D1_Form: 0.05, D2_Meaning: 0.25, D3_Context: 0.45, D4_Network: 0.20, D5_Usage: 0.05 },
  "TYPE-제목":   { D1_Form: 0.05, D2_Meaning: 0.10, D3_Context: 0.35, D4_Network: 0.40, D5_Usage: 0.10 },
  "TYPE-빈칸추론": { D1_Form: 0.05, D2_Meaning: 0.20, D3_Context: 0.45, D4_Network: 0.20, D5_Usage: 0.10 },
  "TYPE-흐름무관": { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.55, D4_Network: 0.10, D5_Usage: 0.15 },
  "TYPE-순서배열": { D1_Form: 0.05, D2_Meaning: 0.10, D3_Context: 0.45, D4_Network: 0.10, D5_Usage: 0.30 },
  "TYPE-문장삽입": { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.45, D4_Network: 0.10, D5_Usage: 0.25 },
};
const QT_IDS = Object.keys(BASELINE_WEIGHTS);

// For each dim, pick a QT that already has reasonable weight (not minimal)
// → boost +0.15 in that QT. Renormalize others.
// Target QTs chosen by domain relevance:
const BOOST_TARGET_QT = {
  D1_Form: "TYPE-제목",       // form 집중 과제 (옵션 A')
  D2_Meaning: "TYPE-심경",    // 의미/감정 강한 dim
  D3_Context: "TYPE-요지",    // 맥락 dominant
  D4_Network: "TYPE-제목",    // 어휘 network (제목 추론 시 다른 단어와 관계)
  D5_Usage: "TYPE-순서배열",  // 담화 사용
};

function makeBoostedWeights(targetDim, targetQt, boost) {
  const result = JSON.parse(JSON.stringify(BASELINE_WEIGHTS));
  const original = { ...BASELINE_WEIGHTS[targetQt] };
  const otherDims = DIMS.filter((d) => d !== targetDim);
  const newDimWeight = Math.min(0.95, original[targetDim] + boost);
  const otherSum = otherDims.reduce((s, d) => s + original[d], 0);
  const remaining = 1 - newDimWeight;
  const scale = otherSum === 0 ? 0 : remaining / otherSum;
  const updated = { [targetDim]: +newDimWeight.toFixed(3) };
  for (const d of otherDims) {
    updated[d] = +(original[d] * scale).toFixed(3);
  }
  // Float rounding fix
  const total = Object.values(updated).reduce((a, b) => a + b, 0);
  if (total !== 1) {
    updated[otherDims[0]] = +(updated[otherDims[0]] + (1 - total)).toFixed(3);
  }
  result[targetQt] = updated;
  return result;
}

let rngState;
function rng() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pickTargetQT(dims, weights) {
  let minP = 2, weakest = null;
  for (const qtId of QT_IDS) {
    let p = 0;
    for (const d of DIMS) p += weights[qtId][d] * (dims[d] / 100);
    if (p < minP) { minP = p; weakest = qtId; }
  }
  return weakest;
}

function pickStarvedQT(qtCount, excludeQt) {
  let best = null, minN = Infinity;
  for (const qt of QT_IDS) {
    if (qt === excludeQt) continue;
    const n = qtCount[qt] ?? 0;
    if (n < minN) { minN = n; best = qt; }
  }
  return best;
}

function runSim(learner, weights) {
  rngState = seed >>> 0;
  let currentDims = { ...learner.baseDims };
  const exposures = {};
  const qtCount = Object.fromEntries(QT_IDS.map((qt) => [qt, 0]));
  let sessionN = 0;
  for (let w = 0; w < weeks; w++) {
    for (let s = 0; s < sessionsPerWeek; s++) {
      sessionN++;
      let target = pickTargetQT(currentDims, weights);
      if (sessionN > 1 && sessionN % 4 === 0) {
        const starved = pickStarvedQT(qtCount, target);
        if (starved) target = starved;
      }
      qtCount[target]++;
      const w_qt = weights[target];
      for (const d of DIMS) {
        if (w_qt[d] < LEARNING_THRESHOLD) continue;
        exposures[d] = (exposures[d] ?? 0) + cardsPerSession * w_qt[d];
        const t = exposures[d];
        const base = learner.baseDims[d];
        const tgt = learner.targetDims[d];
        const tau = learner.tauDims[d];
        const learned = base + (tgt - base) * (1 - Math.exp(-t / tau));
        currentDims[d] = Math.max(0, Math.min(100, learned + (rng() - 0.5) * 1.5));
      }
    }
  }
  const gapClosed = {};
  for (const d of DIMS) {
    const gap = learner.targetDims[d] - learner.baseDims[d];
    const closed = currentDims[d] - learner.baseDims[d];
    gapClosed[d] = gap === 0 ? null : +((closed / gap) * 100).toFixed(0);
  }
  return gapClosed;
}

// ─── Sensitivity scan ──────────────────────────────────────────────────

const sensitivity = {};

// Baseline matrix (no boost)
const baselineMatrix = {};
for (const [archetype, profile] of Object.entries(ARCHETYPES)) {
  const learner = { archetype, ...profile };
  baselineMatrix[archetype] = runSim(learner, BASELINE_WEIGHTS);
}

// For each dim, apply boost and measure delta
for (const targetDim of DIMS) {
  const targetQt = BOOST_TARGET_QT[targetDim];
  const boostedWeights = makeBoostedWeights(targetDim, targetQt, BOOST_DELTA);
  const scenario = {};
  for (const [archetype, profile] of Object.entries(ARCHETYPES)) {
    const learner = { archetype, ...profile };
    const after = runSim(learner, boostedWeights);
    scenario[archetype] = {
      baseline: baselineMatrix[archetype],
      after,
      delta: Object.fromEntries(
        DIMS.map((d) => [d, after[d] === null || baselineMatrix[archetype][d] === null
          ? null
          : after[d] - baselineMatrix[archetype][d]])
      ),
    };
  }

  // Compute summary stats per dim impact
  const targetImpacts = Object.values(scenario).map((s) => s.delta[targetDim]).filter((v) => v !== null);
  const sideEffects = [];
  for (const [archetype, s] of Object.entries(scenario)) {
    for (const d of DIMS) {
      if (d === targetDim) continue;
      const delta = s.delta[d];
      if (delta !== null && Math.abs(delta) > 5) {
        sideEffects.push({ archetype, dim: d, delta });
      }
    }
  }

  sensitivity[targetDim] = {
    targetQt,
    boostDelta: BOOST_DELTA,
    targetDimAvgImprovement: targetImpacts.length === 0
      ? null
      : +(targetImpacts.reduce((a, b) => a + b, 0) / targetImpacts.length).toFixed(1),
    targetDimMaxImprovement: targetImpacts.length === 0 ? null : Math.max(...targetImpacts),
    targetDimMinImprovement: targetImpacts.length === 0 ? null : Math.min(...targetImpacts),
    sideEffectCount: sideEffects.length,
    sideEffects: sideEffects.slice(0, 10),
    scenario,
  };
}

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const outPath = join(ROOT, "out", `dogfood-11-weight-sensitivity-${seed}.json`);
writeFileSync(outPath, JSON.stringify({
  seed, weeks, sessionsPerWeek, cardsPerSession,
  boostDelta: BOOST_DELTA,
  boostTargetQt: BOOST_TARGET_QT,
  baselineMatrix,
  sensitivity,
}, null, 2));

// Compact summary table
const summary = {};
for (const dim of DIMS) {
  const s = sensitivity[dim];
  summary[dim] = {
    qt: s.targetQt,
    avgImprovement: s.targetDimAvgImprovement === null ? "—" : `${s.targetDimAvgImprovement}%p`,
    minMax: s.targetDimAvgImprovement === null ? "—" :
      `${s.targetDimMinImprovement}-${s.targetDimMaxImprovement}%p`,
    sideEffects: s.sideEffectCount,
    verdict: s.targetDimAvgImprovement === null ? "UNCHANGED" :
      s.sideEffectCount === 0 ? "SAFE" :
      s.sideEffectCount < 3 ? "MINOR" : "MAJOR",
  };
}

console.log(JSON.stringify({
  seed, weeks,
  boostDelta: BOOST_DELTA,
  summary,
  notes: {
    SAFE: "0 side effect > 5%p on other dims",
    MINOR: "1-2 side effects > 5%p",
    MAJOR: "3+ side effects > 5%p",
    UNCHANGED: "target dim didn't move (likely already at cap or dim has no learning path)",
  },
  outputPath: outPath.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
}, null, 2));
