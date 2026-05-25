"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  clearSessions,
  summarizeSessions,
  type SessionRecord,
} from "@/lib/session-store";
import {
  downloadCalibrationJSON,
  downloadFullSessionsJSON,
} from "@/lib/session-export";
import { ErrorLogPanel } from "@/components/ErrorLogPanel";
import { TrendPanel } from "@/components/TrendPanel";
import { PosteriorBalancePanel } from "@/components/PosteriorBalancePanel";
import { AnalyticsQueuePanel } from "@/components/AnalyticsQueuePanel";
import { PlateauWarningPanel } from "@/components/PlateauWarningPanel";
import { RetentionDashboard } from "@/components/RetentionDashboard";
import {
  getRegressionEvents,
  countByResult,
} from "@/lib/regression-history";

const SESSIONS_STORAGE_KEY = "oelp.sessions.default";

function subscribeSessions(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === SESSIONS_STORAGE_KEY) callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getSessionsSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSIONS_STORAGE_KEY);
}

function useStoredSessions(): SessionRecord[] {
  const raw = useSyncExternalStore(subscribeSessions, getSessionsSnapshot, () => null);
  return useMemo(() => {
    if (!raw) return [];
    try {
      const env = JSON.parse(raw);
      if (env.schemaVersion !== 1) return [];
      return Array.isArray(env.sessions) ? env.sessions : [];
    } catch {
      return [];
    }
  }, [raw]);
}

export default function SessionsPage() {
  const sessions = useStoredSessions();

  const summary = summarizeSessions(sessions);

  function handleExportCalibration() {
    downloadCalibrationJSON(sessions);
  }

  function handleExportFull() {
    downloadFullSessionsJSON(sessions);
  }

  function handleClear() {
    if (typeof window === "undefined") return;
    if (!window.confirm("모든 세션 기록을 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
    clearSessions();
    // localStorage.removeItem doesn't fire 'storage' event in same tab — dispatch synthetic.
    window.dispatchEvent(new StorageEvent("storage", { key: SESSIONS_STORAGE_KEY }));
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          Phase 1.5 · Dogfooding Sessions
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          세션 히스토리
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          완료된 큐 세션 + W8 정성 평가를 누적 저장. P-2 calibration 데이터 공급원.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="누적 세션" value={String(summary.total)} />
        <Stat label="평가 첨부" value={`${summary.withEvaluation} / ${summary.total}`} />
        <Stat
          label="평균 만족도"
          value={summary.averageSatisfaction != null ? `${summary.averageSatisfaction.toFixed(1)} / 5` : "—"}
        />
        <Stat
          label="다시 할 의향 (yes %)"
          value={summary.continueIntentionYesPct != null ? `${(summary.continueIntentionYesPct * 100).toFixed(0)}%` : "—"}
        />
      </section>

      {sessions.length > 0 && (
        <section className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportCalibration}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
          >
            Calibration JSON
          </button>
          <button
            type="button"
            onClick={handleExportFull}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            전체 세션 + 평가 export
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
          >
            모두 삭제
          </button>
        </section>
      )}

      {sessions.length === 0 ? (
        <section className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          아직 세션이 없습니다. <a className="underline" href="/queue">/queue</a>에서 첫 세션을 진행하세요.
        </section>
      ) : (
        <SessionList sessions={sessions} />
      )}

      <PosteriorBalancePanel />

      <AnalyticsQueuePanel />

      <TrendPanel sessions={sessions} />

      <PlateauWarningPanel sessions={sessions} />

      <RetentionDashboard sessions={sessions} />

      <CalibrationHistoryPanel />

      <ErrorLogPanel />

      <footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        <p>
          데이터 위치: <code>localStorage.oelp.sessions.default</code> · Calibration: 다운로드된 JSON을{" "}
          <code>scripts/calibrate.mjs --responses</code>에 입력
        </p>
      </footer>
    </main>
  );
}

function CalibrationHistoryPanel() {
  const events = getRegressionEvents();
  const counts = countByResult();
  const recent = events.slice(0, 3);

  return (
    <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          Calibration History (Safety Net Audit)
        </p>
        <a
          href="/regression-history"
          className="text-[10px] text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          전체 보기 → /regression-history
        </a>
      </header>
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          총 {events.length}건
        </span>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          PASS {counts.pass}
        </span>
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-900 dark:bg-rose-950 dark:text-rose-100">
          FAIL {counts.fail}
        </span>
      </div>
      <ul className="flex flex-col gap-1 text-xs">
        {recent.map((e) => (
          <li key={e.id} className="flex gap-2">
            <span
              className={
                e.result === "pass"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-rose-700 dark:text-rose-300"
              }
            >
              {e.result === "pass" ? "✓" : "✗"}
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              {new Date(e.occurredAt).toLocaleDateString()}
            </span>
            <span className="text-zinc-700 dark:text-zinc-300">{e.summary}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PAGE_SIZE = 10;

function SessionList({ sessions }: { sessions: SessionRecord[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const slice = sessions.slice(start, start + PAGE_SIZE);

  return (
    <section className="flex flex-col gap-3">
      {/* Mobile: card list. Desktop: table. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {slice.map((s, idx) => (
          <li
            key={s.sessionId}
            className="flex flex-col gap-1 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">#{start + idx + 1}</span>
              <time className="font-mono text-[10px] text-zinc-500">
                {new Date(s.endedAt).toLocaleString()}
              </time>
            </div>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              {s.targetQuestionType}
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                정답 {s.correct}/{s.total}
              </span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {s.algorithm}
              </span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                conf: {s.confidence}
              </span>
              {s.evaluation && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                  ★ {s.evaluation.overall_satisfaction}/5
                </span>
              )}
            </div>
            {s.evaluation?.notes && (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {s.evaluation.notes.length > 80
                  ? s.evaluation.notes.slice(0, 80) + "…"
                  : s.evaluation.notes}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500 dark:border-zinc-800">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">날짜</th>
              <th className="px-2 py-2">QT</th>
              <th className="px-2 py-2">algo</th>
              <th className="px-2 py-2">conf</th>
              <th className="px-2 py-2">정답</th>
              <th className="px-2 py-2">만족도</th>
              <th className="px-2 py-2">계속의향</th>
              <th className="px-2 py-2">메모</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((s, idx) => (
              <tr key={s.sessionId} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-2 py-2 text-zinc-500">{start + idx + 1}</td>
                <td className="px-2 py-2 font-mono text-xs">
                  {new Date(s.endedAt).toLocaleString()}
                </td>
                <td className="px-2 py-2">{s.targetQuestionType}</td>
                <td className="px-2 py-2 text-xs">{s.algorithm}</td>
                <td className="px-2 py-2 text-xs">{s.confidence}</td>
                <td className="px-2 py-2">{s.correct}/{s.total}</td>
                <td className="px-2 py-2">
                  {s.evaluation ? `${s.evaluation.overall_satisfaction}/5` : "—"}
                </td>
                <td className="px-2 py-2">
                  {s.evaluation ? s.evaluation.c3_3_continue_intention : "—"}
                </td>
                <td className="px-2 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                  {s.evaluation?.notes ? (
                    <span title={s.evaluation.notes}>
                      {s.evaluation.notes.length > 30
                        ? s.evaluation.notes.slice(0, 30) + "…"
                        : s.evaluation.notes}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="세션 페이지네이션"
          className="flex items-center justify-between gap-3 pt-1 text-xs"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            ← 이전
          </button>
          <span className="text-zinc-500">
            {start + 1}–{Math.min(start + PAGE_SIZE, sessions.length)} / {sessions.length}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            다음 →
          </button>
        </nav>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}
