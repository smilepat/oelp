/**
 * Vitest — error-log lib (Stage A3).
 *
 * Validates the localStorage-backed error log used by ErrorBoundary and
 * global window handlers. Critical to debugging dogfooding sessions
 * without external services.
 */
/**
 * @vitest-environment jsdom
 */
import { describe, test, expect, beforeEach } from "vitest";
import {
  readErrorLog,
  writeErrorLog,
  logError,
  clearErrorLog,
} from "@/lib/error-log";

beforeEach(() => {
  clearErrorLog();
});

describe("error-log (A3)", () => {
  test("T1: empty initial state", () => {
    expect(readErrorLog()).toEqual([]);
  });

  test("T2: logError appends entry with auto id + occurredAt", () => {
    const entry = logError({
      source: "manual",
      message: "test failure",
      route: "/test",
    });
    expect(entry.id).toBeTruthy();
    expect(entry.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.message).toBe("test failure");

    const all = readErrorLog();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(entry.id);
  });

  test("T3: multiple entries preserved in order", () => {
    logError({ source: "manual", message: "first" });
    logError({ source: "manual", message: "second" });
    logError({ source: "manual", message: "third" });
    const all = readErrorLog();
    expect(all.map((e) => e.message)).toEqual(["first", "second", "third"]);
  });

  test("T4: MAX_ENTRIES trim (FIFO)", () => {
    // Write 110 entries, expect tail 100 to survive
    const bulk = Array.from({ length: 110 }, (_, i) => ({
      id: `bulk-${i}`,
      occurredAt: new Date().toISOString(),
      source: "manual" as const,
      message: `msg-${i}`,
    }));
    writeErrorLog(bulk);
    const all = readErrorLog();
    expect(all).toHaveLength(100);
    expect(all[0].message).toBe("msg-10"); // first 10 dropped
    expect(all[99].message).toBe("msg-109");
  });

  test("T5: clearErrorLog empties", () => {
    logError({ source: "manual", message: "x" });
    expect(readErrorLog()).toHaveLength(1);
    clearErrorLog();
    expect(readErrorLog()).toEqual([]);
  });

  test("T6: malformed storage falls back to []", () => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("oelp.error-log", "not json");
    }
    expect(readErrorLog()).toEqual([]);
  });

  test("T7: source enum carries through", () => {
    logError({ source: "boundary", message: "a" });
    logError({ source: "window", message: "b" });
    logError({ source: "manual", message: "c" });
    const sources = readErrorLog().map((e) => e.source);
    expect(sources).toEqual(["boundary", "window", "manual"]);
  });

  test("T8: optional fields (stack, componentStack, route) preserved", () => {
    logError({
      source: "boundary",
      message: "boom",
      stack: "Error: boom\n  at foo",
      componentStack: "    in Foo\n    in App",
      route: "/queue",
      userAgent: "test-agent/1.0",
    });
    const entry = readErrorLog()[0];
    expect(entry.stack).toContain("at foo");
    expect(entry.componentStack).toContain("in Foo");
    expect(entry.route).toBe("/queue");
    expect(entry.userAgent).toBe("test-agent/1.0");
  });
});
