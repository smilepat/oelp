#!/usr/bin/env node
/**
 * Simulate varied-diagnostic dogfooding for P-1.5b validation.
 *
 * Generates N learners × M sessions × varied diagnosticScores (rank > 1 X).
 * Each session: 10 cards from buildQueueV2 logic equivalent (target weak QT
 * + IRT b matching). Correctness sampled from a TRUE weight model close to
 * (but not identical to) the current v2 ontology weights — simulates a
 * realistic scenario where real users converge near the heuristic prior.
 *
 * Writes data/simulated-dogfooding-{N}-{timestamp}.json with the schema
 * expected by scripts/calibrate.mjs.
 *
 * Goal: verify P-1.5b + calibrate.mjs + promote-weights.mjs (C4.1 gate)
 * end-to-end with quality varied input.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
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

const numLearners = args.learners ? parseInt(args.learners, 10) : 5;
const sessionsPerLearner = args.sessions ? parseInt(args.sessions, 10) : 3;
const cardsPerSession = args.cards ? parseInt(args.cards, 10) : 10;
const noiseLevel = args.noise ? parseFloat(args.noise) : 0.05;

// ─── Load current weights from JSON (single source) ─────────────────

const WEIGHTS_JSON = JSON.parse(
  readFileSync(join(ROOT, "lib", "ontology-weights.json"), "utf-8")
);
const CURRENT_WEIGHTS = WEIGHTS_JSON.weights;
const QT_IDS = Object.keys(CURRENT_WEIGHTS);
const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

// "TRUE" weights: slightly perturbed from current v2 to simulate real-world
// drift. Calibration should ideally converge back toward TRUE.
function perturbWeights(w, magnitude = 0.05) {
  const out = { D1_Form: 0.05 };
  let remaining = 0.95;
  const d2_d5 = ["D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];
  for (let i = 0; i < d2_d5.length - 1; i++) {
    const d = d2_d5[i];
    const noise = (Math.random() - 0.5) * 2 * magnitude;
    out[d] = Math.max(0.02, Math.min(0.7, w[d] + noise));
    remaining -= out[d];
  }
  out[d2_d5[d2_d5.length - 1]] = Math.max(0.02, remaining);
  // Re-normalize so sum = 1
  const sum = DIMS.reduce((s, d) => s + out[d], 0);
  for (const d of DIMS) out[d] = out[d] / sum;
  return out;
}

const TRUE_WEIGHTS = {};
for (const qtId of QT_IDS) {
  TRUE_WEIGHTS[qtId] = perturbWeights(CURRENT_WEIGHTS[qtId]);
}

// ─── Diagnostic profiles (varied across learners) ────────────────────

function randomDiagnostic(learnerIdx) {
  // 6 learner archetypes — each gives varied scores
  const archetypes = [
    // Strong D1+D2, weak D3+D4 (typical 고2)
    { D1_Form: 80, D2_Meaning: 78, D3_Context: 45, D4_Network: 55, D5_Usage: 70, theta: 0.3 },
    // Weak D5_Usage (grammar weak)
    { D1_Form: 75, D2_Meaning: 82, D3_Context: 65, D4_Network: 70, D5_Usage: 35, theta: 0.5 },
    // Strong D3+D4 (advanced learner)
    { D1_Form: 85, D2_Meaning: 88, D3_Context: 80, D4_Network: 82, D5_Usage: 75, theta: 1.2 },
    // Low overall (beginner)
    { D1_Form: 50, D2_Meaning: 45, D3_Context: 30, D4_Network: 35, D5_Usage: 40, theta: -1.0 },
    // Balanced average
    { D1_Form: 65, D2_Meaning: 68, D3_Context: 60, D4_Network: 62, D5_Usage: 64, theta: 0.0 },
    // Strong D4 (vocab network), weak D5 (usage)
    { D1_Form: 70, D2_Meaning: 75, D3_Context: 60, D4_Network: 88, D5_Usage: 40, theta: 0.4 },
  ];
  const base = archetypes[learnerIdx % archetypes.length];
  // Add per-session jitter ±5 for natural variation
  const scores = {};
  for (const d of DIMS) {
    scores[d] = Math.max(10, Math.min(95, base[d] + (Math.random() - 0.5) * 10));
  }
  return { ...scores, theta: base.theta + (Math.random() - 0.5) * 0.4 };
}

// ─── Weakest QT picker (rule-v1 equivalent) ────────────────────────

function predictCorrectness(scores, weights) {
  let sum = 0;
  for (const d of DIMS) sum += weights[d] * (scores[d] / 100);
  return sum;
}

function pickWeakestQT(scores) {
  let weakest = null;
  let lowestP = Infinity;
  for (const qtId of QT_IDS) {
    const p = predictCorrectness(scores, CURRENT_WEIGHTS[qtId]);
    if (p < lowestP) {
      lowestP = p;
      weakest = qtId;
    }
  }
  return weakest;
}

// ─── Generate responses ───────────────────────────────────────────────

const responses = [];

for (let learnerIdx = 0; learnerIdx < numLearners; learnerIdx++) {
  for (let sessionIdx = 0; sessionIdx < sessionsPerLearner; sessionIdx++) {
    const diag = randomDiagnostic(learnerIdx);
    const { theta: _theta, ...scores } = diag;
    const targetQT = pickWeakestQT(scores);
    const trueW = TRUE_WEIGHTS[targetQT];
    for (let card = 0; card < cardsPerSession; card++) {
      // Compute true probability of correct
      let p = predictCorrectness(scores, trueW);
      // Add per-card noise
      p += (Math.random() - 0.5) * noiseLevel * 2;
      p = Math.max(0.05, Math.min(0.95, p));
      const isCorrect = Math.random() < p;
      responses.push({
        qtId: targetQT,
        dimensionScores: scores,
        isCorrect,
      });
    }
  }
}

// ─── Write output ────────────────────────────────────────────────────

if (!existsSync(join(ROOT, "data"))) mkdirSync(join(ROOT, "data"));
const filename = `simulated-dogfooding-${numLearners}x${sessionsPerLearner}-${Date.now()}.json`;
const outPath = join(ROOT, "data", filename);
writeFileSync(outPath, JSON.stringify(responses, null, 2));

console.log(`=== Simulation Summary ===`);
console.log(`Learners: ${numLearners} × Sessions: ${sessionsPerLearner} × Cards: ${cardsPerSession}`);
console.log(`Total responses: ${responses.length}`);
console.log(`Noise level: ${noiseLevel}`);
console.log(`Output: data/${filename}`);

console.log(`\n=== Per-QT response count ===`);
const byQT = {};
for (const r of responses) byQT[r.qtId] = (byQT[r.qtId] || 0) + 1;
for (const qtId of QT_IDS) {
  const n = byQT[qtId] || 0;
  console.log(`  ${qtId.padEnd(15)} ${n}`);
}

console.log(`\n=== TRUE weights (vs current v2 prior) ===`);
for (const qtId of QT_IDS) {
  const t = TRUE_WEIGHTS[qtId];
  const c = CURRENT_WEIGHTS[qtId];
  const diffs = DIMS.slice(1).map((d) => {
    const td = (t[d] * 100).toFixed(0);
    const cd = (c[d] * 100).toFixed(0);
    return `${d.slice(0, 2)}:${cd}→${td}`;
  }).join(" ");
  console.log(`  ${qtId.padEnd(15)} ${diffs}`);
}
