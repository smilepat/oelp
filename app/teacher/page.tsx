"use client";

import { useMemo, useState } from "react";
import { MOCK_LEARNERS } from "@/lib/teacher-mock-learners";
import {
  computeSkillClassRows,
  computeLayerClassRows,
  topClassWeaknesses,
  type LearnerInput,
} from "@/lib/teacher-aggregate";
import { SkillHeatmap } from "@/components/SkillHeatmap";

const LAYER_COLORS: Record<string, string> = {
  V: "#fde68a",
  S: "#bae6fd",
  D: "#c7d2fe",
  R: "#fbcfe8",
  A: "#bbf7d0",
};

export default function TeacherPage() {
  // Real cohort wiring is gated behind "external learner channel ≥3 users".
  // Until then mock mode is the only path; the toggle is left visible so the
  // operator can flip when real data is available.
  const [mockMode, setMockMode] = useState(true);

  const learners: LearnerInput[] = useMemo(
    () =>
      mockMode
        ? MOCK_LEARNERS.map((l) => ({ id: l.id, label: l.label, scores: l.scores }))
        : [],
    [mockMode]
  );

  const skillRows = useMemo(() => computeSkillClassRows(learners), [learners]);
  const layerRows = useMemo(() => computeLayerClassRows(learners), [learners]);
  const topWeak = useMemo(() => topClassWeaknesses(learners, 5), [learners]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          F3 · Teacher Dashboard (PR-3.7 skeleton)
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          반 단위 역량 분포
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          P→V→S→D→R→A 33 skill을 학습자별로 집계 + 약점 우선순위. 외부 학습자 채널 ≥3명 확보
          전까지는 mock 모드로 5명 합성 프로필 표시.
        </p>
      </header>

      <section
        className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950"
        aria-label="데이터 소스 토글"
      >
        <button
          type="button"
          onClick={() => setMockMode((v) => !v)}
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100"
        >
          {mockMode ? "Mock mode 끄기 (실 데이터)" : "Mock mode 켜기"}
        </button>
        <span className="text-amber-800 dark:text-amber-200">
          {mockMode
            ? "5명 합성 프로필 (low_voc / weak_struct / low_disc / balanced / advanced)"
            : "실 데이터 wiring 미구현 — multi-user session storage 필요"}
        </span>
      </section>

      {learners.length === 0 ? (
        <section className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          학습자 데이터가 없습니다. Mock mode를 켜거나 외부 학습자 채널을 활성화하세요.
        </section>
      ) : (
        <>
          <section
            className="grid gap-3 sm:grid-cols-5"
            aria-label="레이어별 반 평균"
          >
            {layerRows.map((row) => (
              <div
                key={row.layer}
                className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <header className="mb-2 flex items-baseline justify-between">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                    style={{ backgroundColor: LAYER_COLORS[row.layer] }}
                  >
                    {row.layer}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {row.measuredLearners}/{learners.length} 학습자
                  </span>
                </header>
                <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {row.classMean === null ? "—" : row.classMean.toFixed(0)}
                </p>
                <p className="text-[10px] text-zinc-500">
                  min {row.classMin === null ? "—" : row.classMin.toFixed(0)} · max{" "}
                  {row.classMax === null ? "—" : row.classMax.toFixed(0)}
                </p>
              </div>
            ))}
          </section>

          <section aria-label="반 단위 약점 top 5">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              반 평균이 가장 낮은 역량 (top {topWeak.length})
            </h2>
            <ol className="space-y-1 text-xs">
              {topWeak.map((r, i) => (
                <li
                  key={r.skill.id}
                  className="flex items-center gap-3 rounded-md border border-zinc-200 px-3 py-1.5 dark:border-zinc-800"
                >
                  <span className="font-mono tabular-nums text-zinc-500">{i + 1}.</span>
                  <span
                    className="rounded px-1 py-0.5 text-[10px] font-semibold uppercase"
                    style={{ backgroundColor: LAYER_COLORS[r.skill.layer] }}
                  >
                    {r.skill.layer}
                  </span>
                  <span className="font-mono">{r.skill.id}</span>
                  <span className="flex-1 text-zinc-700 dark:text-zinc-300">{r.skill.name}</span>
                  <span className="font-mono tabular-nums text-rose-700 dark:text-rose-300">
                    {(r.classMean as number).toFixed(0)} 평균
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <SkillHeatmap rows={skillRows} learners={learners} />
          </section>
        </>
      )}

      <footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        <p>
          데이터 소스: mock = lib/teacher-mock-learners.ts · 실 데이터 wiring은 multi-user
          session storage 활성화 후 lib/teacher-aggregate.ts에 connector 추가 예정.
        </p>
      </footer>
    </main>
  );
}
