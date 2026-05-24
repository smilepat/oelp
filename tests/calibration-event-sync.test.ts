/**
 * @vitest-environment jsdom
 *
 * Vitest — CalibrationEventSync.syncMissingEvents (idempotent sync logic).
 *
 * Validates: regression-history events emit one calibration.attempted
 * per version, skipping versions already in the queue.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { syncMissingEvents } from "@/components/CalibrationEventSync";
import { clearEventQueue, readEventQueue } from "@/lib/analytics-events";
import type { RegressionEvent } from "@/lib/regression-history";

const SAMPLE_EVENTS: RegressionEvent[] = [
  {
    id: "v1-initial",
    occurredAt: "2026-05-22T00:00:00Z",
    kind: "initial",
    result: "fail",
    version: "v1-2026-05-22",
    trigger: "initial heuristic",
    tau: 0.4,
    contradictions: 5,
    summary: "test",
    lesson: "test",
  },
  {
    id: "v2-promote",
    occurredAt: "2026-05-22T12:00:00Z",
    kind: "auto-promote",
    result: "pass",
    version: "v2-2026-05-22",
    trigger: "calibrate.mjs",
    tau: 0.6,
    contradictions: 0,
    changedQTs: ["TYPE-목적"],
    summary: "test",
    lesson: "test",
  },
];

describe("CalibrationEventSync.syncMissingEvents", () => {
  beforeEach(() => {
    clearEventQueue();
  });

  test("T1: empty queue → emits one event per regression record", () => {
    const result = syncMissingEvents(SAMPLE_EVENTS);
    expect(result.added).toBe(2);
    expect(result.alreadyPresent).toBe(0);

    const queue = readEventQueue();
    expect(queue.length).toBe(2);
    expect(queue.every((e) => e.event.type === "calibration.attempted")).toBe(true);
  });

  test("T2: idempotent — second call adds zero", () => {
    syncMissingEvents(SAMPLE_EVENTS);
    const result2 = syncMissingEvents(SAMPLE_EVENTS);
    expect(result2.added).toBe(0);
    expect(result2.alreadyPresent).toBe(2);
  });

  test("T3: partial existing — adds only the missing version", () => {
    syncMissingEvents([SAMPLE_EVENTS[0]]); // only v1 in queue
    const result = syncMissingEvents(SAMPLE_EVENTS);
    expect(result.added).toBe(1);
    expect(result.alreadyPresent).toBe(1);
  });

  test("T4: event properties carry through correctly", () => {
    syncMissingEvents(SAMPLE_EVENTS);
    const queue = readEventQueue();
    const v2Event = queue.find(
      (e) => e.event.type === "calibration.attempted" && e.event.properties.version === "v2-2026-05-22"
    );
    expect(v2Event).toBeDefined();
    if (v2Event && v2Event.event.type === "calibration.attempted") {
      expect(v2Event.event.properties.tau).toBe(0.6);
      expect(v2Event.event.properties.contradictions).toBe(0);
      expect(v2Event.event.properties.result).toBe("pass");
      expect(v2Event.event.properties.changedQTs).toEqual(["TYPE-목적"]);
    }
  });

  test("T5: empty regression events array → no-op", () => {
    const result = syncMissingEvents([]);
    expect(result.added).toBe(0);
    expect(result.alreadyPresent).toBe(0);
    expect(readEventQueue()).toEqual([]);
  });
});
