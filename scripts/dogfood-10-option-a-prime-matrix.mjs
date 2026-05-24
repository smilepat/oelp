#!/usr/bin/env node
/**
 * dogfood-10 — 옵션 A' 적용 시 5 dim × 5 archetype matrix 변화 사전 측정.
 *
 * dogfood-9 baseline (현 production weight)에서 D1 행 5/5 = 0% plateau.
 * 본 script는 옵션 A' (TYPE-제목 weight D1 0.05→0.20, 비례 renormalize)
 * 적용 시 matrix가 어떻게 변하는지 시뮬레이션.
 *
 * Production weight 절대 수정 안 함 — in-memory override.
 *
 * 비교:
 *   - Baseline (production weights)
 *   - Option A' applied (TYPE-제목 D1=0.20)
 *   - Delta (각 셀의 gap closed % 차이)
 *
 * 본인이 옵션 A' PR 진행 시 예상 결과 사전 측정. dogfood-9 baseline + delta
 * = 실 PR 후 dogfood-9 결과 예측.
 *
 * Run: node scripts/dogfood-10-option-a-prime-matrix.mjs [--weeks 12] [--seed 17]
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

// Production weights (current state mirror)
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

// Option A' weights — TYPE-제목 only
const OPTION_A_PRIME_WEIGHTS = JSON.parse(JSON.stringify(BASELINE_WEIGHTS));
OPTION_A_PRIME_WEIGHTS["TYPE-제목"] = {
  D1_Form: 0.20,
  D2_Meaning: 0.08,
  D3_Context: 0.29,
  D4_Network: 0.34,
  D5_Usage: 0.09,
};

const QT_IDS = Object.keys(BASELINE_WEIGHTS);

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

function runSimulation(learner, weights) {
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
  return { gapClosed };
}

// ─── Run both scenarios ────────────────────────────────────────────────

const baselineMatrix = {};
const optionAPrimeMatrix = {};
const deltaMatrix = {};

for (const [archetype, profile] of Object.entries(ARCHETYPES)) {
  const learner = { archetype, ...profile };
  baselineMatrix[archetype] = runSimulation(learner, BASELINE_WEIGHTS).gapClosed;
  optionAPrimeMatrix[archetype] = runSimulation(learner, OPTION_A_PRIME_WEIGHTS).gapClosed;
  deltaMatrix[archetype] = {};
  for (const d of DIMS) {
    const b = baselineMatrix[archetype][d];
    const o = optionAPrimeMatrix[archetype][d];
    deltaMatrix[archetype][d] = (b === null || o === null) ? null : o - b;
  }
}

// ─── Summary stats ─────────────────────────────────────────────────────

const d1Improvements = Object.entries(optionAPrimeMatrix).map(([a, m]) => ({
  archetype: a,
  baseline: baselineMatrix[a].D1_Form,
  optionAPrime: m.D1_Form,
  delta: deltaMatrix[a].D1_Form,
}));

// D3 dominant dim — 가장 큰 risk (옵션 A' 후 약화 가능성)
const d3Changes = Object.entries(optionAPrimeMatrix).map(([a, m]) => ({
  archetype: a,
  baseline: baselineMatrix[a].D3_Context,
  optionAPrime: m.D3_Context,
  delta: deltaMatrix[a].D3_Context,
}));

const maxAbsDelta = Math.max(
  ...Object.entries(deltaMatrix).flatMap(([_, m]) =>
    Object.values(m).map((v) => (v === null ? 0 : Math.abs(v)))
  )
);

const safetyCheck = Object.entries(deltaMatrix).flatMap(([archetype, m]) =>
  Object.entries(m)
    .filter(([dim, delta]) => dim !== "D1_Form" && delta !== null && Math.abs(delta) > 10)
    .map(([dim, delta]) => ({ archetype, dim, delta, severity: "warn" }))
);

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const outPath = join(ROOT, "out", `dogfood-10-option-a-prime-matrix-${seed}.json`);
writeFileSync(outPath, JSON.stringify({
  seed, weeks, sessionsPerWeek, cardsPerSession,
  learningThreshold: LEARNING_THRESHOLD,
  baselineMatrix,
  optionAPrimeMatrix,
  deltaMatrix,
  d1Improvements,
  d3Changes,
  maxAbsDelta,
  safetyCheck,
  verdict: safetyCheck.length === 0 && d1Improvements.every((d) => d.delta > 0)
    ? "SAFE — D1 ≥ 0% improvement, no other dim disrupted > 10%"
    : safetyCheck.length > 0
    ? `WARN — ${safetyCheck.length} other dim(s) changed > 10%`
    : "FAIL — D1 didn't improve in some archetype",
}, null, 2));

console.log(JSON.stringify({
  seed, weeks,
  d1Improvements,
  d3Changes,
  maxAbsDelta,
  safetyCheck,
  verdict: safetyCheck.length === 0 && d1Improvements.every((d) => d.delta > 0)
    ? "SAFE"
    : safetyCheck.length > 0 ? "WARN" : "FAIL",
  outputPath: outPath.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
}, null, 2));
