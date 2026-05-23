#!/usr/bin/env node
/**
 * Stage C activation simulation — what happens when 1 external learner appears.
 *
 * Mixes:
 *   - 본인 dogfooding-3 simulator base (preset-based, 1600 responses)
 *   - 1 hypothetical external learner with realistic profile drawn from
 *     a Beta-binomial mixture (different from any preset)
 *
 * Goal: forecast whether 1 external learner is enough to shift calibration
 * meaningfully + whether the 4-layer safety net still behaves correctly.
 *
 * Run: node scripts/dogfood-stage-c-sim.mjs [--learner-n 30] [--seed 7]
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
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

const learnerSessions = args["learner-sessions"] ? parseInt(args["learner-sessions"], 10) : 8;
const cardsPerSession = 10;
const seed = args.seed ? parseInt(args.seed, 10) : 7;

let rngState = seed >>> 0;
function rng() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ─── 외부 학습자 1명: "재수생, B1, 부분 약점 D2+D4" ────────────────────
// (페르소나 P0의 변종 — 4 presets 어떤 것과도 다른 profile)

const EXTERNAL_LEARNER = {
  id: "ext-001",
  baseDims: {
    D1_Form: 70,
    D2_Meaning: 38,   // 약점
    D3_Context: 55,
    D4_Network: 42,   // 약점
    D5_Usage: 60,
  },
};

// ─── 가중치 ─────────────────────────────────────────────────────────

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

function pickTargetQT(dims) {
  let minP = 2;
  let weakest = null;
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

function sampleCorrectness(dims, qtId) {
  const w = WEIGHTS[qtId];
  let p = 0;
  for (const d of Object.keys(w)) p += w[d] * (dims[d] / 100);
  // External learner adds slightly larger noise (real human variance)
  const bias = (rng() - 0.5) * 0.15;
  return rng() < Math.max(0, Math.min(1, p + bias));
}

// ─── 외부 학습자 응답 생성 ────────────────────────────────────────────

const newResponses = [];
for (let s = 0; s < learnerSessions; s++) {
  // 각 세션마다 ±5 dim noise (mood/fatigue effect)
  const dims = {};
  for (const d of Object.keys(EXTERNAL_LEARNER.baseDims)) {
    dims[d] = Math.max(0, Math.min(100, Math.round(EXTERNAL_LEARNER.baseDims[d] + (rng() - 0.5) * 10)));
  }
  const target = pickTargetQT(dims);
  for (let c = 0; c < cardsPerSession; c++) {
    newResponses.push({
      qtId: target,
      dimensionScores: dims,
      isCorrect: sampleCorrectness(dims, target),
    });
  }
}

// ─── 기존 dogfood-3 데이터 로드 + merge ────────────────────────────────

const baseFile = join(ROOT, "data", "dogfood-3-presets-1600.json");
if (!existsSync(baseFile)) {
  console.error(`Base file missing: ${baseFile}. Run scripts/dogfood-3-presets.mjs first.`);
  process.exit(1);
}
const base = JSON.parse(readFileSync(baseFile, "utf-8"));
const combined = [...base, ...newResponses];

if (!existsSync(join(ROOT, "data"))) mkdirSync(join(ROOT, "data"));
const outFile = join(ROOT, "data", `dogfood-stage-c-${combined.length}.json`);
writeFileSync(outFile, JSON.stringify(combined, null, 2));

// ─── Summary ───────────────────────────────────────────────────────────

const uniqueDims = new Set(combined.map((r) => JSON.stringify(r.dimensionScores)));
const externalQt = {};
for (const r of newResponses) {
  externalQt[r.qtId] = (externalQt[r.qtId] || 0) + 1;
}
const externalAcc = newResponses.filter((r) => r.isCorrect).length / newResponses.length;

console.log(
  JSON.stringify(
    {
      externalLearnerId: EXTERNAL_LEARNER.id,
      externalLearnerProfile: EXTERNAL_LEARNER.baseDims,
      externalSessions: learnerSessions,
      externalResponses: newResponses.length,
      externalAccuracy: externalAcc.toFixed(3),
      externalQtDistribution: externalQt,
      baseResponses: base.length,
      combinedTotal: combined.length,
      uniqueDimensionScores: uniqueDims.size,
      seed,
      outputPath: outFile.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
    },
    null,
    2
  )
);
