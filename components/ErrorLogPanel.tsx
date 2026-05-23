"use client";

import { useSyncExternalStore } from "react";
import {
  readErrorLog,
  clearErrorLog,
  downloadErrorLog,
  type ErrorEntry,
} from "@/lib/error-log";

const ERROR_LOG_KEY = "oelp.error-log";

function subscribeErrorLog(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === ERROR_LOG_KEY) callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getErrorLogSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ERROR_LOG_KEY);
}

/**
 * Compact panel for /sessions — shows error log count + actions.
 * Empty state encouraged: "오류 없음" is the desired display.
 */
export function ErrorLogPanel() {
  const raw = useSyncExternalStore(subscribeErrorLog, getErrorLogSnapshot, () => null);
  const entries: ErrorEntry[] = (() => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  function handleClear() {
    if (typeof window === "undefined") return;
    if (!window.confirm("에러 로그를 모두 삭제하시겠습니까?")) return;
    clearErrorLog();
    window.dispatchEvent(new StorageEvent("storage", { key: ERROR_LOG_KEY }));
  }

  const byKind = entries.reduce((acc, e) => {
    acc[e.source] = (acc[e.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const latest = entries[entries.length - 1];

  return (
    <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          Client Error Log (A3)
        </p>
        <p className="text-[10px] text-zinc-500">
          localStorage 영구 · MAX 100 (FIFO) · 외부 전송 없음
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          ✓ 오류 없음 — 최근 세션 모두 정상 작동
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-900 dark:bg-rose-950 dark:text-rose-100">
              총 {entries.length}건
            </span>
            {Object.entries(byKind).map(([src, n]) => (
              <span
                key={src}
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {src}: {n}
              </span>
            ))}
          </div>
          {latest && (
            <div className="rounded bg-zinc-50 p-2 text-[11px] font-mono text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              <p className="truncate" title={latest.message}>
                최근: [{latest.source}] {latest.message}
              </p>
              <p className="text-zinc-500">
                {new Date(latest.occurredAt).toLocaleString()}
                {latest.route ? ` · ${latest.route}` : ""}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadErrorLog}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              JSON 다운로드
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            >
              로그 비우기
            </button>
          </div>
        </>
      )}
    </section>
  );
}
