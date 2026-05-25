#!/usr/bin/env node
/**
 * dogfood-14 — 학습자 spike pattern (휴학 / 복귀 cycle) 시뮬.
 *
 * dogfood-8~13은 모두 일정 학습 패턴 (3 sessions/week 균일) 가정.
 * 실 학습자는 시험 기간 집중 → 휴학 → 복귀 cycle을 반복하는 게 더 현실적.
 *
 * 시나리오:
 *   - Period A: 4주 active (3 sessions/week)
 *   - Period B: 8주 휴학 (0 sessions)
 *   - Period C: 4주 복귀 active
 *   - Period D: 8주 휴학 (0 sessions)
 *   - 총 24주, 평균 sessions = 활성기 절반
 *
 * 비교:
 *   - Continuous baseline (균일 24주)
 *   - Spike pattern (4-8-4-8 cycle)
 *
 * 발견 가설: spike pattern에서 forgetting 효과가 더 극단적 → D1
 * negative gap 가속화 가능성. 다른 dim도 휴학기 동안 부분 손실 후 복귀기
 * 재학습.
 *
 * Run: node scripts/dogfood-14-spike-pattern.mjs [--decay-rate 0.97]
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
const totalWeeks = 24;
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
 * Generate session schedule.
 * mode='continuous': 3 sessions/week × 24 weeks = 72 sessions
 * mode='spike': 4w active + 8w break + 4w active + 8w break = 24 sessions × 2 periods = 48 active
 * Returns array of session week indices (e.g., [1, 1, 1, 2, 2, 2, ...]).
 */
function scheduleSessions(mode) {
  const schedule = [];
  if (mode === "continuous") {
    for (let w = 1; w <= totalWeeks; w++) {
      schedule.push(w, w, w); // 3/week
    }
  } else if (mode === "spike") {
    // Period A: weeks 1-4 active
    for (let w = 1; w <= 4; w++) schedule.push(w, w, w);
    // Period B: weeks 5-12 break (no sessions)
    // Period C: weeks 13-16 active
    for (let w = 13; w <= 16; w++) schedule.push(w, w, w);
    // Period D: weeks 17-24 break
  }
  return schedule;
}

function runSchedule(scheduleMode) {
  rngState = seed >>> 0;
  let dims = { ...learner.baseDims };
  const exposures = Object.fromEntries(DIMS.map((d) => [d, 0]));
  const lastExposureSession = Object.fromEntries(DIMS.map((d) => [d, 0]));
  const qtCount = Object.fromEntries(QT_IDS.map((qt) => [qt, 0]));
  const schedule = scheduleSessions(scheduleMode);
  const totalSessions = schedule.length;

  // Build "sessionWeek" → "global session index" with gap awareness.
  // Forgetting decay applies per global session (calendar week × 3) — even
  // during breaks, time passes and decay applies.
  // For spike mode, we represent each week as 3 "potential" session slots;
  // when learner is on break, the slot still counts for decay purposes.
  const slotsPerWeek = 3;
  let slotIdx = 0;
  let scheduleIdx = 0;
  for (let w = 1; w <= totalWeeks; w++) {
    for (let s = 0; s < slotsPerWeek; s++) {
      slotIdx++;
      // Apply forgetting decay (always, regardless of whether learner used this slot)
      for (const d of DIMS) {
        const sinceLast = slotIdx - lastExposureSession[d];
        if (sinceLast > DECAY_GRACE_SESSIONS) {
          const effectiveDecay = Math.pow(DECAY_RATE, sinceLast - DECAY_GRACE_SESSIONS);
          const floor = learner.baseDims[d] * DECAY_FLOOR_FACTOR;
          dims[d] = Math.max(floor, dims[d] * effectiveDecay);
        }
      }
      // Did learner use this slot?
      if (scheduleIdx < schedule.length && schedule[scheduleIdx] === w) {
        scheduleIdx++;
        // Pick target QT
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
  return { finalDims: dims, gapClosed, totalSessions };
}

const continuous = runSchedule("continuous");
const spike = runSchedule("spike");

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const outPath = join(ROOT, "out", `dogfood-14-spike-pattern-${seed}.json`);
writeFileSync(outPath, JSON.stringify({
  seed,
  totalWeeks,
  decayRate: DECAY_RATE,
  decayGraceSessions: DECAY_GRACE_SESSIONS,
  decayFloorFactor: DECAY_FLOOR_FACTOR,
  continuous: {
    sessionsCount: continuous.totalSessions,
    finalDims: continuous.finalDims,
    gapClosed: continuous.gapClosed,
  },
  spike: {
    sessionsCount: spike.totalSessions,
    finalDims: spike.finalDims,
    gapClosed: spike.gapClosed,
    pattern: "4w active + 8w break + 4w active + 8w break",
  },
  delta: Object.fromEntries(
    DIMS.map((d) => [d, spike.gapClosed[d] === null || continuous.gapClosed[d] === null
      ? null
      : spike.gapClosed[d] - continuous.gapClosed[d]])
  ),
}, null, 2));

console.log(JSON.stringify({
  seed,
  totalWeeks,
  decayRate: DECAY_RATE,
  continuousSessions: continuous.totalSessions,
  spikeSessions: spike.totalSessions,
  gapClosedComparison: Object.fromEntries(
    DIMS.map((d) => [d, {
      continuous: `${continuous.gapClosed[d]}%`,
      spike: `${spike.gapClosed[d]}%`,
      delta: spike.gapClosed[d] === null || continuous.gapClosed[d] === null
        ? "—"
        : `${spike.gapClosed[d] - continuous.gapClosed[d]}%p`,
    }])
  ),
  finding: "spike pattern: 휴학 기간 forgetting decay 누적 → 복귀기 학습량 부족 시 dim 회복 어려움",
  outputPath: outPath.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
}, null, 2));
