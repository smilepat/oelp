#!/usr/bin/env node
/**
 * dogfooding-3 — preset-based varied diagnostic simulator.
 *
 * Builds on P-1.5b infrastructure (4 presets α/β/γ/δ) by:
 *   1. For each preset → N synthetic learners with that diagnostic profile.
 *   2. Each learner runs M sessions of 10 cards.
 *   3. Correctness for each card sampled from a TRUE weight model that
 *      matches the preset's weakness profile.
 *
 * Output: data/dogfood-3-presets-{N×M}.json compatible with calibrate.mjs.
 *
 * Why this matters: dogfooding-1/2 had limited dimensionScores variation
 * (1 and 120 unique). With 4 presets × N learners + per-learner noise,
 * we get N×4 distinct dimensionScores points — meaningful for ridge
 * regression identifiability.
 *
 * Usage:
 *   node scripts/dogfood-3-presets.mjs --learners 5 --sessions 4
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

const learnersPerPreset = args.learners ? parseInt(args.learners, 10) : 5;
const sessionsPerLearner = args.sessions ? parseInt(args.sessions, 10) : 4;
const cardsPerSession = args.cards ? parseInt(args.cards, 10) : 10;
const seed = args.seed ? parseInt(args.seed, 10) : 42;

// Seeded RNG (mulberry32) — reproducible runs
let rngState = seed >>> 0;
function rng() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ─── 4 preset base profiles (mirror lib/diagnostic-presets.ts) ──────────

const PRESETS = [
  {
    id: "alpha",
    dims: { D1_Form: 75, D2_Meaning: 82, D3_Context: 38, D4_Network: 52, D5_Usage: 68 },
  },
  {
    id: "beta",
    dims: { D1_Form: 42, D2_Meaning: 78, D3_Context: 65, D4_Network: 70, D5_Usage: 35 },
  },
  {
    id: "gamma",
    dims: { D1_Form: 80, D2_Meaning: 40, D3_Context: 72, D4_Network: 75, D5_Usage: 70 },
  },
  {
    id: "delta",
    dims: { D1_Form: 55, D2_Meaning: 50, D3_Context: 48, D4_Network: 45, D5_Usage: 52 },
  },
];

// ─── 10 QT × 5D weight matrix (mirrors ontology-weights.json v2) ────────

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

// Pick a queue's target QT given diagnostic — same as buildQueue (weakest)
function pickTargetQT(dims) {
  let weakest = null;
  let minP = 2;
  for (const [qtId, w] of Object.entries(WEIGHTS)) {
    let p = 0;
    for (const d of Object.keys(w)) p += w[d] * (dims[d] / 100);
    if (p < minP) {
      minP = p;
      weakest = qtId;
    }
  }
  return weakest;
}

// Sample correctness from Bernoulli(predictedCorrectness with bias)
function sampleCorrectness(dims, qtId) {
  const w = WEIGHTS[qtId];
  let p = 0;
  for (const d of Object.keys(w)) p += w[d] * (dims[d] / 100);
  // Add small noise: bias by ±0.05 so simulator doesn't exactly match prior
  const bias = (rng() - 0.5) * 0.1;
  return rng() < Math.max(0, Math.min(1, p + bias));
}

// ─── Generate responses ────────────────────────────────────────────────

const responses = [];
let learnerIdx = 0;

for (const preset of PRESETS) {
  for (let l = 0; l < learnersPerPreset; l++) {
    learnerIdx++;
    // Add per-learner noise to base preset (±3 per dim) — varies scores
    const dims = {};
    for (const d of Object.keys(preset.dims)) {
      dims[d] = Math.max(0, Math.min(100, preset.dims[d] + (rng() - 0.5) * 6));
      dims[d] = Math.round(dims[d]);
    }
    // Round-trip variety: each learner gets multiple sessions, each may target
    // different QT depending on dim drift, but typically the same
    for (let s = 0; s < sessionsPerLearner; s++) {
      const targetQT = pickTargetQT(dims);
      for (let c = 0; c < cardsPerSession; c++) {
        responses.push({
          qtId: targetQT,
          dimensionScores: dims,
          isCorrect: sampleCorrectness(dims, targetQT),
        });
      }
    }
  }
}

// ─── Output ────────────────────────────────────────────────────────────

if (!existsSync(join(ROOT, "data"))) mkdirSync(join(ROOT, "data"));

const total = learnersPerPreset * 4 * sessionsPerLearner * cardsPerSession;
const path = join(ROOT, "data", `dogfood-3-presets-${total}.json`);
writeFileSync(path, JSON.stringify(responses, null, 2));

// Summary stats
const qtCounts = {};
const uniqueDims = new Set();
const accByQt = {};
for (const r of responses) {
  qtCounts[r.qtId] = (qtCounts[r.qtId] || 0) + 1;
  uniqueDims.add(JSON.stringify(r.dimensionScores));
  accByQt[r.qtId] = accByQt[r.qtId] ?? { correct: 0, total: 0 };
  accByQt[r.qtId].total++;
  if (r.isCorrect) accByQt[r.qtId].correct++;
}

console.log(
  JSON.stringify(
    {
      totalResponses: responses.length,
      uniqueDimensionScores: uniqueDims.size,
      learnersPerPreset,
      sessionsPerLearner,
      cardsPerSession,
      seed,
      qtDistribution: qtCounts,
      accuracyByQt: Object.fromEntries(
        Object.entries(accByQt).map(([k, v]) => [k, (v.correct / v.total).toFixed(3)])
      ),
      outputPath: `data/dogfood-3-presets-${total}.json`,
    },
    null,
    2
  )
);
