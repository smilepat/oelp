"use client";

import { useMemo } from "react";
import type { SessionRecord } from "@/lib/session-store";
import {
  aggregateErrorCategories,
  type ErrorCategory,
} from "@/lib/error-pattern-analyzer";

const CATEGORY_LABEL: Record<ErrorCategory, string> = {
  vocab_unknown: "vocab_unknown · 어휘",
  structure_misread: "structure_misread · 문장",
  anaphora_lost: "anaphora_lost · 지시어",
  discourse_drift: "discourse_drift · 흐름",
  distractor_trap: "distractor_trap · 함정",
};

const CATEGORY_COLOR: Record<ErrorCategory, string> = {
  vocab_unknown: "#fde68a",
  structure_misread: "#bae6fd",
  anaphora_lost: "#c7d2fe",
  discourse_drift: "#fbcfe8",
  distractor_trap: "#fbbf24",
};

interface Props {
  sessions: SessionRecord[];
}

/**
 * PR-7c — categorical bar of wrong-answer reasons across all stored
 * sessions. Renders only when at least one wrong answer is present;
 * otherwise shows a placeholder. Uses inline SVG so we keep the
 * Chart.js bundle limited to GrowthRadar / SkillMasteryRadar only.
 */
export function ErrorCategoryChart({ sessions }: Props) {
  const counts = useMemo(() => {
    const inputs = sessions.flatMap((s) =>
      s.responses
        .filter((r) => !r.isCorrect)
        .map((r) => ({
          qtId: r.qtId,
          dimensionScores: r.dimensionScores,
          // Use optional distractorPicked when present so the classifier
          // can hit its high-confidence override path (PR-7 + follow-up).
          distractorPicked: r.distractorPicked,
        }))
    );
    return aggregateErrorCategories(inputs);
  }, [sessions]);

  const total = (Object.values(counts) as number[]).reduce((s, v) => s + v, 0);

  if (total === 0) {
    return (
      <section
        className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        aria-label="오답 분류"
      >
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          오답 카테고리 분포 (PR-7)
        </h3>
        <p className="mt-2 text-xs text-zinc-500">
          오답 데이터가 없습니다. 진단 또는 큐 세션을 완료하면 분류가 표시됩니다.
        </p>
      </section>
    );
  }

  const rows: { category: ErrorCategory; count: number; pct: number }[] = (
    Object.keys(counts) as ErrorCategory[]
  )
    .map((c) => ({
      category: c,
      count: counts[c],
      pct: total > 0 ? (counts[c] / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      aria-label="오답 분류 차트"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          오답 카테고리 분포 (PR-7)
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          총 {total}건 · {sessions.length} 세션
        </span>
      </header>
      <ul className="space-y-2" role="list">
        {rows.map((r) => (
          <li key={r.category}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-mono text-zinc-700 dark:text-zinc-300">
                {CATEGORY_LABEL[r.category]}
              </span>
              <span className="tabular-nums text-zinc-500">
                {r.count} · {r.pct.toFixed(0)}%
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900"
              role="img"
              aria-label={`${r.category}: ${r.count}건, ${r.pct.toFixed(0)}퍼센트`}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${r.pct}%`,
                  backgroundColor: CATEGORY_COLOR[r.category],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] text-zinc-500">
        rule-based MVP — distractor 선택 정보가 없어 mastery 기반 추정.
        실 데이터 누적 시 PR-9 LLM 비교 예정.
      </p>
    </section>
  );
}
