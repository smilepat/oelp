#!/usr/bin/env node
/**
 * Promote calibrated weights with C4.1 regression gate (P-1 W6).
 *
 * Workflow:
 *   1. Read --calibration <calibration-result.json> (from calibrate.mjs --out)
 *   2. Backup lib/ontology-weights.json
 *   3. Write new weights (only QTs with algorithm=ridge-v1; fallback QTs unchanged)
 *   4. Run synthetic-validation-c4-1.mjs (uses the new JSON automatically)
 *   5. Parse Kendall tau + contradiction count from C4.1 report
 *   6. If PASS (tau ≥ minTau AND contradictions ≤ maxContradictions): keep + report
 *      If FAIL: restore backup + write failure report + exit 1
 *
 * Usage:
 *   node scripts/promote-weights.mjs --calibration out/calibration-demo.json
 *
 * Options:
 *   --calibration <path>   required: calibration result JSON
 *   --min-tau <number>     gate (default 0.4)
 *   --max-contradictions <n>  gate (default 0)
 *   --dry-run              don't write, just simulate (default false)
 *   --reason <string>      annotated in calibrationHistory entry
 *   --help
 *
 * Exit codes:
 *   0  PASS — weights promoted
 *   1  FAIL (gate) — backup restored, manual review needed
 *   2  Bad usage / IO error
 *
 * Used by:
 *   - calibrate.mjs --apply (synchronous chain)
 *   - .github/workflows/weekly-calibration.yml (cron entrypoint)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WEIGHTS_PATH = join(ROOT, "lib", "ontology-weights.json");
const REGRESSION_HISTORY_PATH = join(ROOT, "lib", "regression-history.json");

/**
 * Append a regression-history event. Safe across runs: no-op if the
 * history file doesn't exist (older checkouts) or already contains the
 * same id. The /regression-history UI reads this file directly, so this
 * is the link that makes the audit page self-updating.
 */
function appendRegressionHistoryEvent(event) {
  if (!existsSync(REGRESSION_HISTORY_PATH)) return false;
  try {
    const raw = readFileSync(REGRESSION_HISTORY_PATH, "utf-8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.events)) return false;
    if (data.events.some((e) => e.id === event.id)) return false;
    data.events.push(event);
    writeFileSync(REGRESSION_HISTORY_PATH, JSON.stringify(data, null, 2) + "\n");
    return true;
  } catch (err) {
    console.warn(`Warning: failed to update regression-history.json: ${err.message}`);
    return false;
  }
}

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

if (args.help) {
  console.log("Usage: node scripts/promote-weights.mjs --calibration <path> [--min-tau 0.4] [--max-contradictions 0] [--dry-run] [--reason \"...\"]");
  process.exit(0);
}

if (!args.calibration) {
  console.error("Error: --calibration <path> required.");
  process.exit(2);
}

const minTau = args["min-tau"] ? parseFloat(args["min-tau"]) : 0.4;
const maxContradictions = args["max-contradictions"] ? parseInt(args["max-contradictions"], 10) : 0;
const dryRun = !!args["dry-run"];
const reason = args.reason || "weekly calibration";

// ─── 1. Load calibration result ─────────────────────────────────────

const calibrationPath = join(ROOT, args.calibration);
if (!existsSync(calibrationPath)) {
  console.error(`Error: calibration file not found: ${calibrationPath}`);
  process.exit(2);
}
const calibration = JSON.parse(readFileSync(calibrationPath, "utf-8"));

// ─── 2. Backup existing weights ─────────────────────────────────────

const beforeRaw = readFileSync(WEIGHTS_PATH, "utf-8");
const before = JSON.parse(beforeRaw);
const previousVersion = before.version;

// ─── 3. Compose new weights ─────────────────────────────────────────

const newWeights = { ...before.weights };
const calibratedQTs = [];
const fallbackQTs = [];

for (const qtId of Object.keys(calibration.weights)) {
  const algo = calibration.perQTAlgorithm?.[qtId] ?? "prior-fallback";
  if (algo === "ridge-v1") {
    newWeights[qtId] = calibration.weights[qtId];
    calibratedQTs.push(qtId);
  } else {
    fallbackQTs.push(qtId);
  }
}

if (calibratedQTs.length === 0) {
  console.log("No QTs eligible for promotion (all fallback). Exiting cleanly.");
  process.exit(0);
}

const nextVersion = `auto-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).slice(-4)}`;
const next = {
  ...before,
  version: nextVersion,
  lastWriter: {
    tool: "promote-weights",
    writtenAt: new Date().toISOString(),
    reason,
  },
  weights: newWeights,
  calibrationHistory: [
    ...(before.calibrationHistory ?? []),
    {
      version: nextVersion,
      trigger: reason,
      previousVersion,
      changedQTs: calibratedQTs,
      perQTDivergence: calibratedQTs.reduce((acc, qt) => {
        acc[qt] = calibration.perQTDivergence?.[qt] ?? 0;
        return acc;
      }, {}),
      runAt: new Date().toISOString(),
      gateMinTau: minTau,
      gateMaxContradictions: maxContradictions,
    },
  ],
};

if (dryRun) {
  console.log("=== Dry run — no changes will be persisted ===");
  console.log(`Would promote ${calibratedQTs.length} QT(s):`);
  for (const qt of calibratedQTs) {
    console.log(`  ${qt}:`);
    const oldW = before.weights[qt];
    const newW = newWeights[qt];
    for (const d of ["D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"]) {
      console.log(`    ${d}: ${(oldW[d] * 100).toFixed(0)}% → ${(newW[d] * 100).toFixed(0)}%`);
    }
  }
  console.log(`\nFallback (unchanged): ${fallbackQTs.length} QT(s)`);
  process.exit(0);
}

// ─── 4. Write new weights ───────────────────────────────────────────

writeFileSync(WEIGHTS_PATH, JSON.stringify(next, null, 2) + "\n");
console.log(`Wrote ${calibratedQTs.length} updated QT weights (version ${nextVersion}).`);

// ─── 5. Run C4.1 regression ─────────────────────────────────────────

console.log("\nRunning C4.1 regression...");
const c41 = spawnSync(process.execPath, [join(ROOT, "scripts", "synthetic-validation-c4-1.mjs")], {
  cwd: ROOT,
  encoding: "utf-8",
});
if (c41.status !== 0) {
  console.error("C4.1 script crashed:", c41.stderr);
  restore();
  process.exit(1);
}

// Parse Kendall tau median + contradictions count from markdown
const c41Out = c41.stdout;
const tauMatch = c41Out.match(/Kendall tau \(median\)\*\*:\s*([0-9.]+)/);
const contradictionsMatch = c41Out.match(/도메인 모순 \(50셀 중\)\*\*:\s*([0-9]+)/);

if (!tauMatch || !contradictionsMatch) {
  console.error("Could not parse C4.1 output:", c41Out.slice(0, 500));
  restore();
  process.exit(1);
}

const tau = parseFloat(tauMatch[1]);
const contradictions = parseInt(contradictionsMatch[1], 10);

console.log(`\nC4.1 regression result: tau=${tau.toFixed(3)}, contradictions=${contradictions}`);
console.log(`Gate: tau ≥ ${minTau} AND contradictions ≤ ${maxContradictions}`);

if (tau < minTau || contradictions > maxContradictions) {
  console.error(`\n❌ FAIL — restoring previous weights`);
  restore();
  // Write failure marker for cron / PR
  const failPath = join(ROOT, "out", "promote-weights-fail.json");
  const failedAt = new Date().toISOString();
  writeFileSync(failPath, JSON.stringify({
    failedAt,
    tau,
    contradictions,
    gateMinTau: minTau,
    gateMaxContradictions: maxContradictions,
    attemptedVersion: nextVersion,
    attemptedChanges: calibratedQTs,
  }, null, 2));
  console.error(`Failure report: ${failPath}`);

  const appended = appendRegressionHistoryEvent({
    id: nextVersion,
    occurredAt: failedAt,
    kind: "auto-promote",
    result: "fail",
    version: nextVersion,
    previousVersion,
    trigger: reason,
    tau,
    contradictions,
    attemptedChanges: calibratedQTs,
    summary: `${calibratedQTs.length} QT 변경 시도 → tau ${tau.toFixed(2)}, 모순 ${contradictions}건 검출 → 자동 롤백`,
    lesson:
      contradictions > maxContradictions
        ? "도메인 keyVariable mapping과 충돌 → calibration 결과 거부"
        : `Kendall tau ${tau.toFixed(2)} < ${minTau} → 학습자 능력 순위 보존 실패`,
  });
  if (appended) console.error(`Appended to lib/regression-history.json (id=${nextVersion})`);

  process.exit(1);
}

console.log(`\n✅ PASS — weights promoted (version ${nextVersion}).`);
const successPath = join(ROOT, "out", "promote-weights-success.json");
if (!existsSync(join(ROOT, "out"))) {
  // ensure out/ dir exists
  spawnSync("mkdir", ["-p", join(ROOT, "out")]);
}
const promotedAt = new Date().toISOString();
writeFileSync(successPath, JSON.stringify({
  promotedAt,
  version: nextVersion,
  previousVersion,
  changedQTs: calibratedQTs,
  tau,
  contradictions,
}, null, 2));

const appended = appendRegressionHistoryEvent({
  id: nextVersion,
  occurredAt: promotedAt,
  kind: "auto-promote",
  result: "pass",
  version: nextVersion,
  previousVersion,
  trigger: reason,
  tau,
  contradictions,
  changedQTs: calibratedQTs,
  summary: `${calibratedQTs.length} QT 가중치 자동 승격 — tau ${tau.toFixed(2)}, 모순 ${contradictions}건`,
  lesson: "calibration 결과가 도메인 모순 게이트를 통과 → 가중치 적용",
});
if (appended) console.log(`Appended to lib/regression-history.json (id=${nextVersion})`);

function restore() {
  writeFileSync(WEIGHTS_PATH, beforeRaw);
  console.log("Restored previous weights from backup.");
}
