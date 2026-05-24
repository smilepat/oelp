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

// Learner profile — weak-D2 archetype (가장 흔한 EFL 패턴)
const learner = {
  id: "lc-001",
  archetype: "weak-D2",
  baseDims: { D1_Form: 60, D2_Meaning: 30, D3_Context: 55, D4_Network: 60, D5_Usage: 55 },
  // 도달 가능한 천장 (학습 큐가 targeting 했을 때)
  targetDims: { D1_Form: 85, D2_Meaning: 80, D3_Context: 85, D4_Network: 80, D5_Usage: 80 },
  // tau (sessions to reach ~63% of gap closure)
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
function applyLearning(dims, qtId, exposures) {
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

// ─── Run simulation ────────────────────────────────────────────────────

let currentDims = { ...learner.baseDims };
const exposures = {}; // per-dim cumulative exposure
const qtCount = Object.fromEntries(QT_IDS.map((qt) => [qt, 0]));

const trajectory = []; // snapshot per session
const totalSessions = weeks * sessionsPerWeek;
let sessionN = 0;

for (let w = 0; w < weeks; w++) {
  for (let s = 0; s < sessionsPerWeek; s++) {
    sessionN++;
    let target = pickTargetQT(currentDims);
    // exploration: every 4th session forces starved QT (mirror v4 policy)
    if (useExploration && sessionN > 1 && sessionN % 4 === 0) {
      const starved = pickStarvedQT(qtCount, target);
      if (starved) target = starved;
    }
    qtCount[target]++;
    currentDims = applyLearning(currentDims, target, exposures);
    trajectory.push({
      session: sessionN,
      week: w + 1,
      targetQT: target,
      dims: { ...currentDims },
      exposures: { ...exposures },
    });
  }
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

const plateau = findPlateau(trajectory);

// ─── Summary by week ──────────────────────────────────────────────────

const weeklySnapshots = [];
for (let w = 1; w <= weeks; w++) {
  const lastSessionOfWeek = trajectory.filter((t) => t.week === w).pop();
  if (lastSessionOfWeek) {
    weeklySnapshots.push({
      week: w,
      session: lastSessionOfWeek.session,
      dims: lastSessionOfWeek.dims,
      avgDim: +(DIMS.reduce((s, d) => s + lastSessionOfWeek.dims[d], 0) / DIMS.length).toFixed(1),
      weakestDim: DIMS.reduce((min, d) =>
        lastSessionOfWeek.dims[d] < lastSessionOfWeek.dims[min] ? d : min
      , DIMS[0]),
    });
  }
}

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const outPath = join(ROOT, "out", `dogfood-8-learning-curve-${seed}${useExploration ? "" : "-noexp"}.json`);
writeFileSync(outPath, JSON.stringify({
  seed,
  weeks,
  sessionsPerWeek,
  cardsPerSession,
  useExploration,
  learner: { id: learner.id, archetype: learner.archetype, base: learner.baseDims, target: learner.targetDims, tau: learner.tauDims },
  totalSessions,
  finalDims: trajectory[trajectory.length - 1].dims,
  qtDistribution: qtCount,
  plateau,
  weeklySnapshots,
  closedLoopCandidate: plateau
    ? `Plateau at week ${plateau.week} on ${plateau.weakestDim} (value ${plateau.dimValue.toFixed(1)}). 7번째 closed-loop 후보: plateau breaker — 가중치 정책으로 tau 짧은 다른 QT로 강제 전환?`
    : `${weeks}주 누적에서 plateau 미발생. tau 값 더 크게 또는 weeks 더 늘려 재실행 필요.`,
}, null, 2));

console.log(JSON.stringify({
  seed,
  weeks,
  totalSessions,
  useExploration,
  archetype: learner.archetype,
  baseDims: learner.baseDims,
  finalDims: trajectory[trajectory.length - 1].dims,
  qtCoverage: `${Object.values(qtCount).filter((n) => n > 0).length}/10`,
  qtDistribution: qtCount,
  plateau,
  weeklySummary: weeklySnapshots.map((s) => ({
    week: s.week,
    avgDim: s.avgDim,
    weakestDim: s.weakestDim,
    weakest: s.dims[s.weakestDim].toFixed(1),
  })),
  outputPath: outPath.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
}, null, 2));
