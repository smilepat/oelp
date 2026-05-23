/**
 * Client-side error log — Sentry-light replacement (T4.3 / Stage A3).
 *
 * Purpose: capture runtime errors + boundary catches into localStorage so
 * that dogfooding sessions can be debugged after the fact without external
 * services. Solo-dev friendly: no API key, no quota.
 *
 * Limits: at most MAX_ENTRIES (100). Older entries dropped FIFO. Rationale:
 * localStorage quota is 5-10MB depending on browser, but we only need a
 * recent debugging window.
 *
 * Exposes a global window.__oelp.errorLog for dev console inspection.
 */

export interface ErrorEntry {
  id: string;
  occurredAt: string;
  source: "boundary" | "window" | "manual";
  message: string;
  stack?: string;
  componentStack?: string;
  route?: string;
  userAgent?: string;
}

const STORAGE_KEY = "oelp.error-log";
const MAX_ENTRIES = 100;

function nowId() {
  // Random short id — sufficient for in-session disambiguation
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

export function readErrorLog(): ErrorEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ErrorEntry[]) : [];
  } catch {
    return [];
  }
}

export function writeErrorLog(entries: ErrorEntry[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    const trimmed = entries.slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota exceeded — drop oldest half and retry once
    try {
      const half = entries.slice(-Math.floor(MAX_ENTRIES / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(half));
    } catch {
      // give up silently
    }
  }
}

export function logError(
  partial: Omit<ErrorEntry, "id" | "occurredAt">
): ErrorEntry {
  const entry: ErrorEntry = {
    id: nowId(),
    occurredAt: new Date().toISOString(),
    ...partial,
  };
  const existing = readErrorLog();
  writeErrorLog([...existing, entry]);
  if (typeof console !== "undefined") {
    // Surface to dev console so it's not invisible
    console.warn("[oelp.error-log]", entry.source, entry.message);
  }
  return entry;
}

export function clearErrorLog(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function downloadErrorLog(): void {
  if (typeof document === "undefined") return;
  const entries = readErrorLog();
  const blob = new Blob([JSON.stringify(entries, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oelp-error-log-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Install global window handlers. Idempotent — safe to call multiple times.
 * Called from RootLayout via ErrorBoundary effect.
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__oelpErrorHandlersInstalled) return;
  w.__oelpErrorHandlersInstalled = true;

  window.addEventListener("error", (e) => {
    logError({
      source: "window",
      message: e.message || "uncaught error",
      stack: e.error?.stack,
      route: window.location.pathname,
      userAgent: navigator.userAgent,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    logError({
      source: "window",
      message:
        typeof reason === "string"
          ? reason
          : reason?.message ?? "unhandled promise rejection",
      stack: reason?.stack,
      route: window.location.pathname,
      userAgent: navigator.userAgent,
    });
  });

  // dev console handle
  w.__oelp = w.__oelp ?? {};
  w.__oelp.errorLog = {
    read: readErrorLog,
    clear: clearErrorLog,
    download: downloadErrorLog,
  };
}
