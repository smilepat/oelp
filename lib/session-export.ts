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
 * Trigger a browser download for the calibration JSON (W6 calibrate.mjs format).
 * Strips evaluation, dimensionScores-only per-card structure.
 */
export function downloadCalibrationJSON(
  sessions: SessionRecord[],
  filename?: string
): string | null {
  const data = exportSessionsForCalibration(sessions);
  return triggerDownload(
    data,
    filename ?? `oelp-sessions-${new Date().toISOString().slice(0, 10)}.json`
  );
}

/**
 * Trigger a browser download for the full SessionRecord[] (includes evaluations
 * + per-card responses + metadata). Used for sharing complete dogfooding data.
 */
export function downloadFullSessionsJSON(
  sessions: SessionRecord[],
  filename?: string
): string | null {
  return triggerDownload(
    sessions,
    filename ?? `oelp-sessions-full-${new Date().toISOString().slice(0, 10)}.json`
  );
}

function triggerDownload(data: unknown, filename: string): string | null {
  if (typeof document === "undefined" || typeof URL === "undefined") return null;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return url;
}
