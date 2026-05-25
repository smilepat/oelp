#!/usr/bin/env node
/**
 * dogfood-15 — 다양한 spike pattern 비교 (1w/2w/4w/8w break).
 *
 * dogfood-14는 단일 시나리오 (4w active + 8w break × 2). v19는 휴학 기간
 * 길이가 학습 손실에 미치는 영향을 정량 측정:
 *   - Continuous: 24w 균일 (3 sessions/week)
 *   - Break 1w: 23w active + 1w break (회복 시간 측정용)
 *   - Break 2w: 22w active + 2w break
 *   - Break 4w: 20w active + 4w break
 *   - Break 8w: 16w active + 8w break
 *   - Cycle: dogfood-14와 동일 (4w + 8w × 2)
 *
 * 측정: 각 시나리오의 24주차 최종 gap closed (D2-D5 평균).
 * 발견: 어느 break 길이부터 negative gap 시작하는가?
 *
 * Stage C 운영 가이드 — 학습자 retention 정책 임계 도출.
 *
 * Run: node scripts/dogfood-15-spike-variants.mjs [--decay-rate 0.97]
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
const TOTAL_WEEKS = 24;
const SESSIONS_PER_WEEK = 3;
const cardsPerSession = 10;
const LEARNING_THRESHOLD = 0.15;
const DECAY_RATE = args["decay-rate"] ? parseFloat(args["decay-rate"]) : 0.97;
const DECAY_GRACE_SESSIONS = 3;
const DECAY_FLOOR_FACTOR = 0.7;

const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

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

/**
 * Schedule: active weeks based on scenario.
 * 'continuous': 24w all active
 * 'break-Nw': 1 break of N weeks in the middle, rest active
 *   e.g., break-4w = 10w active + 4w break + 10w active
 * 'cycle': dogfood-14 style — 4w active + 8w break × 2
 */
function activeWeeksFor(scenario) {
  const allWeeks = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);
  if (scenario === "continuous") return allWeeks;
  const m = scenario.match(/^break-(\d+)w$/);
  if (m) {
    const breakLen = parseInt(m[1], 10);
    const halfBreak = Math.floor(breakLen / 2);
    const midStart = Math.floor((TOTAL_WEEKS - breakLen) / 2) + 1;
    const midEnd = midStart + breakLen - 1;
    return allWeeks.filter((w) => w < midStart || w > midEnd);
  }
  if (scenario === "cycle") {
    return [1, 2, 3, 4, 13, 14, 15, 16];
  }
  throw new Error(`Unknown scenario: ${scenario}`);
}

function runScenario(scenario) {
  const activeWeeks = new Set(activeWeeksFor(scenario));
  rngState = seed >>> 0;
  let dims = { ...learner.baseDims };
  const exposures = Object.fromEntries(DIMS.map((d) => [d, 0]));
  const lastExposureSession = Object.fromEntries(DIMS.map((d) => [d, 0]));
  const qtCount = Object.fromEntries(QT_IDS.map((qt) => [qt, 0]));
  let slotIdx = 0;
  let totalSessions = 0;

  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    for (let s = 0; s < SESSIONS_PER_WEEK; s++) {
      slotIdx++;
      // Forgetting decay (always applies)
      for (const d of DIMS) {
        const sinceLast = slotIdx - lastExposureSession[d];
        if (sinceLast > DECAY_GRACE_SESSIONS) {
          const effectiveDecay = Math.pow(DECAY_RATE, sinceLast - DECAY_GRACE_SESSIONS);
          const floor = learner.baseDims[d] * DECAY_FLOOR_FACTOR;
          dims[d] = Math.max(floor, dims[d] * effectiveDecay);
        }
      }
      if (activeWeeks.has(w)) {
        totalSessions++;
        let target = pickTargetQT(dims);
        if (slotIdx > 1 && slotIdx % 4 === 0) {
          const starved = pickStarvedQT(qtCount, target);
          if (starved) target = starved;
        }
        qtCount[target]++;
        const w_qt = WEIGHTS[target];
        for (const d of DIMS) {
          if (w_qt[d] < LEARNING_THRESHOLD) continue;
          exposures[d] += cardsPerSession * w_qt[d];
          lastExposureSession[d] = slotIdx;
          const base = learner.baseDims[d];
          const tgt = learner.targetDims[d];
          const tau = learner.tauDims[d];
          const learned = base + (tgt - base) * (1 - Math.exp(-exposures[d] / tau));
          dims[d] = Math.max(dims[d], Math.max(0, Math.min(100, learned + (rng() - 0.5) * 1.5)));
        }
      }
    }
  }

  const gapClosed = {};
  for (const d of DIMS) {
    const gap = learner.targetDims[d] - learner.baseDims[d];
    const closed = dims[d] - learner.baseDims[d];
    gapClosed[d] = gap === 0 ? null : +((closed / gap) * 100).toFixed(0);
  }
  const learnableDims = DIMS.filter((d) => d !== "D1_Form"); // D1 floor 영향 제외
  const avgGapClosed = +(
    learnableDims.reduce((s, d) => s + (gapClosed[d] ?? 0), 0) / learnableDims.length
  ).toFixed(1);
  return { totalSessions, gapClosed, avgGapClosed_excD1: avgGapClosed };
}

const SCENARIOS = [
  "continuous",
  "break-1w",
  "break-2w",
  "break-4w",
  "break-8w",
  "cycle",
];

const results = {};
for (const sc of SCENARIOS) {
  results[sc] = runScenario(sc);
}

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const outPath = join(ROOT, "out", `dogfood-15-spike-variants-${seed}.json`);
writeFileSync(outPath, JSON.stringify({
  seed,
  totalWeeks: TOTAL_WEEKS,
  sessionsPerWeek: SESSIONS_PER_WEEK,
  decayRate: DECAY_RATE,
  scenarios: results,
}, null, 2));

// Find threshold: at what break length does avg dim go negative?
const breakResults = SCENARIOS
  .filter((s) => s.startsWith("break-"))
  .map((s) => ({
    scenario: s,
    breakLen: parseInt(s.match(/(\d+)w/)[1], 10),
    sessions: results[s].totalSessions,
    avgGapClosed: results[s].avgGapClosed_excD1,
    isNegative: results[s].avgGapClosed_excD1 < 0,
  }))
  .sort((a, b) => a.breakLen - b.breakLen);

const negativeThresholdIdx = breakResults.findIndex((r) => r.isNegative);
const retentionThreshold = negativeThresholdIdx === -1
  ? null
  : breakResults[negativeThresholdIdx].breakLen;

console.log(JSON.stringify({
  seed,
  totalWeeks: TOTAL_WEEKS,
  scenarioComparison: SCENARIOS.map((s) => ({
    scenario: s,
    sessions: results[s].totalSessions,
    avgGapClosed_excD1: `${results[s].avgGapClosed_excD1}%`,
    D2: `${results[s].gapClosed.D2_Meaning}%`,
    D3: `${results[s].gapClosed.D3_Context}%`,
    D4: `${results[s].gapClosed.D4_Network}%`,
    D5: `${results[s].gapClosed.D5_Usage}%`,
  })),
  retentionThreshold: retentionThreshold === null
    ? "no negative gap up to 8w break"
    : `${retentionThreshold}w break → negative gap starts`,
  finding: "휴학 기간이 길수록 학습 손실 비선형 누적. retention 정책 임계 도출.",
  outputPath: outPath.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
}, null, 2));
