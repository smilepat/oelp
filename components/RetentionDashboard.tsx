"use client";

import { useMemo } from "react";
import {
  analyzeRetention,
  type RetentionRisk,
} from "@/lib/retention-analysis";
import type { SessionRecord } from "@/lib/session-store";

interface Props {
  sessions: SessionRecord[];
}

const RISK_BADGE: Record<RetentionRisk, { color: string; label: string; emoji: string }> = {
  safe: {
    color: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
    label: "안전",
    emoji: "✓",
  },
  "single-break": {
    color: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100",
    label: "단발성 휴학",
    emoji: "⚪",
  },
  "repeated-cycle": {
    color: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
    label: "반복 cycle (위험)",
    emoji: "⚠️",
  },
};

/**
 * RetentionDashboard (v19) — 학습자 휴학/복귀 cycle 감지 UI.
 *
 * v18 finding (dogfood-14/15):
 *   - 단발성 휴학 8w까지 안전
 *   - 반복 cycle (2+ break) 치명적 (avg -57.3%)
 *
 * /sessions 9번째 자동 활성 surface.
 *
 * 빈 상태: 안내. 1+ 세션: gap 분석.
 * Significant gaps (≥ 3주) 명시 + risk 등급 + v18 권장 액션.
 */
export function RetentionDashboard({ sessions }: Props) {
  const result = useMemo(() => analyzeRetention(sessions), [sessions]);
  const badge = RISK_BADGE[result.risk];

  return (
    <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          Retention Dashboard (v19)
        </p>
        <p className="text-[10px] text-zinc-500">
          v18 dogfood-14/15 finding 기반 휴학 cycle 감지
        </p>
      </header>

      {result.sessionsAnalyzed === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          세션 기록 없음. 진단 → 학습 큐 시작 시 자동 활성화.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs ${badge.color}`}>
              {badge.emoji} {badge.label}
            </span>
            <span className="text-xs text-zinc-500">
              {result.sessionsAnalyzed} 세션 · {result.totalSpanDays}일 누적
            </span>
            {result.daysSinceLastSession !== null && result.daysSinceLastSession > 0 && (
              <span
                className={`text-xs ${
                  result.daysSinceLastSession >= 21
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-zinc-500"
                }`}
              >
                · 마지막 세션 {result.daysSinceLastSession}일 전
              </span>
            )}
          </div>

          {result.significantGaps.length > 0 && (
            <details className="text-xs text-zinc-600 dark:text-zinc-400">
              <summary className="cursor-pointer">
                ≥ 3주 휴학 {result.significantGaps.length}회 (최대 {result.maxGapWeeks}주)
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5 pl-3 text-[11px]">
                {result.significantGaps.map((g, i) => (
                  <li key={i} className="font-mono">
                    {new Date(g.startDate).toLocaleDateString("ko-KR")} →{" "}
                    {new Date(g.endDate).toLocaleDateString("ko-KR")}: {g.weeks}주
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p
            className={`rounded-md px-3 py-2 text-[11px] ${
              result.risk === "repeated-cycle"
                ? "bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100"
                : result.risk === "single-break"
                  ? "bg-yellow-50 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100"
                  : "bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            }`}
          >
            {result.recommendation}
          </p>

          {result.risk === "repeated-cycle" && (
            <p className="text-[10px] text-zinc-500">
              참고:{" "}
              <a
                href="https://github.com/smilepat/myprojects/blob/main/docs/01-plan/prd-oelp-mvp-phase2.md"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Phase 2 PRD R7 — 학습자 retention risk
              </a>
            </p>
          )}
        </>
      )}
    </section>
  );
}
