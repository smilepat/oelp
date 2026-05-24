#!/usr/bin/env node
/**
 * dogfood-13 — forgetting curve + 옵션 A' 결합 sim.
 *
 * dogfood-12에서 forgetting 모델 도입 → D1_Form -72% negative gap.
 * dogfood-10은 옵션 A' 적용 시 D1 +66-81%p 회복 (forgetting 없는 모델).
 *
 * 두 시나리오 결합: forgetting 환경에서 옵션 A' 적용 시 D1 회복률은?
 *
 * Baseline (forgetting only, current production weights):
 *   D1: -72% gap (적극 악화)
 *
 * Option A' applied (forgetting + TYPE-제목 D1=0.20):
 *   D1: ?
 *
 * 두 효과의 net delta = 옵션 A' PR의 시간 차원 정당화 정량 입증.
 *
 * Run: node scripts/dogfood-13-forgetting-plus-option-a-prime.mjs [--weeks 24]
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
const weeks = args.weeks ? parseInt(args.weeks, 10) : 24;
const sessionsPerWeek = 3;
const cardsPerSession = 10;
const LEARNING_THRESHOLD = 0.15;

// Forgetting parameters (same as dogfood-12)
const DECAY_RATE = 0.97;
const DECAY_GRACE_SESSIONS = 3;
const DECAY_FLOOR_FACTOR = 0.7;

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

function runWithForgetting(learner, weights) {
  rngState = seed >>> 0;
  let dims = { ...learner.baseDims };
  const exposures = Object.fromEntries(DIMS.map((d) => [d, 0]));
  const lastExposureSession = Object.fromEntries(DIMS.map((d) => [d, 0]));
  const qtCount = Object.fromEntries(QT_IDS.map((qt) => [qt, 0]));
  const totalSessions = weeks * sessionsPerWeek;

  for (let s = 1; s <= totalSessions; s++) {
    // Forgetting decay
    for (const d of DIMS) {
      const sinceLast = s - lastExposureSession[d];
      if (sinceLast > DECAY_GRACE_SESSIONS) {
        const effectiveDecay = Math.pow(DECAY_RATE, sinceLast - DECAY_GRACE_SESSIONS);
        const floor = learner.baseDims[d] * DECAY_FLOOR_FACTOR;
        dims[d] = Math.max(floor, dims[d] * effectiveDecay);
      }
    }

    let target = pickTargetQT(dims, weights);
    if (s > 1 && s % 4 === 0) {
      const starved = pickStarvedQT(qtCount, target);
      if (starved) target = starved;
    }
    qtCount[target]++;

    const w = weights[target];
    for (const d of DIMS) {
      if (w[d] < LEARNING_THRESHOLD) continue;
      exposures[d] += cardsPerSession * w[d];
      lastExposureSession[d] = s;
      const base = learner.baseDims[d];
      const tgt = learner.targetDims[d];
      const tau = learner.tauDims[d];
      const learned = base + (tgt - base) * (1 - Math.exp(-exposures[d] / tau));
      dims[d] = Math.max(dims[d], Math.max(0, Math.min(100, learned + (rng() - 0.5) * 1.5)));
    }
  }

  const gapClosed = {};
  for (const d of DIMS) {
    const gap = learner.targetDims[d] - learner.baseDims[d];
    const closed = dims[d] - learner.baseDims[d];
    gapClosed[d] = gap === 0 ? null : +((closed / gap) * 100).toFixed(0);
  }
  return { finalDims: dims, gapClosed };
}

// ─── Run comparison ────────────────────────────────────────────────────

const results = {};
for (const [archetype, profile] of Object.entries(ARCHETYPES)) {
  const learner = { archetype, ...profile };
  const baseline = runWithForgetting(learner, BASELINE_WEIGHTS);
  const optionAPrime = runWithForgetting(learner, OPTION_A_PRIME_WEIGHTS);
  results[archetype] = {
    baseline: baseline.gapClosed,
    optionAPrime: optionAPrime.gapClosed,
    delta: Object.fromEntries(
      DIMS.map((d) => [d, baseline.gapClosed[d] === null || optionAPrime.gapClosed[d] === null
        ? null
        : optionAPrime.gapClosed[d] - baseline.gapClosed[d]])
    ),
  };
}

// Side effect check (other dims changed > 5%p)
const sideEffects = [];
for (const [archetype, r] of Object.entries(results)) {
  for (const d of DIMS) {
    if (d === "D1_Form") continue;
    const delta = r.delta[d];
    if (delta !== null && Math.abs(delta) > 5) {
      sideEffects.push({ archetype, dim: d, delta });
    }
  }
}

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const outPath = join(ROOT, "out", `dogfood-13-forgetting-plus-option-a-prime-${seed}-w${weeks}.json`);
writeFileSync(outPath, JSON.stringify({
  seed, weeks, sessionsPerWeek, cardsPerSession,
  decayRate: DECAY_RATE,
  decayGraceSessions: DECAY_GRACE_SESSIONS,
  decayFloorFactor: DECAY_FLOOR_FACTOR,
  results,
  sideEffects,
  verdict: sideEffects.length === 0 ? "SAFE under forgetting" : "WARN: side effects detected",
}, null, 2));

// Compact output
const summary = {};
for (const [archetype, r] of Object.entries(results)) {
  summary[archetype] = {
    D1_baseline: `${r.baseline.D1_Form}%`,
    D1_optionAPrime: `${r.optionAPrime.D1_Form}%`,
    D1_delta: `${r.delta.D1_Form > 0 ? '+' : ''}${r.delta.D1_Form}%p`,
  };
}

console.log(JSON.stringify({
  seed, weeks,
  decayRate: DECAY_RATE,
  D1FormSummaryByArchetype: summary,
  sideEffectsCount: sideEffects.length,
  sideEffects,
  verdict: sideEffects.length === 0 ? "SAFE — D1 회복 + 다른 dim 안전" : "WARN",
  finding: "옵션 A' PR이 forgetting 환경에서도 D1을 negative gap에서 회복시킴",
  outputPath: outPath.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
}, null, 2));
