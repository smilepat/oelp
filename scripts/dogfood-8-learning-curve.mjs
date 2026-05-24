#!/usr/bin/env node
/**
 * dogfood-8 — single learner longitudinal learning curve simulation.
 *
 * 기존 dogfood-1~7은 모두 cross-section (한 시점의 cohort/응답 분포).
 * dogfood-8은 단일 학습자가 4주 / 12주 / 24주 누적 학습 시 dim score가
 * 어떻게 진화하는지를 시뮬레이션.
 *
 * 학습 곡선 모델 (간단한 power-law approach):
 *   dim_score(t) = base + (target - base) × (1 - exp(-t/tau))
 *     base: 초기 점수 (학습자 archetype)
 *     target: 학습으로 도달 가능한 천장
 *     tau: time constant (학습 효율, 작을수록 빨리 수렴)
 *
 * 학습 효과는 학습 큐가 그 dim을 targeting 했을 때만 발생.
 *
 * 분석 결과:
 *   1. 어느 시점에 plateau에 도달하는가
 *   2. exploration policy가 plateau 회피에 기여하는가
 *   3. tau 값에 따라 calibration cycle 빈도 어떻게 변하는가
 *
 * Run: node scripts/dogfood-8-learning-curve.mjs [--weeks 12] [--seed 17]
 *
 * 7번째 closed-loop 후보 발굴이 목적:
 *   "long-term plateau가 발생한다면 어떤 새 정책으로 깨야 하는가"
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
const sessionsPerWeek = args["sessions-per-week"] ? parseInt(args["sessions-per-week"], 10) : 3;
const cardsPerSession = 10;
const useExploration = args.exploration !== "off";

let rngState = seed >>> 0;
function rng() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

// 5 archetype profiles. CLI: --archetype weak-D2|weak-D3|weak-D4|balanced|strong|all
const ARCHETYPES = {
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
  balanced: {
    baseDims: { D1_Form: 55, D2_Meaning: 55, D3_Context: 55, D4_Network: 55, D5_Usage: 55 },
    targetDims: { D1_Form: 85, D2_Meaning: 80, D3_Context: 80, D4_Network: 80, D5_Usage: 80 },
    tauDims: { D1_Form: 20, D2_Meaning: 22, D3_Context: 22, D4_Network: 22, D5_Usage: 22 },
  },
  strong: {
    baseDims: { D1_Form: 75, D2_Meaning: 75, D3_Context: 75, D4_Network: 75, D5_Usage: 75 },
    targetDims: { D1_Form: 90, D2_Meaning: 90, D3_Context: 90, D4_Network: 90, D5_Usage: 90 },
    tauDims: { D1_Form: 25, D2_Meaning: 25, D3_Context: 25, D4_Network: 25, D5_Usage: 25 },
  },
};

const archetypeArg = args.archetype ?? "weak-D2";
const archetypesToRun = archetypeArg === "all" ? Object.keys(ARCHETYPES) : [archetypeArg];

function makeLearner(archetype) {
  if (!ARCHETYPES[archetype]) throw new Error(`Unknown archetype: ${archetype}`);
  return {
    id: `lc-${archetype}`,
    archetype,
    ...ARCHETYPES[archetype],
  };
}

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

/**
 * Option A simulation: boost D1_Form weight in selected QT(s).
 * --d1-boost: "none" (default) | "single" (제목 only) | "form-pair" (제목 + 흐름무관) | "all" (all 10 QTs)
 * Boosted weight applied: 0.20 to selected QT(s) for D1_Form.
 * Other dims renormalized so each QT weights still sum to 1.0.
 *
 * Production weights remain untouched — this is simulation only.
 */
const d1BoostMode = args["d1-boost"] ?? "none";
const D1_BOOST_VALUE = args["d1-boost-value"] ? parseFloat(args["d1-boost-value"]) : 0.20;

function buildBoostedWeights(mode, boostValue) {
  if (mode === "none") return BASELINE_WEIGHTS;
  let qtsToBoost;
  if (mode === "single") qtsToBoost = ["TYPE-제목"];
  else if (mode === "form-pair") qtsToBoost = ["TYPE-제목", "TYPE-흐름무관"];
  else if (mode === "all") qtsToBoost = Object.keys(BASELINE_WEIGHTS);
  else throw new Error(`Unknown d1-boost mode: ${mode}`);

  const result = {};
  for (const [qt, w] of Object.entries(BASELINE_WEIGHTS)) {
    if (!qtsToBoost.includes(qt)) {
      result[qt] = { ...w };
      continue;
    }
    // Boost D1_Form, renormalize other dims so total = 1.0
    const otherDims = DIMS.filter((d) => d !== "D1_Form");
    const otherSum = otherDims.reduce((s, d) => s + w[d], 0);
    const remainingTotal = 1 - boostValue;
    const newWeights = { D1_Form: boostValue };
    for (const d of otherDims) {
      newWeights[d] = +(w[d] * (remainingTotal / otherSum)).toFixed(3);
    }
    result[qt] = newWeights;
  }
  return result;
}

const WEIGHTS = buildBoostedWeights(d1BoostMode, D1_BOOST_VALUE);
const QT_IDS = Object.keys(WEIGHTS);

function pickTargetQT(dims) {
  let minP = 2, weakest = null;
  for (const qtId of QT_IDS) {
    const w = WEIGHTS[qtId];
    let p = 0;
    for (const d of DIMS) p += w[d] * (dims[d] / 100);
    if (p < minP) { minP = p; weakest = qtId; }
  }
  return weakest;
}

/**
 * Learning curve update: exponential approach to target.
 * For each dimension that the chosen QT exercises (weight > 0.15),
 * advance dim_score toward target by step size dependent on tau.
 */
function applyLearning(dims, qtId, exposures, learner) {
  const w = WEIGHTS[qtId];
  const updated = { ...dims };
  for (const d of DIMS) {
    if (w[d] < 0.15) continue; // weight too small — no meaningful learning
    exposures[d] = (exposures[d] ?? 0) + cardsPerSession * w[d];
    const t = exposures[d];
    const base = learner.baseDims[d];
    const target = learner.targetDims[d];
    const tau = learner.tauDims[d];
    // exp(-t/tau) curve, capped at target
    const learned = base + (target - base) * (1 - Math.exp(-t / tau));
    // small noise
    updated[d] = Math.max(0, Math.min(100, learned + (rng() - 0.5) * 1.5));
  }
  return updated;
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

// ─── Run simulation (per archetype) ───────────────────────────────────

function runSimulation(learner) {
  let currentDims = { ...learner.baseDims };
  const exposures = {};
  const qtCount = Object.fromEntries(QT_IDS.map((qt) => [qt, 0]));
  const trajectory = [];
  let sessionN = 0;

  for (let w = 0; w < weeks; w++) {
    for (let s = 0; s < sessionsPerWeek; s++) {
      sessionN++;
      let target = pickTargetQT(currentDims);
      if (useExploration && sessionN > 1 && sessionN % 4 === 0) {
        const starved = pickStarvedQT(qtCount, target);
        if (starved) target = starved;
      }
      qtCount[target]++;
      currentDims = applyLearning(currentDims, target, exposures, learner);
      trajectory.push({
        session: sessionN,
        week: w + 1,
        targetQT: target,
        dims: { ...currentDims },
        exposures: { ...exposures },
      });
    }
  }
  return { trajectory, qtCount, finalDims: currentDims, exposures };
}

// ─── Plateau detection ────────────────────────────────────────────────

/**
 * Plateau definition: 5 consecutive sessions where weakest dim moved < 0.5 points.
 * Reports first plateau session.
 */
function findPlateau(trajectory) {
  const window = 5;
  for (let i = window; i < trajectory.length; i++) {
    const recent = trajectory.slice(i - window, i + 1);
    const weakestDim = DIMS.reduce((min, d) =>
      recent[recent.length - 1].dims[d] < recent[recent.length - 1].dims[min] ? d : min
    , DIMS[0]);
    const start = recent[0].dims[weakestDim];
    const end = recent[recent.length - 1].dims[weakestDim];
    if (Math.abs(end - start) < 0.5) {
      return { session: i, week: trajectory[i].week, weakestDim, dimValue: end };
    }
  }
  return null;
}

function summarize(learner, simResult) {
  const { trajectory, qtCount, finalDims } = simResult;
  const plateau = findPlateau(trajectory);
  const weeklySnapshots = [];
  for (let w = 1; w <= weeks; w++) {
    const lastSessionOfWeek = trajectory.filter((t) => t.week === w).pop();
    if (lastSessionOfWeek) {
      weeklySnapshots.push({
        week: w,
        session: lastSessionOfWeek.session,
        avgDim: +(DIMS.reduce((s, d) => s + lastSessionOfWeek.dims[d], 0) / DIMS.length).toFixed(1),
        weakestDim: DIMS.reduce((min, d) =>
          lastSessionOfWeek.dims[d] < lastSessionOfWeek.dims[min] ? d : min
        , DIMS[0]),
      });
    }
  }
  const gapClosed = {};
  for (const d of DIMS) {
    const gap = learner.targetDims[d] - learner.baseDims[d];
    const closed = finalDims[d] - learner.baseDims[d];
    gapClosed[d] = gap === 0 ? null : +((closed / gap) * 100).toFixed(0);
  }
  return {
    archetype: learner.archetype,
    baseDims: learner.baseDims,
    finalDims,
    gapClosedPct: gapClosed,
    qtCoverage: `${Object.values(qtCount).filter((n) => n > 0).length}/10`,
    plateau,
    weeklySummary: weeklySnapshots,
    finalWeakestDim: weeklySnapshots[weeklySnapshots.length - 1]?.weakestDim,
  };
}

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));

const totalSessions = weeks * sessionsPerWeek;

const allSummaries = {};
for (const archetype of archetypesToRun) {
  // Reset RNG per archetype for reproducibility
  rngState = seed >>> 0;
  const learner = makeLearner(archetype);
  const result = runSimulation(learner);
  allSummaries[archetype] = summarize(learner, result);
}

const outSuffix = `${seed}${useExploration ? "" : "-noexp"}${archetypeArg === "all" ? "-all" : `-${archetypeArg}`}${d1BoostMode !== "none" ? `-d1boost-${d1BoostMode}` : ""}`;
const outPath = join(ROOT, "out", `dogfood-8-learning-curve-${outSuffix}.json`);
writeFileSync(outPath, JSON.stringify({
  seed,
  weeks,
  sessionsPerWeek,
  cardsPerSession,
  useExploration,
  totalSessions,
  archetypes: archetypesToRun,
  summaries: allSummaries,
  d1FormPlateauSummary: archetypeArg === "all"
    ? Object.fromEntries(
        Object.entries(allSummaries).map(([a, s]) => [a, {
          d1_gap_closed_pct: s.gapClosedPct.D1_Form,
          d1_final: +s.finalDims.D1_Form.toFixed(1),
          finalWeakestDim: s.finalWeakestDim,
        }])
      )
    : "set --archetype all to compute",
}, null, 2));

console.log(JSON.stringify({
  seed,
  weeks,
  totalSessions,
  useExploration,
  archetypes: archetypesToRun,
  summaries: Object.fromEntries(
    Object.entries(allSummaries).map(([a, s]) => [a, {
      base_D1: s.baseDims.D1_Form,
      final_D1: +s.finalDims.D1_Form.toFixed(1),
      D1_gap_closed: `${s.gapClosedPct.D1_Form ?? "—"}%`,
      finalWeakest: s.finalWeakestDim,
      plateau: s.plateau ? `week ${s.plateau.week} on ${s.plateau.weakestDim}` : "none",
      qtCoverage: s.qtCoverage,
    }])
  ),
  outputPath: outPath.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
}, null, 2));
