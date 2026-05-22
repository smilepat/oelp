/**
 * Convert SessionRecord[] → CalibrationResponse[] for scripts/calibrate.mjs.
 *
 * Each per-card response in a session becomes one calibration input row.
 * Calibration treats responses independently — sessions are just grouping.
 */

import type { CalibrationResponse } from "./calibration";
import type { SessionRecord } from "./session-store";

export function exportSessionsForCalibration(
  sessions: SessionRecord[]
): CalibrationResponse[] {
  const out: CalibrationResponse[] = [];
  for (const session of sessions) {
    for (const r of session.responses) {
      out.push({
        qtId: r.qtId,
        dimensionScores: r.dimensionScores,
        isCorrect: r.isCorrect,
      });
    }
  }
  return out;
}

/**
 * Trigger a browser download for the calibration JSON.
 * No-op in non-browser environments (returns null).
 */
export function downloadCalibrationJSON(
  sessions: SessionRecord[],
  filename?: string
): string | null {
  if (typeof document === "undefined" || typeof URL === "undefined") return null;
  const data = exportSessionsForCalibration(sessions);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `oelp-sessions-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return url;
}
