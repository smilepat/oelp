"use client";

import { useMemo } from "react";
import {
  analyzeTrend,
  DIMS,
  type DiagnosticSnapshot,
} from "@/lib/trend-analysis";
import type { SessionRecord } from "@/lib/session-store";

interface Props {
  sessions: SessionRecord[];
}

const DIM_LABEL_KO: Record<(typeof DIMS)[number], string> = {
  D1_Form: "형태",
  D2_Meaning: "의미",
  D3_Context: "맥락",
  D4_Network: "관계망",
  D5_Usage: "사용",
};

/**
 * C4.3 trend panel — surfaces per-dimension trend from session history.
 *
 * Each session contributes 1 snapshot (first response's dimensionScores
 * @ endedAt). Trend is computed by lib/trend-analysis.ts.
 *
 * Renders only if ≥ 4 sessions present. Below that, infrastructure ready
 * but data insufficient — shows a "더 누적 필요" placeholder.
 *
 * Scaffolded 2026-05-23. UI will be exercised meaningfully when external
 * learners accumulate ≥ 4 weeks of sessions (phase2-backlog-v2 §K5).
 */
export function TrendPanel({ sessions }: Props) {
  const snapshots = useMemo<DiagnosticSnapshot[]>(() => {
    return sessions
      .map((s) => {
        const first = s.responses[0];
        if (!first) return null;
        return {
          at: s.endedAt,
          learnerId: "self", // localStorage 단일 사용자 가정. Multi-learner는 Stage C.
          source: "session",
          dimensionScores: first.dimensionScores,
        };
      })
      .filter((s): s is DiagnosticSnapshot => s !== null);
  }, [sessions]);

  const minSessionsForTrend = 4;
  const ready = snapshots.length >= minSessionsForTrend;

  const result = useMemo(() => {
    if (!ready) return null;
    return analyzeTrend(snapshots, 4);
  }, [ready, snapshots]);

  return (
    <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          C4.3 Trend Analysis (4-window)
        </p>
        <p className="text-[10px] text-zinc-500">
          학습 누적 추이 — 분산 ↓ = 안정화 진행
        </p>
      </header>

      {!ready ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            누적 세션 {snapshots.length}/{minSessionsForTrend} —
            <span className="ml-1 text-zinc-500">
              trend 추출에 최소 {minSessionsForTrend}개 세션 필요. 학습 진행하면 자동 활성화.
            </span>
          </p>
          <p className="text-[10px] text-zinc-500">
            인프라 준비됨 (lib/trend-analysis.ts) — 외부 학습자 도착 시 cohort 단위 trend 측정 가능.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-xs">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {DIMS.map((d) => {
              const slope = result?.slopes[d] ?? null;
              const dir = result?.varianceDirection[d] ?? "insufficient";
              const dirColor =
                dir === "decreasing"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : dir === "increasing"
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-zinc-500";
              const slopeColor =
                slope === null
                  ? "text-zinc-400"
                  : slope > 1
                  ? "text-emerald-700 dark:text-emerald-300"
                  : slope < -1
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-zinc-700 dark:text-zinc-300";
              return (
                <div
                  key={d}
                  className="rounded border border-zinc-200 p-2 dark:border-zinc-800"
                >
                  <p className="font-medium text-zinc-700 dark:text-zinc-300">
                    {DIM_LABEL_KO[d]}
                  </p>
                  <p className={`text-[11px] ${slopeColor}`}>
                    slope:{" "}
                    {slope === null
                      ? "—"
                      : slope > 0
                      ? `+${slope.toFixed(1)}`
                      : slope.toFixed(1)}
                  </p>
                  <p className={`text-[10px] ${dirColor}`}>
                    var: {dir ?? "?"}
                  </p>
                </div>
              );
            })}
          </div>
          <details className="text-[10px] text-zinc-500">
            <summary className="cursor-pointer">윈도우 상세 ({result?.windows.length}/4)</summary>
            <table className="mt-2 w-full border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-1 py-1 text-left">#</th>
                  <th className="px-1 py-1 text-left">기간</th>
                  <th className="px-1 py-1 text-right">샘플</th>
                  {DIMS.map((d) => (
                    <th key={d} className="px-1 py-1 text-right">
                      {DIM_LABEL_KO[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result?.windows.map((w, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="px-1 py-1">{i + 1}</td>
                    <td className="px-1 py-1 font-mono">
                      {new Date(w.from).toLocaleDateString()}–
                      {new Date(w.to).toLocaleDateString()}
                    </td>
                    <td className="px-1 py-1 text-right">{w.count}</td>
                    {DIMS.map((d) => (
                      <td key={d} className="px-1 py-1 text-right">
                        {w.mean[d] === null ? "—" : (w.mean[d] as number).toFixed(0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </section>
  );
}
