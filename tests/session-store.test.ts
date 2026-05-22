/**
 * Vitest — session-store + session-export (Phase 1.5).
 * Mocks localStorage before importing libs.
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
  loadSessions,
  saveSession,
  clearSessions,
  summarizeSessions,
  type SessionRecord,
} from "@/lib/session-store";
import { exportSessionsForCalibration } from "@/lib/session-export";

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const base: SessionRecord = {
    sessionId: "s1",
    startedAt: "2026-05-23T10:00:00Z",
    endedAt: "2026-05-23T10:25:00Z",
    durationSec: 1500,
    targetQuestionType: "TYPE-요지",
    algorithm: "rule-v1-fallback",
    confidence: "low",
    alternateQuestionType: "TYPE-흐름무관",
    correct: 6,
    total: 10,
    advancements: 6,
    boxAfter: { "1": 4, "2": 5, "3": 1, "4": 0, "5": 0 },
    posteriorAfter: { qtId: "TYPE-요지", alpha: 8, beta: 6, samples: 10 },
    responses: [
      { itemId: "card-1", qtId: "TYPE-요지", isCorrect: true,
        dimensionScores: { D1_Form: 78, D2_Meaning: 82, D3_Context: 45, D4_Network: 60, D5_Usage: 71 },
        at: "2026-05-23T10:01:00Z" },
      { itemId: "card-2", qtId: "TYPE-요지", isCorrect: false,
        dimensionScores: { D1_Form: 78, D2_Meaning: 82, D3_Context: 45, D4_Network: 60, D5_Usage: 71 },
        at: "2026-05-23T10:02:30Z" },
    ],
  };
  return { ...base, ...overrides };
}

describe("session-store (Phase 1.5)", () => {
  beforeEach(() => fakeLocalStorage.clear());

  test("T1: Empty state load returns []", () => {
    expect(loadSessions()).toEqual([]);
  });

  test("T2: Save → load round-trip preserves record", () => {
    const s = makeSession();
    saveSession(s);
    const loaded = loadSessions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(s);
  });

  test("T3: Multiple saves accumulate", () => {
    saveSession(makeSession({ sessionId: "s1" }));
    saveSession(makeSession({ sessionId: "s2" }));
    saveSession(makeSession({ sessionId: "s3" }));
    const loaded = loadSessions();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((s) => s.sessionId)).toEqual(["s1", "s2", "s3"]);
  });

  test("T4: Multi-user storage isolation", () => {
    saveSession(makeSession({ sessionId: "userA-s1" }), "userA");
    saveSession(makeSession({ sessionId: "userB-s1" }), "userB");
    expect(loadSessions("userA")).toHaveLength(1);
    expect(loadSessions("userB")).toHaveLength(1);
    expect(loadSessions("userA")[0].sessionId).toBe("userA-s1");
    expect(loadSessions("userB")[0].sessionId).toBe("userB-s1");
  });

  test("T5: Schema version mismatch returns empty", () => {
    fakeLocalStorage.setItem(
      "oelp.sessions.default",
      JSON.stringify({ schemaVersion: 99, userId: "default", updatedAt: "...", sessions: [makeSession()] })
    );
    expect(loadSessions()).toEqual([]);
  });

  test("T6: Corrupted JSON returns []", () => {
    fakeLocalStorage.setItem("oelp.sessions.default", "{invalid json");
    expect(loadSessions()).toEqual([]);
  });

  test("T7: clearSessions wipes state", () => {
    saveSession(makeSession());
    expect(loadSessions()).toHaveLength(1);
    clearSessions();
    expect(loadSessions()).toHaveLength(0);
  });

  test("T8: Evaluation field optional", () => {
    const s = makeSession();
    saveSession(s);
    expect(loadSessions()[0].evaluation).toBeUndefined();

    const sWithEval = makeSession({
      sessionId: "s-eval",
      evaluation: {
        c1_2_diagnostic_consistency: 4,
        c2_1_map_acceptance: 5,
        c2_3_node_intuition: 4,
        c3_3_continue_intention: "yes",
        overall_satisfaction: 4,
        notes: "felt focused",
      },
    });
    saveSession(sWithEval);
    const loaded = loadSessions();
    expect(loaded[1].evaluation?.overall_satisfaction).toBe(4);
    expect(loaded[1].evaluation?.notes).toBe("felt focused");
  });

  test("T9: summarizeSessions — empty case", () => {
    const s = summarizeSessions([]);
    expect(s.total).toBe(0);
    expect(s.withEvaluation).toBe(0);
    expect(s.averageSatisfaction).toBeNull();
    expect(s.continueIntentionYesPct).toBeNull();
    expect(s.lastSessionAt).toBeNull();
  });

  test("T10: summarizeSessions — mixed (evaluated + unevaluated)", () => {
    const sessions = [
      makeSession({ sessionId: "s1", endedAt: "2026-05-23T10:00:00Z" }),
      makeSession({
        sessionId: "s2",
        endedAt: "2026-05-23T11:00:00Z",
        evaluation: {
          c1_2_diagnostic_consistency: 4, c2_1_map_acceptance: 5, c2_3_node_intuition: 4,
          c3_3_continue_intention: "yes", overall_satisfaction: 4, notes: "",
        },
      }),
      makeSession({
        sessionId: "s3",
        endedAt: "2026-05-23T12:00:00Z",
        evaluation: {
          c1_2_diagnostic_consistency: 3, c2_1_map_acceptance: 3, c2_3_node_intuition: 3,
          c3_3_continue_intention: "no", overall_satisfaction: 2, notes: "",
        },
      }),
    ];
    const s = summarizeSessions(sessions);
    expect(s.total).toBe(3);
    expect(s.withEvaluation).toBe(2);
    expect(s.averageSatisfaction).toBe(3); // (4 + 2) / 2
    expect(s.continueIntentionYesPct).toBe(0.5); // 1 of 2
    expect(s.lastSessionAt).toBe("2026-05-23T12:00:00Z");
  });
});

describe("session-export (Phase 1.5)", () => {
  test("T1: Empty sessions → empty calibration array", () => {
    expect(exportSessionsForCalibration([])).toEqual([]);
  });

  test("T2: 2 sessions × 2 responses each → 4 calibration rows", () => {
    const sessions = [makeSession({ sessionId: "s1" }), makeSession({ sessionId: "s2" })];
    const exported = exportSessionsForCalibration(sessions);
    expect(exported).toHaveLength(4);
    for (const r of exported) {
      expect(r).toHaveProperty("qtId");
      expect(r).toHaveProperty("dimensionScores");
      expect(r).toHaveProperty("isCorrect");
    }
  });

  test("T3: qtId preserved correctly", () => {
    const sessions = [makeSession()];
    const exported = exportSessionsForCalibration(sessions);
    for (const r of exported) {
      expect(r.qtId).toBe("TYPE-요지");
    }
  });
});
