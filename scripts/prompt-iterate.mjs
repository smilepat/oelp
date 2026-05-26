#!/usr/bin/env node
/**
 * prompt-iterate.mjs — operator-triggered prompt evolution helper.
 *
 * PR-8 of p2a-ontology. Reads a generator output bundle (JSON of
 * ContentGeneratorResult[]) from --input, runs analyseBatch +
 * proposePromptAdjustments equivalents, and prints proposed prompt
 * diffs as JSON. NEVER auto-applies — operator decides.
 *
 * Usage:
 *   node scripts/prompt-iterate.mjs --input batch.json
 *   node scripts/prompt-iterate.mjs --input batch.json --pretty
 *
 * Exit codes:
 *   0 — input parsed (with or without diffs)
 *   1 — input invalid / unparseable
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const next = args[i + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}

const inputPath = flag("input");
const pretty = flag("pretty");

if (!inputPath || typeof inputPath !== "string") {
  console.error("usage: prompt-iterate --input <batch.json> [--pretty]");
  process.exit(1);
}

let batch;
try {
  batch = JSON.parse(readFileSync(inputPath, "utf-8"));
} catch (err) {
  console.error(`[FAIL] cannot read/parse ${inputPath}: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(batch)) {
  console.error("[FAIL] input must be an array of ContentGeneratorResult");
  process.exit(1);
}

const FAILURE_RATE_TRIGGER = 0.15;
const MIN_ISSUES_FOR_DIFF = 3;

const CODE_TO_DIFF = {
  "missing-translation": { segment: "constraints", instruction: "Always include a non-empty translation field — reject if blank.", priority: 90 },
  "duplicate-word": { segment: "constraints", instruction: "Each card must have a unique surface form within the batch.", priority: 80 },
  "invalid-difficulty": { segment: "output_schema", instruction: "difficulty must be an integer in [1, 5]; emit explicit example range.", priority: 70 },
  "wrong-dimension": { segment: "few_shot_examples", instruction: "Add 2 few-shot examples per target dimension and label each example's dimension explicitly.", priority: 85 },
  "off-topic": { segment: "system", instruction: "Restate the QT scope at the top of the system prompt; forbid out-of-scope tokens.", priority: 95 },
};

const GENERIC_DIFF = {
  segment: "post_validate",
  instruction: "Run validator before emitting any card; on failure, regenerate up to 3x before yielding partial.",
  priority: 40,
};

const cardsTotal = batch.reduce((s, r) => s + (r.cards?.length ?? 0), 0);
const cardsWithError = new Set();
const countsByCode = {};
for (const r of batch) {
  for (const iss of r.issues ?? []) {
    const b = countsByCode[iss.code] ?? { error: 0, warning: 0 };
    if (iss.severity === "error") {
      b.error += 1;
      cardsWithError.add(iss.cardIndex);
    } else if (iss.severity === "warning") b.warning += 1;
    countsByCode[iss.code] = b;
  }
}
const topIssueCodes = Object.entries(countsByCode)
  .sort((a, b) => b[1].error - a[1].error)
  .map(([code]) => code);
const failureRate = cardsTotal > 0 ? cardsWithError.size / cardsTotal : 0;

const diffs = [];
if (failureRate >= FAILURE_RATE_TRIGGER && topIssueCodes.length > 0) {
  for (const code of topIssueCodes) {
    if ((countsByCode[code].error ?? 0) < MIN_ISSUES_FOR_DIFF) continue;
    const t = CODE_TO_DIFF[code];
    if (t) diffs.push({ ...t, motivatingIssues: [code] });
  }
  diffs.push({ ...GENERIC_DIFF, motivatingIssues: topIssueCodes.slice(0, 3) });
  diffs.sort((a, b) => b.priority - a.priority);
}

const report = {
  totalCards: cardsTotal,
  failedCards: cardsWithError.size,
  failureRate,
  topIssueCodes,
  proposedDiffs: diffs,
};

console.log(JSON.stringify(report, null, pretty ? 2 : 0));
