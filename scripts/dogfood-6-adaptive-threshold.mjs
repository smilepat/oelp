#!/usr/bin/env node
/**
 * dogfooding-6 — adaptive maxSamplesToConsider verification.
 *
 * Tests R5 fix (smilepat/myprojects docs/03-analysis/
 * exploration-policy-long-run-analysis.md §3.1):
 *   adaptive=true scales threshold with mean → exploration continues
 *   for "relatively under-sampled" QTs even at high N.
 *
 * Compare:
 *   dogfood-5 fixed (200 sess): balance 0 → 0.056 (악화 시작)
 *   dogfood-5 fixed (500 sess): balance 0 → 0.030 (악화 지속)
 *   dogfood-6 adaptive (200/500): expected → balance 점진 상승
 *
 * Run: node scripts/dogfood-6-adaptive-threshold.mjs [--sessions 500] [--seed 23]
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

const additionalSessions = args.sessions ? parseInt(args.sessions, 10) : 500;
const cardsPerSession = 10;
const seed = args.seed ? parseInt(args.seed, 10) : 23;
const useAdaptive = args.adaptive !== false; // default ON in this script
const adaptiveRatio = args.ratio ? parseFloat(args.ratio) : 0.3;

let rngState = seed >>> 0;
function rng() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

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

const initialSamples = {
  "TYPE-목적": 0, "TYPE-심경": 400, "TYPE-주장": 0, "TYPE-요지": 400, "TYPE-주제": 0,
  "TYPE-제목": 400, "TYPE-빈칸추론": 0, "TYPE-흐름무관": 0, "TYPE-순서배열": 400, "TYPE-문장삽입": 0,
};

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

const dims = { D1_Form: 70, D2_Meaning: 38, D3_Context: 55, D4_Network: 42, D5_Usage: 60 };

function pickWeakest(dimsObj) {
  let weakest = null, minP = 2;
  for (const qt of QTS) {
    const w = WEIGHTS[qt];
    let p = 0;
    for (const d of Object.keys(w)) p += w[d] * (dimsObj[d] / 100);
    if (p < minP) { minP = p; weakest = qt; }
  }
  return weakest;
}

/**
 * adaptive=true: cap = max(fixed, mean × ratio)
 * adaptive=false: cap = fixed (20)
 */
function findExp(map, exclude = []) {
  const fixed = 20;
  let cap = fixed;
  if (useAdaptive) {
    const meanSamples =
      QTS.reduce((s, qt) => s + map[qt].samples, 0) / QTS.length;
    cap = Math.max(fixed, meanSamples * adaptiveRatio);
  }
  let best = null;
  const excludeSet = new Set(exclude);
  for (const qt of QTS) {
    if (excludeSet.has(qt)) continue;
    const post = map[qt];
    if (post.samples >= cap) continue;
    const sum = post.alpha + post.beta;
    const variance = (post.alpha * post.beta) / (sum * sum * (sum + 1));
    const info = variance / (1 + post.samples);
    if (!best || info > best.info) best = { qt, samples: post.samples, info };
  }
  return best;
}

function balance(map) {
  const samples = QTS.map((qt) => map[qt].samples);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (mean === 0) return 0;
  return Math.min(...samples) / mean;
}

function shouldExplore(b, n) {
  if (n < 1) return false;
  if (b < 0.1) return n % 2 === 0;
  if (b < 0.5) return n % 4 === 0;
  return false;
}

function sampleCorrectness(dimsObj, qtId) {
  const w = WEIGHTS[qtId];
  let p = 0;
  for (const d of Object.keys(w)) p += w[d] * (dimsObj[d] / 100);
  return rng() < Math.max(0, Math.min(1, p + (rng() - 0.5) * 0.1));
}

const before = {
  balance: balance(posteriors),
  starved: QTS.filter((qt) => posteriors[qt].samples === 0).length,
  total: Object.values(posteriors).reduce((s, p) => s + p.samples, 0),
};

const weakest = pickWeakest(dims);
let exploreCount = 0, exploitCount = 0;

// Trajectory snapshots at 50/100/200/500 sessions
const snapshots = {};
const snapPoints = new Set([50, 100, 200, 500]);

for (let s = 0; s < additionalSessions; s++) {
  const currentBalance = balance(posteriors);
  const explore = shouldExplore(currentBalance, s + 1);
  let targetQT;
  if (explore) {
    const exp = findExp(posteriors, [weakest]);
    targetQT = exp ? exp.qt : weakest;
    if (exp) exploreCount++;
    else exploitCount++;
  } else {
    targetQT = weakest;
    exploitCount++;
  }
  for (let c = 0; c < cardsPerSession; c++) {
    const correct = sampleCorrectness(dims, targetQT);
    const post = posteriors[targetQT];
    post.alpha += correct ? 1 : 0;
    post.beta += correct ? 0 : 1;
    post.samples += 1;
  }
  if (snapPoints.has(s + 1)) {
    snapshots[`session_${s + 1}`] = {
      balance: balance(posteriors),
      min: Math.min(...QTS.map((qt) => posteriors[qt].samples)),
      max: Math.max(...QTS.map((qt) => posteriors[qt].samples)),
      mean: QTS.reduce((sum, qt) => sum + posteriors[qt].samples, 0) / QTS.length,
      starved: QTS.filter((qt) => posteriors[qt].samples === 0).length,
    };
  }
}

const after = {
  balance: balance(posteriors),
  starved: QTS.filter((qt) => posteriors[qt].samples === 0).length,
  total: Object.values(posteriors).reduce((s, p) => s + p.samples, 0),
};

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const path = join(ROOT, "out", `dogfood-6-adaptive-${seed}.json`);
writeFileSync(
  path,
  JSON.stringify(
    {
      seed,
      additionalSessions,
      useAdaptive,
      adaptiveRatio,
      before,
      after,
      exploreCount,
      exploitCount,
      explorationRate: (exploreCount / additionalSessions).toFixed(3),
      snapshots,
      samplesPerQT: Object.fromEntries(QTS.map((qt) => [qt, posteriors[qt].samples])),
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      seed,
      useAdaptive,
      adaptiveRatio,
      sessions: additionalSessions,
      explorationRate: (exploreCount / additionalSessions).toFixed(3),
      before,
      after,
      balanceImproved: after.balance > before.balance,
      snapshots,
      outputPath: path.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
    },
    null,
    2
  )
);
