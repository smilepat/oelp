#!/usr/bin/env node
/**
 * dogfood-7 — multi-learner cohort simulation.
 *
 * Extends dogfood-stage-c-sim (1 external learner) to N learners with
 * diverse profiles. Forecasts what data shape the calibration pipeline
 * will see at each cohort size milestone (N=1, 5, 10, 30, 50).
 *
 * Output for each cohort size:
 *   - Total responses (cohortN × learnerSessions × cardsPerSession)
 *   - Unique dimensionScores tuples (diversity check — rank-1 X avoidance)
 *   - QT coverage (how many of 10 QTs got hit cohort-wide)
 *   - Per-QT response count distribution
 *   - Synthetic ridge-input fingerprint (min/max accuracy per QT)
 *
 * NOT a calibration runner — for that use scripts/calibrate.mjs.
 * This is a forecasting tool to set realistic expectations for Stage C entry.
 *
 * Run: node scripts/dogfood-7-cohort.mjs [--seed 11] [--sessions-per 8]
 *
 * Cross-link: docs/03-analysis/dogfooding-stage-c-forecast.md (myprojects).
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

const seed = args.seed ? parseInt(args.seed, 10) : 11;
const sessionsPerLearner = args["sessions-per"] ? parseInt(args["sessions-per"], 10) : 8;
const cardsPerSession = 10;
const COHORT_SIZES = [1, 5, 10, 30, 50];

let rngState = seed >>> 0;
function rng() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

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
const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

/**
 * Generate a learner profile — 5D base scores drawn from a mixture of:
 *   - Weak-D2 (어휘 의미 약점, 흔한 EFL 패턴): ~30% of learners
 *   - Weak-D3 (맥락 약점, 빈칸/순서 약함): ~30%
 *   - Weak-D4 (네트워크 약점, 어휘 isolated): ~20%
 *   - Balanced (모든 차원 균일): ~10%
 *   - Strong (전반적 고득점, 우수 학습자): ~10%
 */
function generateLearnerProfile(learnerIdx) {
  const r = rng();
  let archetype;
  if (r < 0.3) archetype = "weak-D2";
  else if (r < 0.6) archetype = "weak-D3";
  else if (r < 0.8) archetype = "weak-D4";
  else if (r < 0.9) archetype = "balanced";
  else archetype = "strong";

  const base = { D1_Form: 60, D2_Meaning: 60, D3_Context: 60, D4_Network: 60, D5_Usage: 60 };
  switch (archetype) {
    case "weak-D2":
      base.D2_Meaning = 30 + Math.floor(rng() * 15); // 30-45
      base.D3_Context = 55 + Math.floor(rng() * 15);
      break;
    case "weak-D3":
      base.D3_Context = 30 + Math.floor(rng() * 15);
      base.D5_Usage = 55 + Math.floor(rng() * 15);
      break;
    case "weak-D4":
      base.D4_Network = 30 + Math.floor(rng() * 15);
      base.D1_Form = 55 + Math.floor(rng() * 15);
      break;
    case "balanced":
      // ±10 jitter all dims
      for (const d of DIMS) base[d] = 55 + Math.floor(rng() * 20);
      break;
    case "strong":
      for (const d of DIMS) base[d] = 75 + Math.floor(rng() * 20);
      break;
  }
  return {
    id: `ext-${String(learnerIdx).padStart(3, "0")}`,
    archetype,
    baseDims: base,
  };
}

function pickTargetQT(dims) {
  let minP = 2;
  let weakest = null;
  for (const qtId of QT_IDS) {
    const w = WEIGHTS[qtId];
    let p = 0;
    for (const d of DIMS) p += w[d] * (dims[d] / 100);
    if (p < minP) {
      minP = p;
      weakest = qtId;
    }
  }
  return weakest;
}

function sampleCorrectness(dims, qtId) {
  const w = WEIGHTS[qtId];
  let p = 0;
  for (const d of DIMS) p += w[d] * (dims[d] / 100);
  const noise = (rng() - 0.5) * 0.15;
  return rng() < Math.max(0, Math.min(1, p + noise));
}

function generateLearnerResponses(profile) {
  const responses = [];
  for (let s = 0; s < sessionsPerLearner; s++) {
    // Per-session ±10 dim jitter (mood/fatigue)
    const dims = {};
    for (const d of DIMS) {
      dims[d] = Math.max(0, Math.min(100, Math.round(profile.baseDims[d] + (rng() - 0.5) * 10)));
    }
    const target = pickTargetQT(dims);
    for (let c = 0; c < cardsPerSession; c++) {
      responses.push({
        learnerId: profile.id,
        qtId: target,
        dimensionScores: dims,
        isCorrect: sampleCorrectness(dims, target),
      });
    }
  }
  return responses;
}

// ─── Build full cohort (max size), then summarize each milestone ──────

const maxCohort = COHORT_SIZES[COHORT_SIZES.length - 1];
const allLearners = [];
const allResponses = [];
for (let i = 0; i < maxCohort; i++) {
  const profile = generateLearnerProfile(i);
  allLearners.push(profile);
  allResponses.push(...generateLearnerResponses(profile));
}

const archetypeCount = allLearners.reduce((acc, l) => {
  acc[l.archetype] = (acc[l.archetype] ?? 0) + 1;
  return acc;
}, {});

function summarize(responses, learners) {
  const uniqueDims = new Set(responses.map((r) => JSON.stringify(r.dimensionScores)));
  const qtCount = {};
  const qtAccuracy = {};
  for (const qt of QT_IDS) {
    qtCount[qt] = 0;
    qtAccuracy[qt] = { correct: 0, total: 0 };
  }
  for (const r of responses) {
    qtCount[r.qtId] += 1;
    qtAccuracy[r.qtId].total += 1;
    if (r.isCorrect) qtAccuracy[r.qtId].correct += 1;
  }
  const qtHit = Object.values(qtCount).filter((n) => n > 0).length;
  // Synthetic ridge-input fingerprint: per-QT accuracy spread
  const accuracySpread = {};
  for (const qt of QT_IDS) {
    if (qtAccuracy[qt].total === 0) {
      accuracySpread[qt] = null;
      continue;
    }
    accuracySpread[qt] = +(qtAccuracy[qt].correct / qtAccuracy[qt].total).toFixed(3);
  }
  // Learner diversity: archetype balance
  const archetypeDist = learners.reduce((acc, l) => {
    acc[l.archetype] = (acc[l.archetype] ?? 0) + 1;
    return acc;
  }, {});
  return {
    learners: learners.length,
    totalResponses: responses.length,
    uniqueDimensionTuples: uniqueDims.size,
    qtCoverage: `${qtHit}/${QT_IDS.length}`,
    qtResponseDistribution: qtCount,
    qtAccuracySpread: accuracySpread,
    learnerArchetypes: archetypeDist,
  };
}

const cohortReports = {};
for (const n of COHORT_SIZES) {
  const learnerSubset = allLearners.slice(0, n);
  const learnerIdSet = new Set(learnerSubset.map((l) => l.id));
  const responseSubset = allResponses.filter((r) => learnerIdSet.has(r.learnerId));
  cohortReports[`n_${n}`] = summarize(responseSubset, learnerSubset);
}

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const outPath = join(ROOT, "out", `dogfood-7-cohort-${seed}.json`);
writeFileSync(
  outPath,
  JSON.stringify(
    {
      seed,
      sessionsPerLearner,
      cardsPerSession,
      cohortSizes: COHORT_SIZES,
      overallArchetypeDistribution: archetypeCount,
      cohortReports,
      // Forecast hints
      stageCEntryGuidance: {
        n_1: "C4.1 gate cannot meaningfully evaluate; single learner = rank-1.",
        n_5: "Bare minimum for unique dim diversity; calibration likely rejects.",
        n_10: "Minimum viable for calibration attempt; expect tau borderline 0.3-0.5.",
        n_30: "Recommended for first stable calibration cycle.",
        n_50: "Robust enough for weight update with confidence.",
      },
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      seed,
      maxCohort,
      overallArchetypeDistribution: archetypeCount,
      summary: Object.fromEntries(
        Object.entries(cohortReports).map(([k, v]) => [
          k,
          {
            learners: v.learners,
            responses: v.totalResponses,
            uniqueDims: v.uniqueDimensionTuples,
            qtCoverage: v.qtCoverage,
          },
        ])
      ),
      outputPath: outPath.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
    },
    null,
    2
  )
);
