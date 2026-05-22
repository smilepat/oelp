/**
 * Phase 1.5b — Active diagnostic persistence.
 *
 * Spec: docs/04-report/dogfooding-pass-1.md §4 (Constant X problem)
 *
 * Purpose: enable varied dimensionScores across sessions for meaningful
 * ridge calibration. User can:
 *   1. Click "데모 진단 결과 로드" → DEMO_DIAGNOSTIC becomes active
 *   2. Paste/import custom DiagnosticInput JSON → becomes active
 *   3. URL `?result=base64(JSON)` from level-test-pat → becomes active
 *
 * /queue then uses getActiveDiagnostic() instead of DEMO_DIAGNOSTIC constant.
 * Different active diagnostic → different dimensionScores in calibration export
 * → ridge regression sees rank > 1 → meaningful weight learning.
 */

import { DEMO_DIAGNOSTIC, isDiagnosticInput, type DiagnosticInput } from "./diagnostic";

const STORAGE_KEY = "oelp.activeDiagnostic";
const SCHEMA_VERSION = 1;

interface StoredEnvelope {
  schemaVersion: number;
  diagnostic: DiagnosticInput;
  setAt: string;
}

export function setActiveDiagnostic(diag: DiagnosticInput): void {
  if (typeof localStorage === "undefined") return;
  const env: StoredEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    diagnostic: diag,
    setAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(env));
  } catch {
    /* quota — silent */
  }
}

export function getActiveDiagnostic(): DiagnosticInput {
  if (typeof localStorage === "undefined") return DEMO_DIAGNOSTIC;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEMO_DIAGNOSTIC;
    const env = JSON.parse(raw) as StoredEnvelope;
    if (env.schemaVersion !== SCHEMA_VERSION) return DEMO_DIAGNOSTIC;
    if (!isDiagnosticInput(env.diagnostic)) return DEMO_DIAGNOSTIC;
    return env.diagnostic;
  } catch {
    return DEMO_DIAGNOSTIC;
  }
}

export function clearActiveDiagnostic(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}

/** Get active diagnostic + flag indicating whether it's the demo default. */
export function getActiveDiagnosticInfo(): {
  diagnostic: DiagnosticInput;
  isDefault: boolean;
  setAt: string | null;
} {
  if (typeof localStorage === "undefined") {
    return { diagnostic: DEMO_DIAGNOSTIC, isDefault: true, setAt: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { diagnostic: DEMO_DIAGNOSTIC, isDefault: true, setAt: null };
    const env = JSON.parse(raw) as StoredEnvelope;
    if (env.schemaVersion !== SCHEMA_VERSION || !isDiagnosticInput(env.diagnostic)) {
      return { diagnostic: DEMO_DIAGNOSTIC, isDefault: true, setAt: null };
    }
    return {
      diagnostic: env.diagnostic,
      isDefault: env.diagnostic.source === "demo",
      setAt: env.setAt,
    };
  } catch {
    return { diagnostic: DEMO_DIAGNOSTIC, isDefault: true, setAt: null };
  }
}
