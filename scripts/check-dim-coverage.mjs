#!/usr/bin/env node
/**
 * check-dim-coverage — keyVariable 매핑 coverage 자동 점검.
 *
 * v10 sprint에서 발견: 21 keyVariables 모두 D2-D5만 매핑, D1_Form 매핑이
 * 0개. 이로 인해 C4.1 derived weight가 항상 0이 되어 가중치 boost가
 * "선언만 있고 근거 없음"으로 catch됨.
 *
 * 이 script는 같은 hidden defect (어떤 dim이 keyVariables에 0개 매핑됨)
 * 을 자동 검출. 새 keyVariable 추가 또는 dim 추가 시 즉시 catch.
 *
 * Exit codes:
 *   0 — 모든 dim이 ≥ 1 keyVariable에 매핑됨
 *   1 — 1개 이상 dim 매핑 0개 (warning, 실 비차단)
 *   2 — 일부 QT의 declared weight가 derived 0인 dim에 ≥ 0.15 (모순)
 *
 * Run:
 *   node scripts/check-dim-coverage.mjs               # 기본 (요약 출력)
 *   node scripts/check-dim-coverage.mjs --verbose     # dim별 keyVariable 목록
 *   node scripts/check-dim-coverage.mjs --strict      # 모순 발견 시 exit 2
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (a.startsWith("--")) out[a.slice(2)] = true;
  }
  return out;
}

const verbose = args.verbose;
const strict = args.strict;

// ─── Load kv-dim mapping from TS source ───────────────────────────────

const kvMappingSrc = readFileSync(join(ROOT, "lib", "kv-dim-mapping.ts"), "utf-8");

// Parse the KV_DIM_MAPPING export. Simple regex — fragile, but matches the
// known stable structure. Updates if lib/kv-dim-mapping.ts shape changes.
const mapping = {};
const mappingRe = /^\s+(\w+):\s*\[([^\]]+)\],?\s*$/gm;
let m;
while ((m = mappingRe.exec(kvMappingSrc)) !== null) {
  const key = m[1];
  const dims = m[2].split(",").map((s) => s.trim().replace(/['"]/g, ""));
  if (dims.every((d) => /^D\d_/.test(d))) {
    mapping[key] = dims;
  }
}

const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

// ─── Count keyVariables per dim ───────────────────────────────────────

const dimCoverage = Object.fromEntries(DIMS.map((d) => [d, []]));
for (const [kv, dims] of Object.entries(mapping)) {
  for (const d of dims) {
    if (DIMS.includes(d)) dimCoverage[d].push(kv);
  }
}

// ─── Load ontology-weights.json ───────────────────────────────────────

const weights = JSON.parse(readFileSync(join(ROOT, "lib", "ontology-weights.json"), "utf-8"));

// ─── Detect contradictions: declared ≥ 0.15 in dim with 0 keyVariables ──

const contradictions = [];
for (const [qtId, qtWeights] of Object.entries(weights.weights)) {
  for (const dim of DIMS) {
    const declared = qtWeights[dim] ?? 0;
    const kvCount = dimCoverage[dim].length;
    if (kvCount === 0 && declared >= 0.15) {
      contradictions.push({
        qtId,
        dim,
        declared,
        reason: `dim has 0 keyVariables — declared ${(declared * 100).toFixed(0)}% has no domain evidence`,
      });
    }
  }
}

// ─── Output ────────────────────────────────────────────────────────────

const totalKv = Object.keys(mapping).length;
const dimSummary = DIMS.map((d) => ({
  dim: d,
  kvCount: dimCoverage[d].length,
  status: dimCoverage[d].length === 0 ? "MISSING" : dimCoverage[d].length < 2 ? "WEAK" : "OK",
}));
const missingDims = dimSummary.filter((s) => s.status === "MISSING");
const weakDims = dimSummary.filter((s) => s.status === "WEAK");

// ─── Skill coverage (p2a-ontology PR-2, informational) ────────────────

let skillCoverage = null;
try {
  const seed = JSON.parse(
    readFileSync(join(ROOT, "lib", "skill-ontology-seed.json"), "utf-8")
  );
  const mapped = new Set();
  for (const n of seed.nodes) for (const kv of n.measuredByKeyVars) mapped.add(kv);
  const orphanKeyVars = Object.keys(mapping).filter((kv) => !mapped.has(kv));
  skillCoverage = {
    seedVersion: seed.version,
    keyVarsMapped: mapped.size,
    keyVarsTotal: Object.keys(mapping).length,
    orphanKeyVars,
  };
} catch {
  // seed not yet present — skip silently (pre-PR-1 environments)
}

const report = {
  totalKeyVariables: totalKv,
  dimSummary,
  missingDims: missingDims.map((s) => s.dim),
  weakDims: weakDims.map((s) => s.dim),
  contradictions,
  ...(skillCoverage ? { skillCoverage } : {}),
};

if (verbose) {
  report.dimDetail = Object.fromEntries(
    DIMS.map((d) => [d, dimCoverage[d]])
  );
}

console.log(JSON.stringify(report, null, 2));

// ─── Exit code ─────────────────────────────────────────────────────────

if (strict && contradictions.length > 0) {
  process.exit(2);
}
if (missingDims.length > 0) {
  process.exit(1);
}
process.exit(0);
