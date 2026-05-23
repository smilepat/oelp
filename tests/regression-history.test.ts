/**
 * Vitest — regression-history loader.
 * Audit data integrity (the page is purely declarative on top of this).
 */
import { describe, test, expect } from "vitest";
import {
  getRegressionEvents,
  countByResult,
} from "@/lib/regression-history";

describe("regression-history (Safety Net Audit)", () => {
  test("T1: getRegressionEvents returns at least 2 events (pass + fail covered)", () => {
    const events = getRegressionEvents();
    expect(events.length).toBeGreaterThanOrEqual(2);
    const results = new Set(events.map((e) => e.result));
    expect(results.has("pass")).toBe(true);
    expect(results.has("fail")).toBe(true);
  });

  test("T2: Events sorted newest first", () => {
    const events = getRegressionEvents();
    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].occurredAt).getTime();
      const curr = new Date(events[i].occurredAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  test("T3: Every event has required audit fields", () => {
    const events = getRegressionEvents();
    for (const e of events) {
      expect(e.id).toBeTruthy();
      expect(e.occurredAt).toBeTruthy();
      expect(["pass", "fail"]).toContain(e.result);
      expect(["initial", "manual-calibration", "auto-promote"]).toContain(e.kind);
      expect(typeof e.tau).toBe("number");
      expect(typeof e.contradictions).toBe("number");
      expect(e.summary.length).toBeGreaterThan(10);
      expect(e.lesson.length).toBeGreaterThan(10);
    }
  });

  test("T4: countByResult matches events", () => {
    const events = getRegressionEvents();
    const counts = countByResult();
    const expectedPass = events.filter((e) => e.result === "pass").length;
    const expectedFail = events.filter((e) => e.result === "fail").length;
    expect(counts.pass).toBe(expectedPass);
    expect(counts.fail).toBe(expectedFail);
    expect(counts.pass + counts.fail).toBe(events.length);
  });

  test("T5: Pass events have changedQTs OR are initial; fail events have attemptedChanges OR no changes", () => {
    const events = getRegressionEvents();
    for (const e of events) {
      if (e.result === "pass" && e.kind !== "initial") {
        expect(e.changedQTs?.length ?? 0).toBeGreaterThan(0);
      }
      // No assertion on fail — sometimes no changes attempted, sometimes attempted+rejected
    }
  });

  test("T6: Event ids are unique (auto-append idempotency contract)", () => {
    const events = getRegressionEvents();
    const ids = events.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
