#!/usr/bin/env node
/**
 * vocab-cat-test integration verification (companion to vocab-cat-test-integration-runbook.md).
 *
 * Runs the actual multi-step adaptive CAT flow against a locally running
 * vocab-cat-test backend (smilepat/vocab-cat-test, FastAPI on :8000):
 *   1. POST /api/v1/test/start  → session_id + first item
 *   2. Loop: POST /api/v1/test/{sid}/respond {item_id, is_correct}
 *            until progress.is_complete (typically 15-40 items)
 *   3. GET  /api/v1/test/{sid}/results → final theta + 5D dimension scores
 *   4. Map to OELP DiagnosticInput contract (T1.3 schema)
 *   5. Validate
 *
 * Why this matters: it proves the integration handshake works end-to-end
 * with the same schema OELP /diagnose paste-import uses, without needing
 * any frontend changes.
 *
 * Exit codes:
 *   0  All checks pass — integration verified, DiagnosticInput emitted to stdout.
 *   1  Schema/contract violation.
 *   2  Network or HTTP error (backend not running, etc).
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BASE_URL = process.env.VOCAB_CAT_TEST_URL ?? "http://localhost:8000";
const RESPONSE_STRATEGY = process.env.RESPONSE_STRATEGY ?? "alternating"; // alternating | always-correct
const MAX_ITEMS = parseInt(process.env.MAX_ITEMS ?? "40", 10);

function log(level, msg) {
  const prefix = level === "ok" ? "[OK]" : level === "fail" ? "[FAIL]" : "[INFO]";
  const out = level === "fail" ? console.error : console.log;
  out(`${prefix} ${msg}`);
}

async function http(path, init) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Step 1: Health ─────────────────────────────────────────────────

let healthBody;
try {
  healthBody = await http("/health");
} catch (err) {
  log("fail", `health check: ${err.message}`);
  log("info", "Cannot reach backend. Is uvicorn running on port 8000?");
  log("info", "  cd vocab-cat-test && ./.venv/Scripts/uvicorn.exe irt_cat_engine.api.main:app --port 8000");
  process.exit(2);
}

if (healthBody.status !== "healthy") {
  log("fail", `unexpected /health: ${JSON.stringify(healthBody)}`);
  process.exit(1);
}
log("ok", `health — vocab_count=${healthBody.vocab_count} version=${healthBody.version}`);

// ─── Step 2: Start session ──────────────────────────────────────────

const start = await http("/api/v1/test/start", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    nickname: "oelp-verify",
    grade: "고2",
    self_assess: "intermediate",
    exam_experience: "수능",
    question_type: 0,
  }),
});

const sessionId = start.session_id;
log("ok", `session started — id=${sessionId.slice(0, 8)}… initial θ=${start.initial_theta}`);

// ─── Step 3: Adaptive loop ──────────────────────────────────────────

let progress = start.progress;
let currentItem = start.first_item;
let itemCount = 0;

while (!progress.is_complete && itemCount < MAX_ITEMS && currentItem) {
  itemCount++;
  let isCorrect;
  if (RESPONSE_STRATEGY === "always-correct") {
    isCorrect = true;
  } else {
    // alternating with bias toward correct (mimics moderate learner)
    isCorrect = itemCount % 3 !== 0;
  }
  const result = await http(`/api/v1/test/${sessionId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_id: currentItem.item_id,
      is_correct: isCorrect,
      response_time_ms: 5000,
    }),
  });
  progress = result.progress;
  currentItem = result.next_item;
}

log("ok", `adaptive CAT — ${itemCount} items, accuracy=${(progress.accuracy * 100).toFixed(0)}% θ=${progress.current_theta?.toFixed(2)} SE=${progress.current_se?.toFixed(2)}`);

// ─── Step 4: Final results ──────────────────────────────────────────

const results = await http(`/api/v1/test/${sessionId}/results`);

log("ok", `results — θ=${results.theta.toFixed(2)} CEFR=${results.cefr_level} reason=${results.termination_reason}`);

// ─── Step 5: Map to OELP DiagnosticInput contract ───────────────────

function mapCefr(c) {
  const valid = ["A1", "A2", "B1", "B2", "C1", "C2"];
  return valid.includes(c) ? c : "B1";
}

function mapLevel(curriculumLevel) {
  // vocab-cat-test "curriculum_level" → OELP level 1-6
  const map = { "초3-4": 1, "초5-6": 2, "중1": 3, "중2": 3, "중3": 3, "고1": 4, "고2": 4, "고3": 5, "대학": 6, "성인": 6 };
  return map[curriculumLevel] ?? 4;
}

// vocab-cat-test uses semantic/contextual/form/relational/pragmatic.
// OELP uses D1_Form/D2_Meaning/D3_Context/D4_Network/D5_Usage.
// Map per dimension-mapping.md §1.4 / vocab-learn-pat convention.
const DIM_MAP = {
  semantic: "D2_Meaning",
  contextual: "D3_Context",
  form: "D1_Form",
  relational: "D4_Network",
  pragmatic: "D5_Usage",
};

const dimensionScores = {};
for (const d of results.dimension_scores ?? []) {
  const mapped = DIM_MAP[d.dimension];
  if (mapped && d.score !== null && d.score !== undefined) {
    dimensionScores[mapped] = d.score;
  }
}

// vocab-cat-test may emit fewer than 5 dimensions (if some had 0 items).
// Fill missing with median to avoid schema rejection.
const required = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];
const present = required.filter((d) => d in dimensionScores);
if (present.length === 0) {
  log("fail", "no dimension scores returned — vocab-cat-test config issue");
  process.exit(1);
}
const median = (() => {
  const vals = [...Object.values(dimensionScores)].sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
})();
for (const d of required) {
  if (!(d in dimensionScores)) dimensionScores[d] = median;
}

const sortedDims = required.slice().sort((a, b) => dimensionScores[a] - dimensionScores[b]);
const weakDim = sortedDims.slice(0, 2);
const strongDim = sortedDims.slice(-2);

const diagnostic = {
  studentName: "vocab-cat-test verify",
  theta: Math.max(-4, Math.min(4, results.theta)),
  level: mapLevel(results.curriculum_level),
  cefr: mapCefr(results.cefr_level),
  dimensionScores,
  weakDim,
  strongDim,
  timestamp: new Date().toISOString(),
  source: "vocab-cat-test",
};

// ─── Step 6: Schema validation ──────────────────────────────────────

const schemaPath = join(ROOT, "schemas", "diagnostic-input.schema.json");
if (!existsSync(schemaPath)) {
  log("fail", `schema file missing: ${schemaPath}`);
  process.exit(1);
}
const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

if (!validate(diagnostic)) {
  log("fail", "T1.3 DiagnosticInput schema violation:");
  for (const e of validate.errors ?? []) {
    console.error(`  - ${e.instancePath || "(root)"} ${e.message}`);
  }
  console.error("Emitted diagnostic:");
  console.error(JSON.stringify(diagnostic, null, 2));
  process.exit(1);
}

log("ok", "T1.3 DiagnosticInput schema validation passed");
log("ok", `5D scores: ${required.map((d) => `${d.replace("_", " ")}=${dimensionScores[d]}`).join(", ")}`);

console.log("\n✓ vocab-cat-test integration verified end-to-end");
console.log("\nEmitted DiagnosticInput (paste into /diagnose to test):");
console.log(JSON.stringify(diagnostic, null, 2));
