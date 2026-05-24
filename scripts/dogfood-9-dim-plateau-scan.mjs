#!/usr/bin/env node
/**
 * dogfood-9 — 5 dim × 5 archetype plateau scan.
 *
 * v8/v10에서 weak-D2 archetype에서 D1_Form plateau 발견. v11은 일반화:
 *   - 5 archetype (weak-D2/D3/D4/balanced/strong/weak-D1)
 *   - 5 dim (D1-D5)
 *   - 각 (archetype, dim) 조합에서 12주 학습 시 gap closed % 매트릭스
 *
 * 목적:
 *   1. D1_Form 외 다른 dim도 plateau 발생하는가?
 *   2. weight 매트릭스의 어떤 (QT, dim) 셀이 systematically 학습 강화에 기여하는가?
 *   3. C4.1 게이트 외 추가 안전망 후보 발굴
 *
 * 실 학습자 도착 전 시뮬상에서 모든 dim 안전성 보장.
 *
 * Run:
 *   node scripts/dogfood-9-dim-plateau-scan.mjs [--weeks 12] [--seed 17]
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
    // v11 추가 — D5_Usage 약점 (담화 패턴 약함)
    baseDims: { D1_Form: 60, D2_Meaning: 55, D3_Context: 55, D4_Network: 55, D5_Usage: 30 },
    targetDims: { D1_Form: 85, D2_Meaning: 80, D3_Context: 80, D4_Network: 80, D5_Usage: 80 },
    tauDims: { D1_Form: 20, D2_Meaning: 22, D3_Context: 22, D4_Network: 22, D5_Usage: 18 },
  },
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
const LEARNING_THRESHOLD = 0.15;

let rngState;
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

function runSimulation(learner) {
  rngState = seed >>> 0;
  let currentDims = { ...learner.baseDims };
  const exposures = {};
  const qtCount = Object.fromEntries(QT_IDS.map((qt) => [qt, 0]));
  let sessionN = 0;
  for (let w = 0; w < weeks; w++) {
    for (let s = 0; s < sessionsPerWeek; s++) {
      sessionN++;
      let target = pickTargetQT(currentDims);
      if (sessionN > 1 && sessionN % 4 === 0) {
        const starved = pickStarvedQT(qtCount, target);
        if (starved) target = starved;
      }
      qtCount[target]++;
      const w_qt = WEIGHTS[target];
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
  return { finalDims: currentDims, gapClosed, qtCount };
}

// ─── Run matrix scan ────────────────────────────────────────────────────

const matrix = {};
for (const [archetype, profile] of Object.entries(ARCHETYPES)) {
  const learner = { archetype, ...profile };
  matrix[archetype] = runSimulation(learner);
}

// ─── Detect plateaus (gap closed < 30% considered plateau) ─────────────

const plateauThreshold = 30;
const plateaus = [];
for (const [archetype, result] of Object.entries(matrix)) {
  for (const dim of DIMS) {
    const closed = result.gapClosed[dim];
    if (closed !== null && closed < plateauThreshold) {
      plateaus.push({
        archetype,
        dim,
        gapClosed: closed,
        finalValue: +result.finalDims[dim].toFixed(1),
      });
    }
  }
}

// ─── Sum weighted contribution per dim per QT ──────────────────────────

const dimContribution = Object.fromEntries(DIMS.map((d) => [d, 0]));
for (const qt of QT_IDS) {
  for (const d of DIMS) {
    if (WEIGHTS[qt][d] >= LEARNING_THRESHOLD) {
      dimContribution[d] += WEIGHTS[qt][d];
    }
  }
}

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const outPath = join(ROOT, "out", `dogfood-9-dim-plateau-scan-${seed}.json`);
writeFileSync(outPath, JSON.stringify({
  seed, weeks, sessionsPerWeek, cardsPerSession,
  learningThreshold: LEARNING_THRESHOLD,
  plateauThreshold,
  gapClosedMatrix: Object.fromEntries(
    Object.entries(matrix).map(([a, r]) => [a, r.gapClosed])
  ),
  plateaus,
  dimContributionWeighted: dimContribution,
  finding: plateaus.length === 0
    ? "no plateaus detected"
    : `${plateaus.length} (archetype, dim) plateau combinations`,
}, null, 2));

// Print compact matrix
console.log(JSON.stringify({
  seed, weeks,
  matrix: Object.fromEntries(
    Object.entries(matrix).map(([a, r]) => [a, r.gapClosed])
  ),
  plateaus,
  dimContributionWeighted: dimContribution,
  outputPath: outPath.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
}, null, 2));
