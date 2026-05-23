/**
 * C4.3 trend-spotting infrastructure (PRD §B-5).
 *
 * Computes 4-week (configurable) trends over learner diagnostic data
 * accumulated across sessions. Designed to be invoked from /sessions
 * page once enough data is present, or from a future learner-cohort
 * analytics route.
 *
 * Trend signal: per-dimension score variance over time should *decrease*
 * as learning consolidates (the learner becomes more uniform across
 * dimensions). Spike-style noise without trend → no learning. Monotonic
 * decrease → improvement.
 *
 * This module is the math layer; the UI rendering happens elsewhere.
 *
 * Scaffolded 2026-05-23 (dogfooding-3 follow-up). Will be exercised
 * meaningfully when external learner data accumulates (K5 KPI of
 * phase2-backlog-v2).
 */

import type { VocabDimension } from "./diagnostic";

export interface DiagnosticSnapshot {
  /** ISO timestamp */
  at: string;
  /** Learner identifier (anonymous OK) */
  learnerId: string;
  /** Source diagnostic — vocab-cat-test, preset, etc. */
  source: string;
  /** 5D scores (0-100) */
  dimensionScores: Partial<Record<VocabDimension, number>>;
}

export interface TrendWindow {
  /** Window start (inclusive) */
  from: string;
  /** Window end (exclusive) */
  to: string;
  /** Number of snapshots in this window */
  count: number;
  /** Per-dimension mean */
  mean: Record<VocabDimension, number | null>;
  /** Per-dimension variance (sample variance) */
  variance: Record<VocabDimension, number | null>;
}

export interface TrendResult {
  learnerId: string;
  windows: TrendWindow[];
  /**
   * Slope per dimension (mean_late - mean_early) — positive = improvement.
   * null = insufficient data (< 2 windows with data).
   */
  slopes: Record<VocabDimension, number | null>;
  /**
   * Variance trajectory per dimension. "decreasing" means the learner is
   * stabilizing (good); "increasing" means noisy; "flat" = no signal.
   */
  varianceDirection: Record<VocabDimension, "decreasing" | "increasing" | "flat" | "insufficient">;
}

export const DIMS: VocabDimension[] = [
  "D1_Form",
  "D2_Meaning",
  "D3_Context",
  "D4_Network",
  "D5_Usage",
];

/**
 * Bucket snapshots into N equal-width windows over the [first, last] range.
 * Default 4 = monthly weeks if span is one month.
 */
export function computeWindows(
  snapshots: DiagnosticSnapshot[],
  numWindows = 4
): TrendWindow[] {
  if (snapshots.length === 0 || numWindows < 1) return [];
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
  const start = new Date(sorted[0].at).getTime();
  const end = new Date(sorted[sorted.length - 1].at).getTime();
  if (end === start) {
    // All snapshots at same instant — single window
    return [snapshotToWindow(sorted, sorted[0].at, sorted[0].at)];
  }
  const span = end - start;
  const step = span / numWindows;
  const windows: TrendWindow[] = [];
  for (let i = 0; i < numWindows; i++) {
    const wStart = start + i * step;
    const wEnd = i === numWindows - 1 ? end + 1 : start + (i + 1) * step;
    const inWindow = sorted.filter((s) => {
      const t = new Date(s.at).getTime();
      return t >= wStart && t < wEnd;
    });
    windows.push(
      snapshotToWindow(
        inWindow,
        new Date(wStart).toISOString(),
        new Date(wEnd).toISOString()
      )
    );
  }
  return windows;
}

function snapshotToWindow(
  snaps: DiagnosticSnapshot[],
  from: string,
  to: string
): TrendWindow {
  const mean: Record<VocabDimension, number | null> = {
    D1_Form: null, D2_Meaning: null, D3_Context: null, D4_Network: null, D5_Usage: null,
  };
  const variance: Record<VocabDimension, number | null> = { ...mean };
  for (const d of DIMS) {
    const vals = snaps
      .map((s) => s.dimensionScores[d])
      .filter((v): v is number => typeof v === "number");
    if (vals.length === 0) continue;
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    mean[d] = m;
    if (vals.length >= 2) {
      const sumSq = vals.reduce((a, b) => a + (b - m) ** 2, 0);
      variance[d] = sumSq / (vals.length - 1); // sample variance
    } else {
      variance[d] = 0;
    }
  }
  return { from, to, count: snaps.length, mean, variance };
}

/**
 * Compute per-dimension slope (last window mean - first window mean) and
 * variance direction (decreasing/increasing/flat).
 *
 * Variance direction policy:
 *   - Compare first non-null variance window to last non-null variance window
 *   - If last < first × 0.8 → "decreasing" (stabilizing — good)
 *   - If last > first × 1.2 → "increasing" (noisier — concerning)
 *   - Else → "flat"
 *   - Insufficient (< 2 windows with data) → "insufficient"
 */
export function analyzeTrend(
  snapshots: DiagnosticSnapshot[],
  numWindows = 4
): TrendResult {
  const windows = computeWindows(snapshots, numWindows);
  const learnerId = snapshots[0]?.learnerId ?? "(unknown)";

  const slopes: Record<VocabDimension, number | null> = {
    D1_Form: null, D2_Meaning: null, D3_Context: null, D4_Network: null, D5_Usage: null,
  };
  const varianceDirection: Record<
    VocabDimension,
    "decreasing" | "increasing" | "flat" | "insufficient"
  > = {
    D1_Form: "insufficient",
    D2_Meaning: "insufficient",
    D3_Context: "insufficient",
    D4_Network: "insufficient",
    D5_Usage: "insufficient",
  };

  for (const d of DIMS) {
    const meansWithData = windows.filter((w) => w.mean[d] !== null);
    if (meansWithData.length >= 2) {
      slopes[d] = (meansWithData[meansWithData.length - 1].mean[d] as number) -
                  (meansWithData[0].mean[d] as number);
    }
    const varsWithData = windows.filter((w) => w.variance[d] !== null && (w.variance[d] as number) > 0);
    if (varsWithData.length >= 2) {
      const first = varsWithData[0].variance[d] as number;
      const last = varsWithData[varsWithData.length - 1].variance[d] as number;
      if (last < first * 0.8) varianceDirection[d] = "decreasing";
      else if (last > first * 1.2) varianceDirection[d] = "increasing";
      else varianceDirection[d] = "flat";
    }
  }

  return { learnerId, windows, slopes, varianceDirection };
}
