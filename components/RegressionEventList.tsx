"use client";

import { useMemo, useState } from "react";
import type { RegressionEvent } from "@/lib/regression-history";

function downloadEvents(events: RegressionEvent[]) {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const payload = {
    exportedAt: new Date().toISOString(),
    source: "smilepat/oelp lib/regression-history.json",
    count: events.length,
    events,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oelp-regression-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface Props {
  events: RegressionEvent[];
}

type ResultFilter = "all" | "pass" | "fail";
type KindFilter = "all" | "initial" | "manual-calibration" | "auto-promote";

function ResultBadge({ result }: { result: RegressionEvent["result"] }) {
  if (result === "pass") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        ✓ PASS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-200">
      ✗ FAIL · rollback
    </span>
  );
}

function KindLabel({ kind }: { kind: RegressionEvent["kind"] }) {
  const map: Record<RegressionEvent["kind"], string> = {
    "initial": "초기 휴리스틱",
    "manual-calibration": "수동 calibration",
    "auto-promote": "auto-promote (calibrate.mjs)",
  };
  return <span className="text-xs text-zinc-500">{map[kind]}</span>;
}

/**
 * Client-side filter UI for regression events.
 *
 * Search matches: id / summary / lesson / trigger / version / changedQTs / attemptedChanges.
 * Filters: result (pass/fail/all) + kind (initial/manual/auto).
 * Empty result state encouraged.
 */
export function RegressionEventList({ events }: Props) {
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (resultFilter !== "all" && e.result !== resultFilter) return false;
      if (kindFilter !== "all" && e.kind !== kindFilter) return false;
      if (!q) return true;
      const haystack = [
        e.id,
        e.summary,
        e.lesson,
        e.trigger,
        e.version ?? "",
        ...(e.changedQTs ?? []),
        ...(e.attemptedChanges ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [events, query, resultFilter, kindFilter]);

  const hasActiveFilter = query.trim() !== "" || resultFilter !== "all" || kindFilter !== "all";

  return (
    <>
      <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Filters · Export</p>
          <p className="text-[10px] text-zinc-500">
            {filtered.length} / {events.length} events 표시
          </p>
        </header>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="id / 요약 / lesson / QT 검색"
            aria-label="이벤트 검색"
            className="flex-1 rounded-md border border-zinc-200 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-800"
          />
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value as ResultFilter)}
            aria-label="결과 필터"
            className="rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-xs dark:border-zinc-800"
          >
            <option value="all">결과: 전체</option>
            <option value="pass">PASS만</option>
            <option value="fail">FAIL만</option>
          </select>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            aria-label="종류 필터"
            className="rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-xs dark:border-zinc-800"
          >
            <option value="all">종류: 전체</option>
            <option value="initial">초기</option>
            <option value="manual-calibration">수동</option>
            <option value="auto-promote">auto-promote</option>
          </select>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResultFilter("all");
                setKindFilter("all");
              }}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              초기화
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-900">
          <button
            type="button"
            onClick={() => downloadEvents(filtered)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            title="현재 필터 결과만 JSON으로 다운로드"
          >
            JSON 다운로드 ({filtered.length})
          </button>
          <button
            type="button"
            onClick={() => downloadEvents(events)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            title="필터 무시, 전체 이벤트 다운로드"
          >
            전체 다운로드 ({events.length})
          </button>
          <span className="text-[10px] text-zinc-500 self-center">
            audit 외부 공유 / 백업용. localStorage 영향 없음.
          </span>
        </div>
      </section>

      {filtered.length === 0 ? (
        <section className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          필터 결과 없음. 검색어 또는 필터를 조정하세요.
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          {filtered.map((e) => (
            <article
              key={e.id}
              className={`flex flex-col gap-3 rounded-lg border p-5 ${
                e.result === "pass"
                  ? "border-emerald-200 dark:border-emerald-900"
                  : "border-rose-200 dark:border-rose-900"
              }`}
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <ResultBadge result={e.result} />
                  <KindLabel kind={e.kind} />
                  {e.version && (
                    <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {e.version}
                    </code>
                  )}
                </div>
                <time className="text-xs text-zinc-500" dateTime={e.occurredAt}>
                  {new Date(e.occurredAt).toLocaleString("ko-KR")}
                </time>
              </header>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="uppercase tracking-wider text-zinc-500">τ (Kendall)</p>
                  <p className="text-base font-medium text-zinc-950 dark:text-zinc-50">
                    {e.tau.toFixed(2)}
                  </p>
                  <p className="text-zinc-500">gate: ≥ 0.40</p>
                </div>
                <div>
                  <p className="uppercase tracking-wider text-zinc-500">Contradictions</p>
                  <p className="text-base font-medium text-zinc-950 dark:text-zinc-50">
                    {e.contradictions}
                  </p>
                  <p className="text-zinc-500">gate: ≤ 0</p>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <p className="uppercase tracking-wider text-zinc-500">Trigger</p>
                  <p className="leading-snug text-zinc-700 dark:text-zinc-300">{e.trigger}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <p className="leading-6 text-zinc-800 dark:text-zinc-200">{e.summary}</p>
                {(e.changedQTs || e.attemptedChanges) && (
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="text-zinc-500">
                      {e.result === "pass" ? "Promoted QTs:" : "Attempted QTs:"}
                    </span>
                    {(e.changedQTs ?? e.attemptedChanges ?? []).map((qt) => (
                      <code
                        key={qt}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      >
                        {qt}
                      </code>
                    ))}
                  </div>
                )}
              </div>
              <footer className="flex flex-col gap-1 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-900">
                <p className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Lesson: </span>
                  {e.lesson}
                </p>
                {e.note && (
                  <p className="text-zinc-500">
                    <span className="font-medium">Note: </span>
                    {e.note}
                  </p>
                )}
                {e.reportPath && (
                  <p>
                    <a
                      href={`https://github.com/smilepat/myprojects/blob/main/${e.reportPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                      상세 보고서: {e.reportPath}
                    </a>
                  </p>
                )}
              </footer>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
