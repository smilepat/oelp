#!/usr/bin/env node
/**
 * Weekly calibration job (P-1 W6 entry point).
 *
 * Inputs:
 *   - --responses <path>  JSON file: array of { qtId, dimensionScores, isCorrect }
 *   - --prior <path>      JSON file: { [qtId]: weights } (defaults to current lib/ontology.ts)
 *   - --lambda <number>   ridge penalty (default 0.1)
 *   - --min <number>      min samples per QT (default 30)
 *   - --out <path>        write CalibrationResult JSON
 *   - --apply             update lib/ontology.ts weights in place + run C4.1 regression
 *
 * Without --apply: dry-run mode, prints summary table + writes --out file.
 *
 * Usage:
 *   node scripts/calibrate.mjs --responses data/responses.json --out out/calibration.json
 *   node scripts/calibrate.mjs --responses data/responses.json --apply  (caution!)
 *
 * Phase 1 dogfooding context: usually run manually after dogfooding session.
 * Phase 2 W6: GitHub Actions cron pulls Supabase events → runs this → auto-PR.
 */

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── CLI args ────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

// ─── Inline lib/calibration.ts (avoid TS loader) ────────────────────

const D2_D5 = ["D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];
const D1_FIXED = 0.05;

function transpose(M) { const r = M.length, c = M[0].length; const o = Array.from({ length: c }, () => new Array(r).fill(0)); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) o[j][i] = M[i][j]; return o; }
function matmul(A, B) { const r = A.length, ic = B.length, c = B[0].length; const o = Array.from({ length: r }, () => new Array(c).fill(0)); for (let i = 0; i < r; i++) for (let k = 0; k < ic; k++) { const a = A[i][k]; if (a === 0) continue; for (let j = 0; j < c; j++) o[i][j] += a * B[k][j]; } return o; }
function matvec(A, v) { const r = A.length; const o = new Array(r).fill(0); for (let i = 0; i < r; i++) { let s = 0; for (let j = 0; j < v.length; j++) s += A[i][j] * v[j]; o[i] = s; } return o; }
function inverse(M) {
  const n = M.length;
  const a = M.map((row, i) => row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(a[k][i]) > Math.abs(a[pivot][i])) pivot = k;
    if (pivot !== i) [a[i], a[pivot]] = [a[pivot], a[i]];
    const div = a[i][i];
    if (Math.abs(div) < 1e-12) throw new Error("singular");
    for (let j = 0; j < 2 * n; j++) a[i][j] /= div;
    for (let k = 0; k < n; k++) { if (k === i) continue; const f = a[k][i]; if (f === 0) continue; for (let j = 0; j < 2 * n; j++) a[k][j] -= f * a[i][j]; }
  }
  return a.map((row) => row.slice(n));
}

function ridgeFit4d(responses, prior, lambda) {
  const X = []; const y = [];
  for (const r of responses) {
    X.push(D2_D5.map((d) => (r.dimensionScores[d] ?? 0) / 100));
    y.push(r.isCorrect ? 1 : 0);
  }
  const wPrior = D2_D5.map((d) => prior[d] ?? 0.2375);
  const Xt = transpose(X);
  const XtX = matmul(Xt, X);
  const Xty = matvec(Xt, y);
  const Areg = XtX.map((row, i) => row.map((v, j) => v + (i === j ? lambda : 0)));
  const breg = Xty.map((v, i) => v + lambda * wPrior[i]);
  const Ainv = inverse(Areg);
  const wRaw = matvec(Ainv, breg);
  const wClipped = wRaw.map((v) => Math.max(0, v));
  const sum = wClipped.reduce((s, v) => s + v, 0);
  const wNormalized = sum > 0 ? wClipped.map((v) => (v / sum) * 0.95) : wPrior.slice();
  const weights = {
    D1_Form: D1_FIXED,
    D2_Meaning: wNormalized[0], D3_Context: wNormalized[1],
    D4_Network: wNormalized[2], D5_Usage: wNormalized[3],
  };
  let div = 0;
  for (let i = 0; i < D2_D5.length; i++) { const d = wNormalized[i] - wPrior[i]; div += d * d; }
  return { weights, divergence: div };
}

// ─── Hardcoded current weights (mirror lib/ontology.ts v2) ───────────

const CURRENT_WEIGHTS = {
  "TYPE-목적": { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.1, D5_Usage: 0.25 },
  "TYPE-심경": { D1_Form: 0.05, D2_Meaning: 0.35, D3_Context: 0.4, D4_Network: 0.1, D5_Usage: 0.1 },
  "TYPE-주장": { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.2 },
  "TYPE-요지": { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.25, D5_Usage: 0.1 },
  "TYPE-주제": { D1_Form: 0.05, D2_Meaning: 0.25, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.05 },
  "TYPE-제목": { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.35, D4_Network: 0.4, D5_Usage: 0.1 },
  "TYPE-빈칸추론": { D1_Form: 0.05, D2_Meaning: 0.2, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.1 },
  "TYPE-흐름무관": { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.15 },
  "TYPE-순서배열": { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.3 },
  "TYPE-문장삽입": { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.25 },
};

const QT_IDS = Object.keys(CURRENT_WEIGHTS);

// ─── Main ────────────────────────────────────────────────────────────

function calibrateWeights(input, opts = {}) {
  const lambda = opts.lambda ?? 0.1;
  const minSamplesPerQT = opts.minSamplesPerQT ?? 30;
  const byQT = {};
  for (const r of input.responses) (byQT[r.qtId] ||= []).push(r);
  const weights = {}, perQTSampleCount = {}, perQTAlgorithm = {}, perQTDivergence = {};
  let cal = 0, fb = 0;
  for (const qtId of QT_IDS) {
    const rs = byQT[qtId] ?? [];
    const prior = input.priorWeights[qtId];
    perQTSampleCount[qtId] = rs.length;
    if (rs.length < minSamplesPerQT || !prior) {
      weights[qtId] = prior ?? { D1_Form: 0.05, D2_Meaning: 0.2375, D3_Context: 0.2375, D4_Network: 0.2375, D5_Usage: 0.2375 };
      perQTAlgorithm[qtId] = "prior-fallback";
      perQTDivergence[qtId] = 0;
      fb++;
      continue;
    }
    const fit = ridgeFit4d(rs, prior, lambda);
    weights[qtId] = fit.weights;
    perQTAlgorithm[qtId] = "ridge-v1";
    perQTDivergence[qtId] = fit.divergence;
    cal++;
  }
  return { weights, perQTSampleCount, perQTAlgorithm, perQTDivergence, meta: { lambda, minSamplesPerQT, qtsCalibrated: cal, qtsFallback: fb, runAt: new Date().toISOString() } };
}

// ─── Entry ───────────────────────────────────────────────────────────

if (args.help || args.h) {
  console.log(`Usage:
  node scripts/calibrate.mjs --responses <path> [options]

Options:
  --responses <path>   JSON file: array of { qtId, dimensionScores, isCorrect }
  --prior <path>       JSON file: priorWeights (default: hardcoded v2)
  --lambda <number>    ridge penalty (default 0.1)
  --min <number>       min samples per QT (default 30)
  --out <path>         write CalibrationResult to JSON
  --apply              update lib/ontology.ts weights (CAUTION)
  --help               show this message
`);
  process.exit(0);
}

if (!args.responses) {
  console.error("Error: --responses <path> is required. Use --help for usage.");
  process.exit(2);
}

const responsesPath = join(ROOT, args.responses);
if (!existsSync(responsesPath)) {
  console.error(`Error: responses file not found: ${responsesPath}`);
  process.exit(2);
}
const responses = JSON.parse(readFileSync(responsesPath, "utf-8"));

const priorWeights = args.prior
  ? JSON.parse(readFileSync(join(ROOT, args.prior), "utf-8"))
  : CURRENT_WEIGHTS;

const lambda = args.lambda ? parseFloat(args.lambda) : 0.1;
const min = args.min ? parseInt(args.min, 10) : 30;

const result = calibrateWeights({ responses, priorWeights }, { lambda, minSamplesPerQT: min });

console.log("=== Calibration Result ===");
console.log(`λ = ${lambda} · min samples = ${min} · QTs calibrated = ${result.meta.qtsCalibrated} · fallback = ${result.meta.qtsFallback}`);
console.log("");
console.log("QT".padEnd(20) + "samples".padStart(8) + "algorithm".padStart(20) + "divergence".padStart(15));
console.log("-".repeat(63));
for (const qtId of QT_IDS) {
  console.log(
    qtId.padEnd(20) +
      String(result.perQTSampleCount[qtId]).padStart(8) +
      result.perQTAlgorithm[qtId].padStart(20) +
      result.perQTDivergence[qtId].toFixed(5).padStart(15)
  );
}

console.log("\n=== Weights diff (calibrated vs prior) ===");
for (const qtId of QT_IDS) {
  if (result.perQTAlgorithm[qtId] === "prior-fallback") continue;
  const newW = result.weights[qtId];
  const oldW = priorWeights[qtId];
  const diff = ["D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"]
    .map((d) => `${d}: ${(oldW[d] * 100).toFixed(0)}% → ${(newW[d] * 100).toFixed(0)}%`)
    .join("  ");
  console.log(`${qtId}: ${diff}`);
}

// Persist calibration result — required for --apply chain
const outPath = args.out || "out/calibration-latest.json";
const outAbs = join(ROOT, outPath);
import("node:fs").then(({ writeFileSync: wfs, existsSync: efs, mkdirSync: mds }) => {
  if (!efs(join(ROOT, "out"))) mds(join(ROOT, "out"));
  wfs(outAbs, JSON.stringify(result, null, 2));
  console.log(`\nWrote: ${outPath}`);

  if (args.apply) {
    console.log("\n=== --apply: invoking promote-weights with C4.1 regression gate ===");
    const reason = args.reason || `calibrate.mjs --apply ${new Date().toISOString()}`;
    const child = spawnSync(
      process.execPath,
      [join(ROOT, "scripts", "promote-weights.mjs"), "--calibration", outPath, "--reason", reason],
      { cwd: ROOT, stdio: "inherit" }
    );
    process.exit(child.status ?? 0);
  }
});
