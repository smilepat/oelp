"use client";

import { useMemo, useSyncExternalStore } from "react";
import { readEventQueue } from "@/lib/analytics-events";

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

interface DiagCompletedSummary {
  occurredAt: string;
  theta: number;
  se: number;
  cefr: string;
  level: number;
  totalItems: number;
  durationSec: number;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sampleSd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const sumSq = xs.reduce((a, b) => a + (b - m) ** 2, 0);
  return Math.sqrt(sumSq / (xs.length - 1));
}

/**
 * AdaptiveDiagnosticStats — past diagnostic history widget (A8).
 *
 * Pulls diag.completed events from the analytics queue and surfaces:
 *   - Run count
 *   - Latest theta + CEFR
 *   - Theta variance (C1.2 stability metric)
 *   - Avg items + duration
 *   - Sparkline of last N theta values
 *
 * Empty state: instructs the user to run an adaptive diagnostic first.
 * Useful for confirming θ stability before retake decisions.
 */
export function AdaptiveDiagnosticStats() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);

  const summaries = useMemo<DiagCompletedSummary[]>(() => {
    const entries = readEventQueue();
    const out: DiagCompletedSummary[] = [];
    for (const entry of entries) {
      if (entry.event.type !== "diag.completed") continue;
      const p = entry.event.properties;
      out.push({
        occurredAt: entry.occurredAt,
        theta: p.theta,
        se: p.se,
        cefr: p.cefr,
        level: p.level,
        totalItems: p.totalItems,
        durationSec: p.durationSec,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }, [raw]);

  const thetaList = summaries.map((s) => s.theta);
  const thetaMean = mean(thetaList);
  const thetaSd = sampleSd(thetaList);
  const stable = summaries.length >= 2 && thetaSd <= 0.3; // C1.2 KR1.1 (P90 ≤ 0.3)
  const latest = summaries[summaries.length - 1];

  return (
    <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          진단 통계 (vocab-cat-test history)
        </p>
        <p className="text-[10px] text-zinc-500">
          C1.2 stability KR: θ 편차 ≤ 0.3
        </p>
      </header>

      {summaries.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          아직 완료된 진단이 없습니다. 위 <strong>vocab-cat-test</strong> 위젯에서
          시작하면 자동 누적됩니다.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex flex-col gap-0.5">
              <p className="text-zinc-500">완료 횟수</p>
              <p className="text-xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                {summaries.length}
              </p>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-zinc-500">최근 θ</p>
              <p className="text-xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                {latest.theta.toFixed(2)}
              </p>
              <p className="text-[10px] text-zinc-500">
                CEFR {latest.cefr} · level {latest.level}
              </p>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-zinc-500">θ 평균</p>
              <p className="text-base font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                {thetaMean.toFixed(2)}
              </p>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-zinc-500">θ 편차 (SD)</p>
              <p
                className={`text-base font-medium tabular-nums ${
                  summaries.length < 2
                    ? "text-zinc-400"
                    : stable
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-rose-700 dark:text-rose-300"
                }`}
                title="≤ 0.3 = KR1.1 통과 (안정성)"
              >
                {summaries.length < 2 ? "—" : thetaSd.toFixed(2)}
              </p>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-zinc-500">평균 문항</p>
              <p className="text-base font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                {mean(summaries.map((s) => s.totalItems)).toFixed(0)}
              </p>
              <p className="text-[10px] text-zinc-500">KR1.2 ≤ 25</p>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-zinc-500">평균 소요</p>
              <p className="text-base font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                {Math.round(mean(summaries.map((s) => s.durationSec)))}s
              </p>
            </div>
          </div>

          {summaries.length >= 2 && (
            <ThetaSparkline summaries={summaries} />
          )}

          <details className="text-[10px] text-zinc-500">
            <summary className="cursor-pointer">최근 5개 진단 상세</summary>
            <table className="mt-2 w-full border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-1 py-1 text-left">날짜</th>
                  <th className="px-1 py-1 text-right">θ</th>
                  <th className="px-1 py-1 text-right">SE</th>
                  <th className="px-1 py-1 text-left">CEFR</th>
                  <th className="px-1 py-1 text-right">문항</th>
                  <th className="px-1 py-1 text-right">소요(s)</th>
                </tr>
              </thead>
              <tbody>
                {summaries.slice(-5).reverse().map((s, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="px-1 py-1 font-mono">
                      {new Date(s.occurredAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-1 py-1 text-right tabular-nums">
                      {s.theta.toFixed(2)}
                    </td>
                    <td className="px-1 py-1 text-right tabular-nums">
                      {s.se.toFixed(2)}
                    </td>
                    <td className="px-1 py-1">{s.cefr}</td>
                    <td className="px-1 py-1 text-right tabular-nums">
                      {s.totalItems}
                    </td>
                    <td className="px-1 py-1 text-right tabular-nums">
                      {s.durationSec}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

interface SparklineProps {
  summaries: DiagCompletedSummary[];
}

function ThetaSparkline({ summaries }: SparklineProps) {
  const width = 220;
  const height = 36;
  const padX = 4;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const thetas = summaries.map((s) => s.theta);
  // Theta typically -4..+4. Auto-scale to actual range for sparkline.
  const minT = Math.min(...thetas);
  const maxT = Math.max(...thetas);
  const span = maxT - minT || 1;
  const n = thetas.length;
  const pts = thetas
    .map((t, i) => {
      const x = padX + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
      const y = padY + innerH * (1 - (t - minT) / span);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="flex flex-col gap-1 rounded border border-zinc-200 p-2 dark:border-zinc-800">
      <p className="text-[10px] text-zinc-500">θ 추이 ({thetas.length} runs)</p>
      <div className="flex items-center gap-3">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`θ sparkline, ${thetas.length} diagnostics, min ${minT.toFixed(2)}, max ${maxT.toFixed(2)}`}
        >
          <polyline
            points={pts}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-600 dark:text-indigo-400"
          />
          {thetas.map((_, i) => {
            const x = padX + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
            const y = padY + innerH * (1 - (thetas[i] - minT) / span);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={1.8}
                className="fill-indigo-700 dark:fill-indigo-300"
              />
            );
          })}
        </svg>
        <p className="text-[10px] text-zinc-500">
          min <span className="font-mono">{minT.toFixed(2)}</span> · max{" "}
          <span className="font-mono">{maxT.toFixed(2)}</span>
        </p>
      </div>
    </div>
  );
}
