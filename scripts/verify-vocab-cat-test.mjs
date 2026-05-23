#!/usr/bin/env node
/**
 * vocab-cat-test integration verification (companion to vocab-cat-test-integration-runbook.md).
 *
 * Run after `docker compose up -d vocab-cat-test` to verify the FastAPI
 * backend responds correctly and that DiagnosticInput contract (T1.3 schema)
 * holds end-to-end.
 *
 * Exit codes:
 *   0  All checks pass — integration verified.
 *   1  Any check fails.
 *   2  Network error (Docker not running, port conflict, etc).
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BASE_URL = process.env.VOCAB_CAT_TEST_URL ?? "http://localhost:8000";
const STABILITY_RUNS = parseInt(process.env.STABILITY_RUNS ?? "0", 10); // 0 = skip

function log(level, msg) {
  const prefix = level === "ok" ? "[OK]" : level === "fail" ? "[FAIL]" : "[INFO]";
  const out = level === "fail" ? console.error : console.log;
  out(`${prefix} ${msg}`);
}

async function check(label, fn) {
  try {
    const result = await fn();
    log("ok", `${label}${result ? " — " + result : ""}`);
    return { ok: true, value: result };
  } catch (err) {
    log("fail", `${label}: ${err.message}`);
    return { ok: false, error: err };
  }
}

// ─── Checks ─────────────────────────────────────────────────────────

async function fetchJson(path, init) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function healthCheck() {
  const r = await fetchJson("/health");
  if (r.status !== "ok" && !r.healthy && !r.alive) {
    throw new Error(`unexpected /health body: ${JSON.stringify(r)}`);
  }
  return "200";
}

async function diagnoseCheck() {
  const body = await fetchJson("/api/diagnose", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentName: "verify-script" }),
  });
  if (!body || typeof body !== "object") throw new Error("non-object response");
  return body;
}

function schemaCheck(diagnostic) {
  const schemaPath = join(ROOT, "schemas", "diagnostic-input.schema.json");
  if (!existsSync(schemaPath)) throw new Error("schema file missing");
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(diagnostic)) {
    const errs = (validate.errors ?? [])
      .map((e) => `${e.instancePath || "(root)"} ${e.message}`)
      .join("; ");
    throw new Error(`schema violation: ${errs}`);
  }
  return "passed schemas/diagnostic-input.schema.json";
}

function fiveDCheck(diagnostic) {
  const dims = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];
  const missing = dims.filter((d) => !(d in (diagnostic.dimensionScores ?? {})));
  if (missing.length > 0) throw new Error(`missing dimensions: ${missing.join(", ")}`);
  return `${dims.length}/${dims.length} present`;
}

async function stabilityCheck(n) {
  const thetas = [];
  for (let i = 0; i < n; i++) {
    const d = await fetchJson("/api/diagnose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentName: `stability-${i}` }),
    });
    thetas.push(d.theta);
  }
  const sorted = [...thetas].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const min = sorted[0];
  const variance = p90 - min;
  if (variance > 0.3) {
    throw new Error(`C1.2 stability fail — theta P90-min = ${variance.toFixed(3)} > 0.3`);
  }
  return `theta variance ${variance.toFixed(3)} ≤ 0.3 (n=${n})`;
}

// ─── Main ───────────────────────────────────────────────────────────

console.log(`Target: ${BASE_URL}\n`);

const failures = [];

const health = await check("health check", healthCheck);
if (!health.ok) {
  log("info", "Cannot reach backend. Is Docker running?");
  log("info", "Run: docker compose ps  (should show vocab-cat-test running)");
  process.exit(2);
}

const diag = await check("/api/diagnose endpoint", async () => {
  const d = await diagnoseCheck();
  return `studentName="${d.studentName}", theta=${d.theta?.toFixed(2)}`;
});
if (!diag.ok) failures.push("diagnose");

let diagnostic;
if (diag.ok) {
  // re-fetch full body for downstream checks
  diagnostic = await diagnoseCheck();
  const schema = await check("DiagnosticInput schema (T1.3)", () => schemaCheck(diagnostic));
  if (!schema.ok) failures.push("schema");

  const fiveD = await check("5D fields", () => fiveDCheck(diagnostic));
  if (!fiveD.ok) failures.push("5D");
}

if (STABILITY_RUNS > 0) {
  const stab = await check(`C1.2 stability (n=${STABILITY_RUNS})`, () =>
    stabilityCheck(STABILITY_RUNS)
  );
  if (!stab.ok) failures.push("stability");
} else {
  log(
    "info",
    `C1.2 stability skipped — re-run with STABILITY_RUNS=5 (or higher) to measure`
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log("\n✓ vocab-cat-test integration verified — C1.2 ready for measurement");
