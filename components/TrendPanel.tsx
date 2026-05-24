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

interface SessionAccuracyPoint {
  idx: number;
  endedAt: string;
  accuracy: number; // 0-1
  total: number;
  qtId: string;
}

/** Linear regression slope over y[i] vs i (0..n-1). null if n<2. */
function linearSlope(ys: number[]): number | null {
  if (ys.length < 2) return null;
  const n = ys.length;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (ys[i] - yMean);
    den += (i - xMean) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

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

  // Session-level accuracy trend (varies session-over-session unlike static
  // dimensionScores). Activates earlier — needs ≥ 2 sessions.
  const accuracyPoints = useMemo<SessionAccuracyPoint[]>(() => {
    return sessions
      .filter((s) => s.total > 0)
      .map((s, i) => ({
        idx: i + 1,
        endedAt: s.endedAt,
        accuracy: s.correct / s.total,
        total: s.total,
        qtId: s.targetQuestionType,
      }));
  }, [sessions]);

  const accuracySlope = useMemo(
    () => linearSlope(accuracyPoints.map((p) => p.accuracy)),
    [accuracyPoints]
  );
  const minAccuracySessions = 2;
  const accuracyReady = accuracyPoints.length >= minAccuracySessions;

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

      {accuracyReady && (
        <SessionAccuracyTrend points={accuracyPoints} slope={accuracySlope} />
      )}

      {!ready ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            5D dimension trend: 누적 세션 {snapshots.length}/{minSessionsForTrend} —
            <span className="ml-1 text-zinc-500">
              4-window trend는 최소 {minSessionsForTrend}개 세션 필요 (재진단 시 dimensionScores 변동).
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

interface SessionAccuracyTrendProps {
  points: SessionAccuracyPoint[];
  slope: number | null;
}

function SessionAccuracyTrend({ points, slope }: SessionAccuracyTrendProps) {
  // Build a tiny inline SVG sparkline. Plain SVG = no Chart.js dependency
  // for this widget (TrendPanel stays light, no client-only chart hydration).
  const width = 220;
  const height = 36;
  const padX = 4;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const n = points.length;
  const pts = points
    .map((p, i) => {
      const x = padX + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
      const y = padY + innerH * (1 - p.accuracy);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const latest = points[points.length - 1];
  const slopeLabel =
    slope === null
      ? "—"
      : slope > 0.01
      ? `▲ +${(slope * 100).toFixed(1)}%/세션`
      : slope < -0.01
      ? `▼ ${(slope * 100).toFixed(1)}%/세션`
      : `→ flat`;
  const slopeColor =
    slope === null
      ? "text-zinc-500"
      : slope > 0.01
      ? "text-emerald-700 dark:text-emerald-300"
      : slope < -0.01
      ? "text-rose-700 dark:text-rose-300"
      : "text-zinc-500";

  return (
    <div className="flex flex-col gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          세션 누적 정답률 ({points.length} 세션)
        </p>
        <p className={`text-[11px] ${slopeColor}`} title="linear regression slope per session (accuracy units, -1..+1)">
          {slopeLabel}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`세션 정답률 sparkline, ${points.length} sessions, latest ${(latest.accuracy * 100).toFixed(0)}%`}
        >
          <line
            x1={padX}
            x2={width - padX}
            y1={padY + innerH * 0.5}
            y2={padY + innerH * 0.5}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeDasharray="2,2"
          />
          <polyline
            points={pts}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-sky-600 dark:text-sky-400"
          />
          {points.map((p, i) => {
            const x = padX + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
            const y = padY + innerH * (1 - p.accuracy);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={1.8}
                className="fill-sky-700 dark:fill-sky-300"
              />
            );
          })}
        </svg>
        <div className="flex flex-col text-[10px] text-zinc-500">
          <span>
            최근: <span className="font-mono">{(latest.accuracy * 100).toFixed(0)}%</span> ({latest.qtId})
          </span>
          <span>
            최소: <span className="font-mono">
              {(Math.min(...points.map((p) => p.accuracy)) * 100).toFixed(0)}%
            </span>
            · 최대: <span className="font-mono">
              {(Math.max(...points.map((p) => p.accuracy)) * 100).toFixed(0)}%
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
