/**
 * Vitest — active-diagnostic (P-1.5b).
 * Mocks localStorage before importing lib.
 */
import { describe, test, expect, beforeEach } from "vitest";

const _store = new Map<string, string>();
const fakeLocalStorage = {
  getItem(k: string) { return _store.has(k) ? _store.get(k)! : null; },
  setItem(k: string, v: string) { _store.set(k, v); },
  removeItem(k: string) { _store.delete(k); },
  clear() { _store.clear(); },
  get length() { return _store.size; },
  key(i: number) { return Array.from(_store.keys())[i] ?? null; },
};
(globalThis as unknown as { localStorage: typeof fakeLocalStorage }).localStorage = fakeLocalStorage;

import {
  setActiveDiagnostic,
  getActiveDiagnostic,
  clearActiveDiagnostic,
  getActiveDiagnosticInfo,
} from "@/lib/active-diagnostic";
import { DEMO_DIAGNOSTIC, type DiagnosticInput } from "@/lib/diagnostic";

const CUSTOM_DIAG: DiagnosticInput = {
  studentName: "고2 학생",
  theta: 0.7,
  level: 5,
  cefr: "B2",
  dimensionScores: { D1_Form: 85, D2_Meaning: 75, D3_Context: 55, D4_Network: 65, D5_Usage: 78 },
  weakDim: ["D3_Context"],
  strongDim: ["D1_Form", "D5_Usage"],
  timestamp: "2026-05-23T14:00:00Z",
  source: "level-test-pat-import",
};

describe("active-diagnostic (P-1.5b)", () => {
  beforeEach(() => fakeLocalStorage.clear());

  test("T1: getActiveDiagnostic returns DEMO_DIAGNOSTIC when nothing stored", () => {
    expect(getActiveDiagnostic()).toEqual(DEMO_DIAGNOSTIC);
  });

  test("T2: setActiveDiagnostic round-trip via getActiveDiagnostic", () => {
    setActiveDiagnostic(CUSTOM_DIAG);
    expect(getActiveDiagnostic()).toEqual(CUSTOM_DIAG);
  });

  test("T3: getActiveDiagnosticInfo returns isDefault=false for custom", () => {
    setActiveDiagnostic(CUSTOM_DIAG);
    const info = getActiveDiagnosticInfo();
    expect(info.diagnostic).toEqual(CUSTOM_DIAG);
    expect(info.isDefault).toBe(false);
    expect(info.setAt).not.toBeNull();
  });

  test("T4: getActiveDiagnosticInfo returns isDefault=true for DEMO", () => {
    setActiveDiagnostic(DEMO_DIAGNOSTIC);
    const info = getActiveDiagnosticInfo();
    expect(info.isDefault).toBe(true);
  });

  test("T5: clearActiveDiagnostic reverts to DEMO", () => {
    setActiveDiagnostic(CUSTOM_DIAG);
    clearActiveDiagnostic();
    expect(getActiveDiagnostic()).toEqual(DEMO_DIAGNOSTIC);
    const info = getActiveDiagnosticInfo();
    expect(info.isDefault).toBe(true);
    expect(info.setAt).toBeNull();
  });

  test("T6: Corrupted JSON falls back to DEMO", () => {
    fakeLocalStorage.setItem("oelp.activeDiagnostic", "{invalid json");
    expect(getActiveDiagnostic()).toEqual(DEMO_DIAGNOSTIC);
  });

  test("T7: Schema version mismatch falls back to DEMO", () => {
    fakeLocalStorage.setItem(
      "oelp.activeDiagnostic",
      JSON.stringify({ schemaVersion: 99, diagnostic: CUSTOM_DIAG, setAt: "..." })
    );
    expect(getActiveDiagnostic()).toEqual(DEMO_DIAGNOSTIC);
  });

  test("T8: Invalid DiagnosticInput shape falls back to DEMO", () => {
    fakeLocalStorage.setItem(
      "oelp.activeDiagnostic",
      JSON.stringify({
        schemaVersion: 1,
        diagnostic: { studentName: "X" }, // missing required fields
        setAt: "..."
      })
    );
    expect(getActiveDiagnostic()).toEqual(DEMO_DIAGNOSTIC);
  });

  test("T9: Setting different diagnostics overwrites previous", () => {
    setActiveDiagnostic(CUSTOM_DIAG);
    const alt: DiagnosticInput = {
      ...CUSTOM_DIAG,
      studentName: "재수생",
      theta: 1.2,
      dimensionScores: { D1_Form: 90, D2_Meaning: 88, D3_Context: 70, D4_Network: 75, D5_Usage: 82 },
    };
    setActiveDiagnostic(alt);
    expect(getActiveDiagnostic()).toEqual(alt);
    expect(getActiveDiagnostic().studentName).toBe("재수생");
  });
});
