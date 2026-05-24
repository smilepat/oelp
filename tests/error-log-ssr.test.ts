/**
 * @vitest-environment node
 *
 * Vitest — error-log SSR-safety branches (coverage push to 100%).
 *
 * The lib has `typeof localStorage === "undefined"` / `typeof document ===
 * "undefined"` / `typeof window === "undefined"` guards that the jsdom test
 * file cannot reach (jsdom provides all of these). This file runs in node
 * env (no DOM globals) to exercise the early-return paths.
 */
import { describe, test, expect } from "vitest";
import {
  readErrorLog,
  writeErrorLog,
  clearErrorLog,
  downloadErrorLog,
  installGlobalErrorHandlers,
} from "@/lib/error-log";

describe("error-log SSR safety (no DOM globals)", () => {
  test("readErrorLog returns [] when localStorage absent", () => {
    expect(typeof localStorage).toBe("undefined");
    expect(readErrorLog()).toEqual([]);
  });

  test("writeErrorLog no-op when localStorage absent", () => {
    expect(() =>
      writeErrorLog([
        {
          id: "ssr",
          occurredAt: new Date().toISOString(),
          source: "manual",
          message: "from-ssr",
        },
      ])
    ).not.toThrow();
  });

  test("clearErrorLog no-op when localStorage absent", () => {
    expect(() => clearErrorLog()).not.toThrow();
  });

  test("downloadErrorLog no-op when document absent", () => {
    expect(typeof document).toBe("undefined");
    expect(() => downloadErrorLog()).not.toThrow();
  });

  test("installGlobalErrorHandlers no-op when window absent", () => {
    expect(typeof window).toBe("undefined");
    expect(() => installGlobalErrorHandlers()).not.toThrow();
  });
});
