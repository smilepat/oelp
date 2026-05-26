"use client";

import { useMemo } from "react";
import { detectPlateaus, type PlateauFlag } from "@/lib/plateau-detection";
import type { SessionRecord } from "@/lib/session-store";

interface Props {
  sessions: SessionRecord[];
}

const DIM_LABEL_KO: Record<string, string> = {
  D1_Form: "형태",
  D2_Meaning: "의미",
  D3_Context: "맥락",
  D4_Network: "관계망",
  D5_Usage: "사용",
};

/**
 * PlateauWarningPanel — v13 학습자 도착 시 즉시 활성.
 *
 * 4주+ 누적 sessions에서 dim score가 plateau (3 points 이하 variance)에
 * 빠진 경우 자동 감지 → UI 알림.
 *
 * D1_Form plateau가 발견되면 v10 finding (옵션 A' PR 후보)를 시각화.
 * 본인이 PR 진행 전 실 데이터로 가설 검증.
 *
 * 4 sessions 미만 → 안내 placeholder.
 * D1 plateau 발견 → 경고 (warn). 다른 dim plateau → 정보 (info).
 */
export function PlateauWarningPanel({ sessions }: Props) {
  const result = useMemo(() => detectPlateaus(sessions, 4, 3), [sessions]);

  return (
    <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          Dim Plateau Detection (v13)
        </p>
        <p className="text-[10px] text-zinc-500">
          ≥{result.minSessions} 세션 누적 시 자동 감지 · D1_Form은 v10 finding
        </p>
      </header>

      {result.sessionsAnalyzed < result.minSessions ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          누적 세션 {result.sessionsAnalyzed}/{result.minSessions} —
          <span className="ml-1 text-zinc-500">
            plateau 감지에 최소 {result.minSessions}개 세션 필요. 학습 진행하면 자동 활성화.
          </span>
        </p>
      ) : result.flags.length === 0 ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          ✓ {result.sessionsAnalyzed} 세션 누적 — plateau 미검출. 모든 dim 정상 진화 중.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {result.flags.map((f) => (
            <PlateauRow key={f.dim} flag={f} />
          ))}
          {result.hasD1Plateau && (
            <div className="mt-1 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              ⚠️ <strong>D1_Form plateau confirmed in real data</strong>. v10 simulation finding 실증됨 →
              옵션 A&apos; PR (TYPE-제목 weight + keyVariables 보강) 진행 권장. 시뮬 결과는{" "}
              <a
                href="https://github.com/smilepat/myprojects/blob/main/docs/02-design/d1-plateau-option-a-prime.md"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                d1-plateau-option-a-prime.md
              </a>
              .
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PlateauRow({ flag }: { flag: PlateauFlag }) {
  const isWarn = flag.severity === "warn";
  return (
    <div
      className={
        "flex flex-wrap items-baseline gap-2 rounded px-2 py-1.5 text-xs " +
        (isWarn
          ? "border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          : "border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300")
      }
    >
      <span className="font-medium">
        {isWarn ? "⚠️" : "ℹ️"} {DIM_LABEL_KO[flag.dim] ?? flag.dim} ({flag.dim})
      </span>
      <span className="text-[10px]">
        {flag.sessionsObserved}세션 · range {flag.rangePoints}p · mean {flag.meanScore}
      </span>
    </div>
  );
}
