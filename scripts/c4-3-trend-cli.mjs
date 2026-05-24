#!/usr/bin/env node
/**
 * c4-3-trend-cli — C4.3 trend-analysis CLI wrapper.
 *
 * lib/trend-analysis.ts는 UI에서 사용되는 함수만 제공. 본 CLI는 CI cron이나
 * 본인 dogfooding session에서 누적 데이터를 직접 분석 가능하게:
 *
 * Input: JSON file with array of snapshots:
 *   [{ at: "2026-05-25T...", learnerId: "...", source: "session",
 *      dimensionScores: { D1_Form: 60, D2_Meaning: 70, ... } }, ...]
 *
 * 또는 sessions JSON (responses[0].dimensionScores extraction):
 *   --from-sessions file.json
 *
 * Output: TrendResult JSON (slopes per dim + variance direction + windows).
 *
 * Exit codes:
 *   0 — analysis 정상 출력
 *   1 — input file 못 읽음
 *   2 — < 2 snapshots (insufficient data)
 *
 * Run:
 *   node scripts/c4-3-trend-cli.mjs --input data/snapshots.json
 *   node scripts/c4-3-trend-cli.mjs --from-sessions data/dogfood.json
 *   node scripts/c4-3-trend-cli.mjs --input data/snapshots.json --windows 8
 */

import { readFileSync, existsSync } from "node:fs";
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

const inputPath = args.input;
const sessionsPath = args["from-sessions"];
const numWindows = args.windows ? parseInt(args.windows, 10) : 4;

if (!inputPath && !sessionsPath) {
  console.error("Usage: c4-3-trend-cli --input <snapshots.json> | --from-sessions <sessions.json>");
  console.error("       [--windows N] (default 4)");
  process.exit(1);
}

const file = inputPath ?? sessionsPath;
if (!existsSync(file)) {
  console.error(JSON.stringify({ error: `file not found: ${file}` }));
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, "utf-8"));
let snapshots;

if (sessionsPath) {
  // Extract dimensionScores from session.responses[0]
  const sessions = Array.isArray(raw) ? raw : raw.sessions ?? [];
  snapshots = sessions
    .map((s) => {
      const first = s.responses?.[0];
      if (!first?.dimensionScores) return null;
      return {
        at: s.endedAt ?? s.at ?? new Date().toISOString(),
        learnerId: s.learnerId ?? "session-derived",
        source: "session",
        dimensionScores: first.dimensionScores,
      };
    })
    .filter((s) => s !== null);
} else {
  snapshots = Array.isArray(raw) ? raw : [];
}

if (snapshots.length < 2) {
  console.error(JSON.stringify({
    error: "insufficient data",
    snapshotsFound: snapshots.length,
    minimumRequired: 2,
  }));
  process.exit(2);
}

// ─── Replicate analyzeTrend logic (cannot import TS from .mjs cleanly) ──

const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

function computeWindows(snapshots, numWindows = 4) {
  if (snapshots.length === 0 || numWindows < 1) return [];
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
  const start = new Date(sorted[0].at).getTime();
  const end = new Date(sorted[sorted.length - 1].at).getTime();
  if (end === start) return [snapshotToWindow(sorted, sorted[0].at, sorted[0].at)];
  const span = end - start;
  const step = span / numWindows;
  const windows = [];
  for (let i = 0; i < numWindows; i++) {
    const wStart = start + i * step;
    const wEnd = i === numWindows - 1 ? end + 1 : start + (i + 1) * step;
    const inWindow = sorted.filter((s) => {
      const t = new Date(s.at).getTime();
      return t >= wStart && t < wEnd;
    });
    windows.push(
      snapshotToWindow(inWindow, new Date(wStart).toISOString(), new Date(wEnd).toISOString())
    );
  }
  return windows;
}

function snapshotToWindow(snaps, from, to) {
  const mean = Object.fromEntries(DIMS.map((d) => [d, null]));
  const variance = Object.fromEntries(DIMS.map((d) => [d, null]));
  for (const d of DIMS) {
    const vals = snaps
      .map((s) => s.dimensionScores[d])
      .filter((v) => typeof v === "number");
    if (vals.length === 0) continue;
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    mean[d] = +m.toFixed(2);
    if (vals.length >= 2) {
      const sumSq = vals.reduce((a, b) => a + (b - m) ** 2, 0);
      variance[d] = +(sumSq / (vals.length - 1)).toFixed(3);
    } else {
      variance[d] = 0;
    }
  }
  return { from, to, count: snaps.length, mean, variance };
}

function analyzeTrend(snapshots, numWindows = 4) {
  const windows = computeWindows(snapshots, numWindows);
  const learnerId = snapshots[0]?.learnerId ?? "(unknown)";
  const slopes = Object.fromEntries(DIMS.map((d) => [d, null]));
  const varianceDirection = Object.fromEntries(
    DIMS.map((d) => [d, "insufficient"])
  );

  for (const d of DIMS) {
    const meansWithData = windows.filter((w) => w.mean[d] !== null);
    if (meansWithData.length >= 2) {
      slopes[d] = +(
        meansWithData[meansWithData.length - 1].mean[d] -
        meansWithData[0].mean[d]
      ).toFixed(2);
    }
    const varsWithData = windows.filter(
      (w) => w.variance[d] !== null && w.variance[d] > 0
    );
    if (varsWithData.length >= 2) {
      const first = varsWithData[0].variance[d];
      const last = varsWithData[varsWithData.length - 1].variance[d];
      if (last < first * 0.8) varianceDirection[d] = "decreasing";
      else if (last > first * 1.2) varianceDirection[d] = "increasing";
      else varianceDirection[d] = "flat";
    }
  }
  return { learnerId, windows, slopes, varianceDirection };
}

const result = analyzeTrend(snapshots, numWindows);

console.log(JSON.stringify({
  inputFile: file,
  snapshotsAnalyzed: snapshots.length,
  numWindows,
  ...result,
}, null, 2));

process.exit(0);
