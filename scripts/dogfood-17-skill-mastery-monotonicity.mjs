#!/usr/bin/env node
/**
 * dogfood-17 — SkillMasteryRadar / lib/skill-mastery monotonicity check.
 *
 * Validates that the skill-ontology seed maps the 5 OELP dimensions to the
 * P→V→S→D→R→A layers in a way that makes sense: deliberately weakening a
 * single dimension should drop the associated layer mastery more than any
 * unassociated layer.
 *
 * Why this matters
 *   The skill-mastery derivation is a deterministic function of dim scores,
 *   so there's no statistical "convergence" to check — but the mapping seed
 *   could still be miscoded (e.g. D-layer skills accidentally listing
 *   D1_Form instead of D3_Context). This script catches that class of bug.
 *
 * Method
 *   For each of the 5 dims, run a scenario:
 *     1. baseline = all dims at 70
 *     2. perturbed = same but the target dim dropped to 20
 *     3. compute layer masteries for both
 *     4. delta = baseline.mastery - perturbed.mastery for each layer
 *     5. assert: there exists at least one "primary" layer whose delta
 *        is >= median delta + MARGIN
 *
 * MARGIN of 5 points = the perturbation should clearly stand out from
 * baseline noise.
 *
 * Run: node scripts/dogfood-17-skill-mastery-monotonicity.mjs
 *
 * Exit codes:
 *   0 — all 5 dim perturbations isolate a primary layer
 *   1 — regression in skill-mastery seed mapping
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const seed = JSON.parse(readFileSync(join(ROOT, "lib/skill-ontology-seed.json"), "utf-8"));
const weights = JSON.parse(readFileSync(join(ROOT, "lib/ontology-weights.json"), "utf-8")).weights;

function predictCorrectness(scores, qtId) {
  const w = weights[qtId];
  if (!w) return 0;
  let sum = 0;
  for (const dim of Object.keys(w)) {
    const s = scores[dim] ?? 0;
    sum += w[dim] * (s / 100);
  }
  return sum;
}

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function computeSkillMastery(scores, node) {
  const contributions = [];
  for (const dim of node.measuredByDims ?? []) {
    const v = scores[dim];
    if (typeof v === "number") contributions.push(v);
  }
  if (contributions.length === 0) {
    for (const qtId of node.measuredByQts ?? []) {
      if (!weights[qtId]) continue;
      const hasAnyDimScore = Object.keys(weights[qtId]).some((d) => typeof scores[d] === "number");
      if (!hasAnyDimScore) continue;
      contributions.push(predictCorrectness(scores, qtId) * 100);
    }
  }
  return contributions.length > 0 ? mean(contributions) : null;
}

function computeLayerMasteries(scores) {
  const out = {};
  for (const layer of ["V", "S", "D", "R", "A"]) {
    const inLayer = seed.nodes.filter((n) => n.mvpActive && n.layer === layer);
    const m = inLayer
      .map((n) => computeSkillMastery(scores, n))
      .filter((v) => typeof v === "number");
    out[layer] = m.length > 0 ? mean(m) : null;
  }
  return out;
}

const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];
const BASELINE = Object.fromEntries(DIMS.map((d) => [d, 70]));
const MARGIN = 5;

const scenarios = [];

for (const targetDim of DIMS) {
  const perturbed = { ...BASELINE, [targetDim]: 20 };
  const before = computeLayerMasteries(BASELINE);
  const after = computeLayerMasteries(perturbed);
  const deltas = {};
  for (const layer of ["V", "S", "D", "R", "A"]) {
    deltas[layer] =
      before[layer] === null || after[layer] === null
        ? null
        : Number((before[layer] - after[layer]).toFixed(2));
  }
  const definedDeltas = Object.values(deltas).filter((v) => v !== null);
  const sorted = [...definedDeltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const primaryLayers = Object.entries(deltas)
    .filter(([, d]) => d !== null && d >= median + MARGIN)
    .map(([layer]) => layer);

  scenarios.push({
    targetDim,
    baseline: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v === null ? null : Number(v.toFixed(2))])),
    perturbed: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, v === null ? null : Number(v.toFixed(2))])),
    deltas,
    medianDelta: Number(median.toFixed(2)),
    primaryLayers,
    pass: primaryLayers.length > 0,
  });
}

const report = {
  margin: MARGIN,
  scenarios,
  passed: scenarios.every((s) => s.pass),
  summary: {
    total: scenarios.length,
    passing: scenarios.filter((s) => s.pass).length,
  },
};

console.log(JSON.stringify(report, null, 2));

if (!report.passed) {
  const failed = scenarios.filter((s) => !s.pass).map((s) => s.targetDim);
  console.error(`[FAIL] no primary layer isolated for: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(`[ PASS ] ${report.summary.passing}/${report.summary.total} dim perturbations isolate a primary layer (margin >= ${MARGIN})`);
