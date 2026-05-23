/**
 * @vitest-environment jsdom
 *
 * Vitest — analytics-events lib (formalization of docs/01-plan/analytics-events.md).
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  logEvent,
  readEventQueue,
  clearEventQueue,
  resetAnalyticsSession,
  isKnownEventType,
  type AnalyticsEvent,
} from "@/lib/analytics-events";

beforeEach(() => {
  clearEventQueue();
  resetAnalyticsSession();
});

describe("analytics-events", () => {
  test("T1: logEvent persists to queue", () => {
    logEvent({ type: "map.viewed", properties: { hasDiagnostic: true } });
    const queue = readEventQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].event.type).toBe("map.viewed");
  });

  test("T2: occurredAt + sessionId attached", () => {
    logEvent({ type: "map.viewed", properties: { hasDiagnostic: false } });
    const entry = readEventQueue()[0];
    expect(entry.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.sessionId).toBeTruthy();
    expect(entry.sessionId.length).toBeGreaterThan(8);
  });

  test("T3: sessionId stable across logs within session", () => {
    logEvent({ type: "map.viewed", properties: { hasDiagnostic: false } });
    logEvent({ type: "map.viewed", properties: { hasDiagnostic: true } });
    const queue = readEventQueue();
    expect(queue[0].sessionId).toBe(queue[1].sessionId);
  });

  test("T4: resetAnalyticsSession rotates sessionId", () => {
    logEvent({ type: "map.viewed", properties: { hasDiagnostic: false } });
    const sid1 = readEventQueue()[0].sessionId;
    resetAnalyticsSession();
    logEvent({ type: "map.viewed", properties: { hasDiagnostic: false } });
    const sid2 = readEventQueue()[1].sessionId;
    expect(sid1).not.toBe(sid2);
  });

  test("T5: queue grows to MAX_QUEUE then trims (FIFO)", () => {
    // Write 1010 entries
    for (let i = 0; i < 1010; i++) {
      logEvent({ type: "map.viewed", properties: { hasDiagnostic: i % 2 === 0 } });
    }
    const queue = readEventQueue();
    // MAX_QUEUE = 1000
    expect(queue.length).toBe(1000);
    // First 10 dropped — last entry should match index 1009
    expect(queue[queue.length - 1].event.properties).toEqual({ hasDiagnostic: false });
  });

  test("T6: clearEventQueue empties", () => {
    logEvent({ type: "map.viewed", properties: { hasDiagnostic: false } });
    expect(readEventQueue()).toHaveLength(1);
    clearEventQueue();
    expect(readEventQueue()).toEqual([]);
  });

  test("T7: malformed storage falls back to []", () => {
    localStorage.setItem("oelp.analytics.queue", "not json");
    expect(readEventQueue()).toEqual([]);
  });

  test("T8: isKnownEventType validates", () => {
    expect(isKnownEventType("diag.completed")).toBe(true);
    expect(isKnownEventType("queue.started")).toBe(true);
    expect(isKnownEventType("calibration.attempted")).toBe(true);
    expect(isKnownEventType("unknown")).toBe(false);
  });

  test("T9: all 11 event types loggable + type-checked", () => {
    const events: AnalyticsEvent[] = [
      { type: "auth.signed_up", properties: { provider: "email" } },
      { type: "auth.signed_in", properties: { provider: "google" } },
      { type: "diag.started", properties: { source: "preset", presetId: "alpha" } },
      {
        type: "diag.item_answered",
        properties: { itemId: 1, isCorrect: true, responseTimeMs: 5000, currentTheta: 0.5, currentSe: 1.2 },
      },
      {
        type: "diag.completed",
        properties: {
          theta: 0.8,
          se: 0.3,
          cefr: "B2",
          level: 4,
          dimensionScores: { D1_Form: 70, D2_Meaning: 75, D3_Context: 60, D4_Network: 55, D5_Usage: 65 },
          weakDim: ["D4_Network"],
          strongDim: ["D2_Meaning"],
          totalItems: 25,
          durationSec: 600,
        },
      },
      { type: "map.viewed", properties: { hasDiagnostic: true } },
      { type: "map.node_clicked", properties: { nodeId: "TYPE-요지", nodeType: "questionType" } },
      {
        type: "queue.started",
        properties: {
          targetQT: "TYPE-요지",
          algorithm: "thompson-v2",
          confidence: "mid",
          generator: "local-pool-v1",
          selectionMode: "primary",
        },
      },
      {
        type: "queue.item_answered",
        properties: { itemId: "card-1", qtId: "TYPE-요지", isCorrect: true, responseTimeMs: 4000, sessionPos: 1 },
      },
      {
        type: "queue.completed",
        properties: { qtId: "TYPE-요지", correct: 7, total: 10, advancements: 5, durationSec: 1500, balanceAfter: 0.3 },
      },
      {
        type: "calibration.attempted",
        properties: { version: "auto-x", tau: 0.5, contradictions: 1, result: "fail", trigger: "weekly cron" },
      },
    ];
    for (const e of events) logEvent(e);
    expect(readEventQueue().length).toBe(events.length);
  });

  test("T10: logEvent never throws on internal error", () => {
    // Force JSON.stringify to throw
    const orig = JSON.stringify;
    vi.spyOn(JSON, "stringify").mockImplementationOnce(() => {
      throw new Error("simulated");
    });
    expect(() => logEvent({ type: "map.viewed", properties: { hasDiagnostic: false } })).not.toThrow();
    JSON.stringify = orig;
  });
});
