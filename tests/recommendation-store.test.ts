/**
 * Vitest port of scripts/test-recommendation-store.mjs.
 * Mocks localStorage via globalThis before importing the lib.
 */
import { describe, test, expect, beforeEach } from "vitest";

// Install localStorage mock BEFORE lib imports
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
  loadPosteriors,
  savePosteriors,
  clearPosteriors,
  reseedPosteriors,
  persistSessionResponses,
  diagnosticFingerprint,
} from "@/lib/recommendation-store";
import { initialPosteriors, priorFromDiagnostic } from "@/lib/recommendation";
import { QUESTION_TYPES } from "@/lib/ontology";
import type { VocabDimension } from "@/lib/diagnostic";

const DEMO_SCORES: Partial<Record<VocabDimension, number>> = {
  D1_Form: 78, D2_Meaning: 82, D3_Context: 45, D4_Network: 60, D5_Usage: 71,
};
const DRIFTED_SCORES: Partial<Record<VocabDimension, number>> = {
  D1_Form: 78, D2_Meaning: 82, D3_Context: 70, D4_Network: 60, D5_Usage: 71,
};

describe("recommendation-store (P-1 W2)", () => {
  beforeEach(() => fakeLocalStorage.clear());

  test("T1: First load (empty storage) returns initial priors", () => {
    const p = loadPosteriors(DEMO_SCORES);
    expect(Object.keys(p)).toHaveLength(QUESTION_TYPES.length);
    expect(p["TYPE-요지"].samples).toBe(0);
  });

  test("T2: Save → load round-trip preserves posteriors", () => {
    const p = loadPosteriors(DEMO_SCORES);
    p["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 10, beta: 5, samples: 13 };
    savePosteriors(p, DEMO_SCORES);
    const loaded = loadPosteriors(DEMO_SCORES);
    expect(loaded["TYPE-요지"]).toEqual(p["TYPE-요지"]);
  });

  test("T3: diagnosticFingerprint stable within 5-unit bucket", () => {
    const fp1 = diagnosticFingerprint(DEMO_SCORES);
    const fp2 = diagnosticFingerprint({ ...DEMO_SCORES, D3_Context: 47 });
    expect(fp1).toBe(fp2);
  });

  test("T4: diagnosticFingerprint changes on bucket crossing", () => {
    const fp1 = diagnosticFingerprint(DEMO_SCORES);
    const fp2 = diagnosticFingerprint(DRIFTED_SCORES);
    expect(fp1).not.toBe(fp2);
  });

  test("T5: Drifted diagnostic triggers reseed", () => {
    const initial = loadPosteriors(DEMO_SCORES);
    initial["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 50, beta: 50, samples: 95 };
    savePosteriors(initial, DEMO_SCORES);
    const reloaded = loadPosteriors(DRIFTED_SCORES);
    expect(reloaded["TYPE-요지"].alpha).not.toBe(50);
    expect(reloaded["TYPE-요지"].samples).toBeGreaterThanOrEqual(60);
    expect(reloaded["TYPE-요지"].samples).toBeLessThanOrEqual(70);
  });

  test("T6: Reseed blends old + new prior", () => {
    const old: Record<string, ReturnType<typeof priorFromDiagnostic>> = {};
    for (const qt of QUESTION_TYPES) old[qt.id] = priorFromDiagnostic(qt, DEMO_SCORES);
    old["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 90, beta: 10, samples: 95 };
    const reseeded = reseedPosteriors(old, DRIFTED_SCORES);
    const r = reseeded["TYPE-요지"];
    const mean = r.alpha / (r.alpha + r.beta);
    expect(mean).toBeGreaterThan(0.7);
    expect(mean).toBeLessThan(0.9);
  });

  test("T7: persistSessionResponses updates and saves", () => {
    const responses = [
      { qtId: "TYPE-요지", isCorrect: true },
      { qtId: "TYPE-요지", isCorrect: false },
      { qtId: "TYPE-요지", isCorrect: true },
    ];
    const after = persistSessionResponses(responses, DEMO_SCORES);
    const initial = initialPosteriors(DEMO_SCORES)["TYPE-요지"];
    expect(after["TYPE-요지"].alpha).toBe(initial.alpha + 2);
    expect(after["TYPE-요지"].beta).toBe(initial.beta + 1);
    expect(after["TYPE-요지"].samples).toBe(3);

    const reloaded = loadPosteriors(DEMO_SCORES);
    expect(reloaded["TYPE-요지"].alpha).toBe(after["TYPE-요지"].alpha);
  });

  test("T8: clearPosteriors wipes state", () => {
    savePosteriors(initialPosteriors(DEMO_SCORES), DEMO_SCORES);
    expect(fakeLocalStorage.getItem("oelp.posteriors.default")).not.toBeNull();
    clearPosteriors();
    expect(fakeLocalStorage.getItem("oelp.posteriors.default")).toBeNull();
  });

  test("T9: Corrupted JSON falls back to initial priors", () => {
    fakeLocalStorage.setItem("oelp.posteriors.default", "{invalid json");
    const p = loadPosteriors(DEMO_SCORES);
    expect(Object.keys(p)).toHaveLength(QUESTION_TYPES.length);
    expect(p["TYPE-요지"].samples).toBe(0);
  });

  test("T10: Schema version mismatch → fresh prior", () => {
    const old = {
      schemaVersion: 99,
      userId: "default",
      updatedAt: new Date().toISOString(),
      diagnosticFingerprint: diagnosticFingerprint(DEMO_SCORES),
      posteriors: { "TYPE-요지": { qtId: "TYPE-요지", alpha: 99, beta: 1, samples: 99 } },
    };
    fakeLocalStorage.setItem("oelp.posteriors.default", JSON.stringify(old));
    const p = loadPosteriors(DEMO_SCORES);
    expect(p["TYPE-요지"].alpha).not.toBe(99);
  });

  test("T11: Multi-user — independent storage keys", () => {
    persistSessionResponses([{ qtId: "TYPE-요지", isCorrect: true }], DEMO_SCORES, "userA");
    persistSessionResponses([{ qtId: "TYPE-요지", isCorrect: false }], DEMO_SCORES, "userB");
    const a = loadPosteriors(DEMO_SCORES, "userA");
    const b = loadPosteriors(DEMO_SCORES, "userB");
    const meanA = a["TYPE-요지"].alpha / (a["TYPE-요지"].alpha + a["TYPE-요지"].beta);
    const meanB = b["TYPE-요지"].alpha / (b["TYPE-요지"].alpha + b["TYPE-요지"].beta);
    expect(meanA).toBeGreaterThan(meanB);
  });
});
