#!/usr/bin/env node
/**
 * dogfood-12 — forgetting curve 모델 도입한 longitudinal 시뮬.
 *
 * 기존 dogfood-8~11은 단순 power-law 학습 곡선만 사용:
 *   dim_score(t) = base + (target - base) × (1 - exp(-t/tau))
 *
 * 실 학습은 forgetting을 동반. 본 script는 Ebbinghaus forgetting curve를
 * 추가:
 *   gain(session_t)  = (target - current) × (1 - exp(-cards × weight / tau))
 *   decay(session_t) = current × decayRate^(sessions_since_last_exposure)
 *
 * dim 별로 마지막 노출 이후 시간 만큼 점진 감소. 다시 노출되면 회복.
 *
 * 목적:
 *   1. v8~v11에서 가정한 "한 번 학습한 dim은 영구 유지" 한계 보완
 *   2. 학습 cycle이 어떤 빈도로 dim 노출해야 plateau 회피 가능한지
 *   3. exploration policy의 forgetting 측면 가치 측정
 *
 * NOT a production model — Stage C 실 데이터 도착 후 model 재조정 필요.
 *
 * Run: node scripts/dogfood-12-forgetting-curve.mjs [--weeks 24] [--decay-rate 0.95]
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

// Forgetting parameters
const DECAY_RATE = args["decay-rate"] ? parseFloat(args["decay-rate"]) : 0.97;
// Sessions to wait before decay starts (grace period — 1주 = 3 sessions)
const DECAY_GRACE_SESSIONS = 3;
// Minimum score (forgetting doesn't go below base × 0.7)
const DECAY_FLOOR_FACTOR = 0.7;

const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

// Use weak-D2 (most common EFL archetype) for primary scenario
const learner = {
  baseDims: { D1_Form: 60, D2_Meaning: 30, D3_Context: 55, D4_Network: 60, D5_Usage: 55 },
  targetDims: { D1_Form: 85, D2_Meaning: 80, D3_Context: 85, D4_Network: 80, D5_Usage: 80 },
  tauDims: { D1_Form: 20, D2_Meaning: 18, D3_Context: 25, D4_Network: 22, D5_Usage: 24 },
};

const WEIGHTS = {
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
const QT_IDS = Object.keys(WEIGHTS);

let rngState = seed >>> 0;
function rng() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pickTargetQT(dims) {
  let minP = 2, weakest = null;
  for (const qtId of QT_IDS) {
    let p = 0;
    for (const d of DIMS) p += WEIGHTS[qtId][d] * (dims[d] / 100);
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

function runWithForgetting(useExploration = true) {
  rngState = seed >>> 0;
  let dims = { ...learner.baseDims };
  const exposures = Object.fromEntries(DIMS.map((d) => [d, 0]));
  const lastExposureSession = Object.fromEntries(DIMS.map((d) => [d, 0]));
  const qtCount = Object.fromEntries(QT_IDS.map((qt) => [qt, 0]));
  const totalSessions = weeks * sessionsPerWeek;
  const trajectory = [];

  for (let s = 1; s <= totalSessions; s++) {
    // Apply forgetting decay for each dim BEFORE this session
    for (const d of DIMS) {
      const sinceLast = s - lastExposureSession[d];
      if (sinceLast > DECAY_GRACE_SESSIONS) {
        const effectiveDecay = Math.pow(DECAY_RATE, sinceLast - DECAY_GRACE_SESSIONS);
        const floor = learner.baseDims[d] * DECAY_FLOOR_FACTOR;
        dims[d] = Math.max(floor, dims[d] * effectiveDecay);
      }
    }

    // Pick target QT
    let target = pickTargetQT(dims);
    if (useExploration && s > 1 && s % 4 === 0) {
      const starved = pickStarvedQT(qtCount, target);
      if (starved) target = starved;
    }
    qtCount[target]++;

    // Apply learning gain
    const w = WEIGHTS[target];
    for (const d of DIMS) {
      if (w[d] < LEARNING_THRESHOLD) continue;
      exposures[d] += cardsPerSession * w[d];
      lastExposureSession[d] = s;
      const base = learner.baseDims[d];
      const tgt = learner.targetDims[d];
      const tau = learner.tauDims[d];
      const learned = base + (tgt - base) * (1 - Math.exp(-exposures[d] / tau));
      // Gain only applies if learned > current (forgetting may have dropped current below learned)
      dims[d] = Math.max(dims[d], Math.max(0, Math.min(100, learned + (rng() - 0.5) * 1.5)));
    }

    if (s % sessionsPerWeek === 0) {
      trajectory.push({
        week: s / sessionsPerWeek,
        session: s,
        dims: { ...dims },
      });
    }
  }

  const gapClosed = {};
  for (const d of DIMS) {
    const gap = learner.targetDims[d] - learner.baseDims[d];
    const closed = dims[d] - learner.baseDims[d];
    gapClosed[d] = gap === 0 ? null : +((closed / gap) * 100).toFixed(0);
  }
  return { finalDims: dims, gapClosed, trajectory, qtCount };
}

// Compare: no exploration vs with exploration (forgetting reveals exploration's value)
const noExp = runWithForgetting(false);
const withExp = runWithForgetting(true);

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const outPath = join(ROOT, "out", `dogfood-12-forgetting-curve-${seed}-w${weeks}-d${DECAY_RATE}.json`);
writeFileSync(outPath, JSON.stringify({
  seed, weeks, sessionsPerWeek, cardsPerSession,
  decayRate: DECAY_RATE,
  decayGraceSessions: DECAY_GRACE_SESSIONS,
  decayFloorFactor: DECAY_FLOOR_FACTOR,
  learner: { base: learner.baseDims, target: learner.targetDims, tau: learner.tauDims },
  noExploration: {
    finalDims: noExp.finalDims,
    gapClosed: noExp.gapClosed,
    qtCoverage: Object.values(noExp.qtCount).filter((n) => n > 0).length + "/10",
  },
  withExploration: {
    finalDims: withExp.finalDims,
    gapClosed: withExp.gapClosed,
    qtCoverage: Object.values(withExp.qtCount).filter((n) => n > 0).length + "/10",
  },
  weeklyComparison: withExp.trajectory.map((w, i) => ({
    week: w.week,
    withExp: Object.fromEntries(DIMS.map((d) => [d, +w.dims[d].toFixed(1)])),
    noExp: Object.fromEntries(DIMS.map((d) => [d, +noExp.trajectory[i].dims[d].toFixed(1)])),
  })),
}, null, 2));

// Summary
const explorationValue = {};
for (const d of DIMS) {
  const closed_noExp = noExp.gapClosed[d];
  const closed_withExp = withExp.gapClosed[d];
  explorationValue[d] = closed_withExp === null || closed_noExp === null
    ? null
    : closed_withExp - closed_noExp;
}

console.log(JSON.stringify({
  seed, weeks,
  decayRate: DECAY_RATE,
  noExplorationGapClosed: noExp.gapClosed,
  withExplorationGapClosed: withExp.gapClosed,
  explorationDeltaPerDim: explorationValue,
  finding: explorationValue.D1_Form === 0 && noExp.gapClosed.D1_Form === 0
    ? "D1_Form plateau persists under forgetting (consistent with v10 systemic defect)"
    : "exploration policy partially mitigates forgetting in non-D1 dims",
  outputPath: outPath.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
}, null, 2));
