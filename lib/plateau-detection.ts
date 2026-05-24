/**
 * Plateau detection for dim score evolution over sessions (v13).
 *
 * v10 finding: D1_Form은 weight matrix상 모든 QT에서 0.05 (임계 0.15 미달)
 * 라 학습으로 강화되지 않음. 본 module은 세션 누적 시 dim별 점수 진화를
 * 모니터링해서 plateau를 자동 감지.
 *
 * 실 학습자 1명 도착 + 4주 누적 시 즉시 D1 plateau confirmed/refuted.
 *
 * Algorithm: 시간 순 정렬 N≥4 sessions에서 한 dim score의 max-min이
 * threshold (default 3 points) 미만이고, slope가 거의 0이면 plateau.
 */

import type { SessionRecord } from "./session-store";
import type { VocabDimension } from "./diagnostic";

export const DIMS: VocabDimension[] = [
  "D1_Form",
  "D2_Meaning",
  "D3_Context",
  "D4_Network",
  "D5_Usage",
];

export interface PlateauFlag {
  dim: VocabDimension;
  sessionsObserved: number;
  rangePoints: number;
  meanScore: number;
  severity: "info" | "warn";
}

export interface PlateauDetectionResult {
  flags: PlateauFlag[];
  sessionsAnalyzed: number;
  /** Minimum sessions required to run detection */
  minSessions: number;
  hasD1Plateau: boolean;
}

/**
 * Detect plateaus from session history.
 * @param sessions Session records (any order — sorted internally)
 * @param minSessions Minimum sessions needed (default 4)
 * @param rangeThreshold Max-min < threshold = plateau candidate (default 3 points)
 */
export function detectPlateaus(
  sessions: SessionRecord[],
  minSessions = 4,
  rangeThreshold = 3
): PlateauDetectionResult {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime()
  );

  if (sorted.length < minSessions) {
    return {
      flags: [],
      sessionsAnalyzed: sorted.length,
      minSessions,
      hasD1Plateau: false,
    };
  }

  // dimensionScores per session — using first response's dimensionScores
  // (all responses in a session share the same diagnostic-anchored scores)
  const dimSeries: Record<VocabDimension, number[]> = {
    D1_Form: [],
    D2_Meaning: [],
    D3_Context: [],
    D4_Network: [],
    D5_Usage: [],
  };

  for (const s of sorted) {
    const first = s.responses[0];
    if (!first?.dimensionScores) continue;
    for (const d of DIMS) {
      const v = first.dimensionScores[d];
      if (typeof v === "number") dimSeries[d].push(v);
    }
  }

  const flags: PlateauFlag[] = [];
  for (const d of DIMS) {
    const series = dimSeries[d];
    if (series.length < minSessions) continue;
    const max = Math.max(...series);
    const min = Math.min(...series);
    const range = max - min;
    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    if (range < rangeThreshold) {
      flags.push({
        dim: d,
        sessionsObserved: series.length,
        rangePoints: +range.toFixed(1),
        meanScore: +mean.toFixed(1),
        severity: d === "D1_Form" ? "warn" : "info",
      });
    }
  }

  return {
    flags,
    sessionsAnalyzed: sorted.length,
    minSessions,
    hasD1Plateau: flags.some((f) => f.dim === "D1_Form"),
  };
}
