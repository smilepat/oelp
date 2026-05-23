"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  readEventQueue,
  clearEventQueue,
  downloadEventQueue,
  type AnalyticsEventType,
} from "@/lib/analytics-events";

const QUEUE_KEY = "oelp.analytics.queue";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === QUEUE_KEY) callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function snapshot(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(QUEUE_KEY);
}

/**
 * Analytics queue monitor (development + audit).
 *
 * Surfaces localStorage event queue stats — type distribution, sessionId
 * count, recent entries. Useful for dogfooding to confirm events fire.
 *
 * Supabase config 도착 시: 이 widget이 "X events pending sync" 표시 +
 * 즉시 flush 버튼으로 진화 예정 (Phase 2 Stage C).
 */
export function AnalyticsQueuePanel() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);

  const stats = useMemo(() => {
    const entries = readEventQueue();
    const total = entries.length;
    const byType: Partial<Record<AnalyticsEventType, number>> = {};
    const sessionIds = new Set<string>();
    let oldest = "";
    let newest = "";
    for (const entry of entries) {
      const t = entry.event.type;
      byType[t] = (byType[t] ?? 0) + 1;
      sessionIds.add(entry.sessionId);
      if (!oldest || entry.occurredAt < oldest) oldest = entry.occurredAt;
      if (!newest || entry.occurredAt > newest) newest = entry.occurredAt;
    }
    return { total, byType, sessionCount: sessionIds.size, oldest, newest };
    // raw dependency triggers re-compute on localStorage change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  function handleClear() {
    if (typeof window === "undefined") return;
    if (!window.confirm("Analytics 큐를 모두 삭제하시겠습니까?")) return;
    clearEventQueue();
    window.dispatchEvent(new StorageEvent("storage", { key: QUEUE_KEY }));
  }

  const byTypeEntries = Object.entries(stats.byType).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

  return (
    <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          Analytics Event Queue
        </p>
        <p className="text-[10px] text-zinc-500">
          localStorage 누적 · Supabase config 시 자동 sync
        </p>
      </header>

      {stats.total === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          아직 이벤트 없음. <code>/diagnose</code> · <code>/queue</code> · <code>/map</code> 사용 시 자동 누적.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <p className="text-zinc-500">총 이벤트</p>
              <p className="text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                {stats.total}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-zinc-500">세션</p>
              <p className="text-base font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                {stats.sessionCount}
              </p>
            </div>
            <div className="ml-auto text-right text-[10px] text-zinc-500">
              {stats.oldest && (
                <>
                  <p>{new Date(stats.oldest).toLocaleString("ko-KR")}</p>
                  <p>~ {new Date(stats.newest).toLocaleString("ko-KR")}</p>
                </>
              )}
            </div>
          </div>

          <ul className="flex flex-wrap gap-1.5 text-[11px]">
            {byTypeEntries.map(([t, n]) => (
              <li
                key={t}
                className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <code>{t}</code>: {n}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadEventQueue}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              JSON 다운로드
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            >
              큐 비우기
            </button>
          </div>
        </>
      )}
    </section>
  );
}
