/**
 * @vitest-environment jsdom
 *
 * Vitest — installGlobalErrorHandlers + downloadErrorLog (A7++ coverage push).
 *
 * error-log.ts had 46% coverage — main gap was global event handlers and
 * the download flow. This file simulates window error/unhandledrejection
 * events and stubs URL.createObjectURL for the download path.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  installGlobalErrorHandlers,
  readErrorLog,
  clearErrorLog,
  downloadErrorLog,
  writeErrorLog,
} from "@/lib/error-log";

beforeEach(() => {
  clearErrorLog();
  // Reset idempotency flag so each test can re-install
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__oelpErrorHandlersInstalled = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).__oelp;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("error-log global handlers (A7++)", () => {
  test("T1: installGlobalErrorHandlers exposes window.__oelp.errorLog", () => {
    installGlobalErrorHandlers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oelp = (window as any).__oelp;
    expect(oelp).toBeDefined();
    expect(typeof oelp.errorLog.read).toBe("function");
    expect(typeof oelp.errorLog.clear).toBe("function");
    expect(typeof oelp.errorLog.download).toBe("function");
  });

  test("T2: idempotent — second call no-op", () => {
    installGlobalErrorHandlers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = (window as any).__oelp;
    installGlobalErrorHandlers(); // should not double-register or replace
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const second = (window as any).__oelp;
    expect(second).toBe(first);
  });

  test("T3: window.error captures uncaught error", () => {
    installGlobalErrorHandlers();
    const event = new ErrorEvent("error", {
      message: "boom",
      error: new Error("boom-with-stack"),
    });
    window.dispatchEvent(event);
    const log = readErrorLog();
    expect(log.length).toBeGreaterThan(0);
    const entry = log[log.length - 1];
    expect(entry.source).toBe("window");
    expect(entry.message).toBe("boom");
  });

  test("T4: window.error fallback message when none provided", () => {
    installGlobalErrorHandlers();
    const event = new ErrorEvent("error", {});
    window.dispatchEvent(event);
    const log = readErrorLog();
    const entry = log[log.length - 1];
    expect(entry.message).toBe("uncaught error");
  });

  test("T5: unhandledrejection with Error reason", () => {
    installGlobalErrorHandlers();
    // Synthetic event — avoid using a real rejected Promise (would surface
    // as an actual unhandled rejection in test runner).
    const event = new Event("unhandledrejection");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event as any).reason = new Error("rejected");
    window.dispatchEvent(event);
    const log = readErrorLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[log.length - 1].source).toBe("window");
    expect(log[log.length - 1].message).toBe("rejected");
  });

  test("T6: unhandledrejection with string reason", () => {
    installGlobalErrorHandlers();
    const event = new Event("unhandledrejection");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event as any).reason = "string-rejection";
    window.dispatchEvent(event);
    const log = readErrorLog();
    expect(log[log.length - 1].message).toBe("string-rejection");
  });

  test("T7: unhandledrejection with no reason → fallback message", () => {
    installGlobalErrorHandlers();
    const event = new Event("unhandledrejection");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event as any).reason = undefined;
    window.dispatchEvent(event);
    const log = readErrorLog();
    expect(log[log.length - 1].message).toBe("unhandled promise rejection");
  });

  test("T7a: writeErrorLog quota-exceeded path drops oldest half + retries", () => {
    // 110 entries written; setItem throws "QuotaExceededError" on first call.
    // Then second setItem with half slice should succeed.
    const bulk = Array.from({ length: 110 }, (_, i) => ({
      id: `q-${i}`,
      occurredAt: new Date().toISOString(),
      source: "manual" as const,
      message: `m-${i}`,
    }));

    let setCallCount = 0;
    const realSetItem = Storage.prototype.setItem.bind(localStorage);
    const stub = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      setCallCount++;
      if (setCallCount === 1) {
        const err = new Error("QuotaExceededError") as Error & { name: string };
        err.name = "QuotaExceededError";
        throw err;
      }
      realSetItem(key, value);
    });

    // Trigger via writeErrorLog (imported from lib)
    writeErrorLog(bulk);

    // First call threw → second call written half MAX_ENTRIES = 50 entries
    expect(setCallCount).toBe(2);
    expect(readErrorLog().length).toBe(50);

    stub.mockRestore();
  });

  test("T7b: writeErrorLog second setItem also throws → silent give-up", () => {
    const bulk = Array.from({ length: 5 }, (_, i) => ({
      id: `s-${i}`,
      occurredAt: new Date().toISOString(),
      source: "manual" as const,
      message: `m-${i}`,
    }));

    const stub = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    // Should NOT throw despite both setItem calls failing
    expect(() => writeErrorLog(bulk)).not.toThrow();

    stub.mockRestore();
  });

  test("T8: downloadErrorLog triggers anchor click + revokes URL", () => {
    writeErrorLog([
      {
        id: "x",
        occurredAt: new Date().toISOString(),
        source: "manual",
        message: "test entry",
      },
    ]);

    const created: string[] = [];
    const revoked: string[] = [];
    // @ts-expect-error — jsdom URL stub
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:mock-${created.length}`;
      created.push(url);
      return url;
    });
    // @ts-expect-error — jsdom URL stub
    URL.revokeObjectURL = vi.fn((url: string) => revoked.push(url));

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadErrorLog();

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(revoked).toEqual(created);
  });
});
