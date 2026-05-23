#!/usr/bin/env node
/**
 * dogfooding-4 — exploration target effect simulation.
 *
 * Tests Phase 2 P-1 W9 exploration design (myprojects docs/02-design/
 * phase2-p1-recommendation-w9-exploration.md) hypothesis:
 *
 *   "exploration target이 매 N번째 세션마다 활성화되면 starvation QT의
 *    sample count가 증가하고 posteriorBalance가 0 → > 0.3으로 상승"
 *
 * Setup:
 *   - Start with dogfood-3 base (4 QT × 400 samples each = 1600)
 *   - Add 30 additional learner sessions
 *   - Every 4th session: queue uses exploration target (cold QT)
 *   - Other sessions: weakest QT (Thompson primary)
 *
 * Output: comparison of {before, after} posterior balance + starvation counts.
 *
 * Run: node scripts/dogfood-4-exploration.mjs [--sessions 30] [--seed 11]
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

const additionalSessions = args.sessions ? parseInt(args.sessions, 10) : 30;
const cardsPerSession = 10;
const explorationEveryN = 4;
const seed = args.seed ? parseInt(args.seed, 10) : 11;

let rngState = seed >>> 0;
function rng() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ─── Setup: prior + initial posteriors (mirror dogfood-3 result) ─────────

const QTS = [
  "TYPE-목적", "TYPE-심경", "TYPE-주장", "TYPE-요지", "TYPE-주제",
  "TYPE-제목", "TYPE-빈칸추론", "TYPE-흐름무관", "TYPE-순서배열", "TYPE-문장삽입",
];

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

// dogfood-3 baseline: 4 QTs with 400 samples
const initialSamples = {
  "TYPE-목적": 0,
  "TYPE-심경": 400,
  "TYPE-주장": 0,
  "TYPE-요지": 400,
  "TYPE-주제": 0,
  "TYPE-제목": 400,
  "TYPE-빈칸추론": 0,
  "TYPE-흐름무관": 0,
  "TYPE-순서배열": 400,
  "TYPE-문장삽입": 0,
};

// Build initial posteriors: alpha = 1 + 0.6*samples (avg accuracy 60%)
const posteriors = {};
for (const qt of QTS) {
  const n = initialSamples[qt];
  posteriors[qt] = {
    qtId: qt,
    alpha: 1 + n * 0.6,
    beta: 1 + n * 0.4,
    samples: n,
  };
}

// New learner profile (ext-001-like)
const dims = {
  D1_Form: 70,
  D2_Meaning: 38,
  D3_Context: 55,
  D4_Network: 42,
  D5_Usage: 60,
};

// ─── Helpers ───────────────────────────────────────────────────────────

function pickWeakest(dimsObj) {
  let weakest = null;
  let minP = 2;
  for (const qt of QTS) {
    const w = WEIGHTS[qt];
    let p = 0;
    for (const d of Object.keys(w)) p += w[d] * (dimsObj[d] / 100);
    if (p < minP) {
      minP = p;
      weakest = qt;
    }
  }
  return weakest;
}

function findExplorationTarget(map, exclude = []) {
  let best = null;
  const excludeSet = new Set(exclude);
  for (const qt of QTS) {
    if (excludeSet.has(qt)) continue;
    const post = map[qt];
    if (post.samples >= 20) continue;
    const sum = post.alpha + post.beta;
    const variance = (post.alpha * post.beta) / (sum * sum * (sum + 1));
    const info = variance / (1 + post.samples);
    if (!best || info > best.info) {
      best = { qt, samples: post.samples, info };
    }
  }
  return best;
}

function posteriorBalance(map) {
  const samples = QTS.map((qt) => map[qt].samples);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (mean === 0) return 0;
  return Math.min(...samples) / mean;
}

function sampleCorrectness(dimsObj, qtId) {
  const w = WEIGHTS[qtId];
  let p = 0;
  for (const d of Object.keys(w)) p += w[d] * (dimsObj[d] / 100);
  return rng() < Math.max(0, Math.min(1, p + (rng() - 0.5) * 0.1));
}

// ─── Simulation ────────────────────────────────────────────────────────

const before = {
  balance: posteriorBalance(posteriors),
  starved: QTS.filter((qt) => posteriors[qt].samples === 0).length,
  totalSamples: Object.values(posteriors).reduce((s, p) => s + p.samples, 0),
};

const trajectory = [];
const weakest = pickWeakest(dims); // 매 세션 동일 (dim stable)
let explorationSessions = 0;
let exploitationSessions = 0;

for (let s = 0; s < additionalSessions; s++) {
  const useExploration = (s + 1) % explorationEveryN === 0;
  let targetQT;
  if (useExploration) {
    const exp = findExplorationTarget(posteriors, [weakest]);
    targetQT = exp ? exp.qt : weakest;
    if (exp) explorationSessions++;
    else exploitationSessions++;
  } else {
    targetQT = weakest;
    exploitationSessions++;
  }

  for (let c = 0; c < cardsPerSession; c++) {
    const correct = sampleCorrectness(dims, targetQT);
    const post = posteriors[targetQT];
    post.alpha += correct ? 1 : 0;
    post.beta += correct ? 0 : 1;
    post.samples += 1;
  }

  trajectory.push({
    session: s + 1,
    targetQT,
    mode: useExploration ? "explore" : "exploit",
    balance: posteriorBalance(posteriors),
    starved: QTS.filter((qt) => posteriors[qt].samples === 0).length,
  });
}

const after = {
  balance: posteriorBalance(posteriors),
  starved: QTS.filter((qt) => posteriors[qt].samples === 0).length,
  totalSamples: Object.values(posteriors).reduce((s, p) => s + p.samples, 0),
};

const samplesPerQT = {};
for (const qt of QTS) samplesPerQT[qt] = posteriors[qt].samples;

// ─── Output ────────────────────────────────────────────────────────────

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const path = join(ROOT, "out", `dogfood-4-exploration-${seed}.json`);
writeFileSync(
  path,
  JSON.stringify(
    {
      seed,
      additionalSessions,
      explorationEveryN,
      explorationSessions,
      exploitationSessions,
      weakestQT: weakest,
      before,
      after,
      delta: {
        balance: after.balance - before.balance,
        starved: after.starved - before.starved,
        addedSamples: after.totalSamples - before.totalSamples,
      },
      samplesPerQT,
      trajectory: trajectory.slice(0, 5).concat([{ session: "...", mode: "..." }]).concat(trajectory.slice(-3)),
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      seed,
      before,
      after,
      explorationSessions,
      exploitationSessions,
      balanceImproved: after.balance > before.balance,
      starvationReduced: after.starved < before.starved,
      samplesPerQT,
      outputPath: path.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
    },
    null,
    2
  )
);
