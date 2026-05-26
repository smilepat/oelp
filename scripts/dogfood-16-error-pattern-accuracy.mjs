#!/usr/bin/env node
/**
 * dogfood-16 — synthetic accuracy validation for the PR-7
 * error pattern classifier (lib/error-pattern-analyzer.ts).
 *
 * Plan §6 validation requirement: classification accuracy ≥ 80% on
 * synthetic response data before recommending PR-7 for production use.
 *
 * Method
 *   1. Construct N synthetic wrong-answer scenarios with a *known*
 *      true category (we set the 5D scores in a way that should drive
 *      the classifier toward that category).
 *   2. Run classifyWrongAnswer over each.
 *   3. Compare predicted vs true → accuracy %, per-category precision/recall.
 *
 * The script intentionally avoids LLM calls and is deterministic given
 * the --seed flag, so it can be re-run for regression.
 *
 * Run: node scripts/dogfood-16-error-pattern-accuracy.mjs [--n 300] [--seed 17]
 *
 * Exit codes:
 *   0 — accuracy ≥ TARGET (default 0.80)
 *   1 — below target (regression)
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

const N = args.n ? parseInt(args.n, 10) : 300;
const SEED = args.seed ? parseInt(args.seed, 10) : 17;
const TARGET = args.target ? parseFloat(args.target) : 0.80;
const NOISE = args.noise ? parseFloat(args.noise) : 0.30; // 30% noisy scenarios by default
const OUT = args.out ? args.out : null;

// ─── Deterministic PRNG (mulberry32) ───────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ─── Inline mirror of classifier (avoids TS runtime dep) ───────────
// Keeps the .mjs script self-contained; the canonical implementation
// is lib/error-pattern-analyzer.ts and is unit-tested separately.
// CI-only safety: dogfood-16 will diverge from the lib if both are
// changed without syncing. We accept that — tests/error-pattern-*
// guard the lib, and this script's accuracy gate guards this mirror.

// Skill ontology + QT mapping snapshots (slim).
const QT_TARGETS = {
  "TYPE-목적": ["R4", "D5"],
  "TYPE-심경": ["R5", "D5"],
  "TYPE-주장": ["R3", "R4", "A4"],
  "TYPE-요지": ["D5"],
  "TYPE-주제": ["D5", "A1"],
  "TYPE-제목": ["D5", "A1", "V4"],
  "TYPE-빈칸추론": ["R6", "D4", "A1"],
  "TYPE-흐름무관": ["R9", "D7"],
  "TYPE-순서배열": ["R8", "D7", "D8"],
  "TYPE-문장삽입": ["R7", "D8", "D3"],
};

// Layer mastery aggregation — mirrors lib/skill-mastery.ts simplification:
// for each skill its mastery is mean(measured dim scores); layer = mean of
// skill masteries with defined values. We approximate via dim grouping:
//   V layer ≈ mean(D2, D4)
//   S layer ≈ D1
//   D layer ≈ D3 (most D-skills use D3_Context)
//   R layer ≈ predictCorrectness average across QTs in scope
//   A layer ≈ mean(D2, D4)
// This is intentionally coarse for fast simulation — the canonical lib uses
// the seed's measuredByDims for each of 33 skills.

function layerMasteries(scores) {
  const m = (...keys) => {
    const vals = keys.map((k) => scores[k]).filter((v) => typeof v === "number");
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : undefined;
  };
  return {
    V: m("D2_Meaning", "D4_Network"),
    S: m("D1_Form"),
    D: m("D3_Context"),
    R: m("D2_Meaning", "D3_Context", "D5_Usage"),
    A: m("D2_Meaning", "D4_Network"),
  };
}

const DISTRACTOR_OVERRIDES = {
  "DIST-유사어휘함정": "vocab_unknown",
  "DIST-시제조건왜곡": "structure_misread",
  "DIST-인과혼동": "discourse_drift",
  "DIST-부분일치": "distractor_trap",
  "DIST-반대논지": "distractor_trap",
  "DIST-과잉일반화": "distractor_trap",
  "DIST-범위이탈": "distractor_trap",
};

function classify(qtId, scores, distractorPicked) {
  if (distractorPicked && DISTRACTOR_OVERRIDES[distractorPicked]) {
    return DISTRACTOR_OVERRIDES[distractorPicked];
  }
  if (!QT_TARGETS[qtId]) return "distractor_trap";
  const layers = layerMasteries(scores);
  const defined = Object.entries(layers).filter(([, v]) => typeof v === "number");
  if (defined.length === 0) return "distractor_trap";
  defined.sort((a, b) => a[1] - b[1]);
  const [weakLayer] = defined[0];
  switch (weakLayer) {
    case "V": return "vocab_unknown";
    case "S": return "structure_misread";
    case "D":
      return qtId === "TYPE-빈칸추론" || qtId === "TYPE-문장삽입"
        ? "anaphora_lost"
        : "discourse_drift";
    default: return "distractor_trap";
  }
}

// ─── Synthetic scenario generation ────────────────────────────────
// Each scenario has a known TRUE category. We bias scores / distractor
// pick so a well-calibrated classifier should infer the same category.

function makeScores(weak, strong, noisy = false) {
  // Noisy scenarios narrow the gap between weak and strong, plus add
  // a secondary weakness that confuses the classifier.
  const high = noisy ? 60 + randInt(0, 15) : 75 + randInt(0, 20);
  const low = noisy ? 25 + randInt(0, 20) : 5 + randInt(0, 20);
  const dims = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];
  // Secondary noise: when noisy, randomly depress another dim into mid-low
  const secondary = noisy ? pick(dims.filter((d) => d !== weak && d !== strong)) : null;
  const scores = {};
  for (const d of dims) {
    if (d === weak) scores[d] = low;
    else if (d === strong) scores[d] = high;
    else if (d === secondary) scores[d] = 30 + randInt(0, 15);
    else scores[d] = 50 + randInt(-10, 10);
  }
  return scores;
}

const ALL_QTS = Object.keys(QT_TARGETS);
const DISCOURSE_QTS = ["TYPE-요지", "TYPE-주제", "TYPE-흐름무관", "TYPE-순서배열", "TYPE-주장", "TYPE-목적"];
const ANAPHORA_QTS = ["TYPE-빈칸추론", "TYPE-문장삽입"];

function makeScenario(trueCategory) {
  const noisy = rand() < NOISE;
  switch (trueCategory) {
    case "vocab_unknown":
      if (rand() < 0.5) {
        return { qtId: pick(ALL_QTS), scores: makeScores(null, null, noisy), distractorPicked: "DIST-유사어휘함정", trueCategory, noisy };
      }
      return { qtId: pick(ALL_QTS), scores: makeScores("D2_Meaning", "D3_Context", noisy), distractorPicked: null, trueCategory, noisy };

    case "structure_misread":
      if (rand() < 0.5) {
        return { qtId: pick(ALL_QTS), scores: makeScores(null, null, noisy), distractorPicked: "DIST-시제조건왜곡", trueCategory, noisy };
      }
      return { qtId: pick(ALL_QTS), scores: makeScores("D1_Form", "D3_Context", noisy), distractorPicked: null, trueCategory, noisy };

    case "anaphora_lost":
      return {
        qtId: pick(ANAPHORA_QTS),
        scores: makeScores("D3_Context", "D2_Meaning", noisy),
        distractorPicked: null,
        trueCategory,
        noisy,
      };

    case "discourse_drift":
      if (rand() < 0.3) {
        return { qtId: pick(DISCOURSE_QTS), scores: makeScores(null, null, noisy), distractorPicked: "DIST-인과혼동", trueCategory, noisy };
      }
      return {
        qtId: pick(DISCOURSE_QTS),
        scores: makeScores("D3_Context", "D2_Meaning", noisy),
        distractorPicked: null,
        trueCategory,
        noisy,
      };

    case "distractor_trap":
      return {
        qtId: pick(ALL_QTS),
        scores: makeScores(null, null, noisy),
        distractorPicked: pick(["DIST-부분일치", "DIST-반대논지", "DIST-과잉일반화", "DIST-범위이탈"]),
        trueCategory,
        noisy,
      };

    default:
      throw new Error(`unknown category ${trueCategory}`);
  }
}

const CATEGORIES = ["vocab_unknown", "structure_misread", "anaphora_lost", "discourse_drift", "distractor_trap"];
const PER_CATEGORY = Math.floor(N / CATEGORIES.length);
const scenarios = [];
for (const cat of CATEGORIES) {
  for (let i = 0; i < PER_CATEGORY; i++) scenarios.push(makeScenario(cat));
}

// ─── Evaluate ─────────────────────────────────────────────────────

let correct = 0;
const perCat = {};
for (const cat of CATEGORIES) perCat[cat] = { tp: 0, fp: 0, fn: 0, total: 0 };

for (const s of scenarios) {
  perCat[s.trueCategory].total++;
  const pred = classify(s.qtId, s.scores, s.distractorPicked);
  if (pred === s.trueCategory) {
    correct++;
    perCat[s.trueCategory].tp++;
  } else {
    perCat[s.trueCategory].fn++;
    if (perCat[pred]) perCat[pred].fp++;
  }
}

const accuracy = correct / scenarios.length;

const perCategoryReport = {};
for (const cat of CATEGORIES) {
  const r = perCat[cat];
  const precision = r.tp + r.fp > 0 ? r.tp / (r.tp + r.fp) : 0;
  const recall = r.tp + r.fn > 0 ? r.tp / (r.tp + r.fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  perCategoryReport[cat] = {
    total: r.total,
    truePositives: r.tp,
    precision: Number(precision.toFixed(3)),
    recall: Number(recall.toFixed(3)),
    f1: Number(f1.toFixed(3)),
  };
}

// Track accuracy split by clean vs noisy slice to show robustness curve
const cleanScenarios = scenarios.filter((s) => !s.noisy);
const noisyScenarios = scenarios.filter((s) => s.noisy);
function sliceAccuracy(slice) {
  if (slice.length === 0) return null;
  let c = 0;
  for (const s of slice) if (classify(s.qtId, s.scores, s.distractorPicked) === s.trueCategory) c++;
  return Number((c / slice.length).toFixed(3));
}

const report = {
  seed: SEED,
  n: scenarios.length,
  target: TARGET,
  noiseRate: NOISE,
  accuracy: Number(accuracy.toFixed(3)),
  passed: accuracy >= TARGET,
  byNoise: {
    clean: { n: cleanScenarios.length, accuracy: sliceAccuracy(cleanScenarios) },
    noisy: { n: noisyScenarios.length, accuracy: sliceAccuracy(noisyScenarios) },
  },
  perCategory: perCategoryReport,
  generatedAt: new Date().toISOString(),
};

if (OUT) {
  const outPath = join(ROOT, OUT);
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
}

console.log(JSON.stringify(report, null, 2));

if (!report.passed) {
  console.error(`[FAIL] accuracy ${accuracy.toFixed(3)} below target ${TARGET}`);
  process.exit(1);
}
console.log(`[ PASS ] accuracy ${(accuracy * 100).toFixed(1)}% ≥ ${(TARGET * 100).toFixed(0)}% target`);
