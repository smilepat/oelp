"use client";

import { useState } from "react";
import { GrowthRadar } from "@/components/GrowthRadar";
import { DEMO_DIAGNOSTIC, type DiagnosticInput } from "@/lib/diagnostic";

export default function DiagnosePage() {
  const [result, setResult] = useState<DiagnosticInput | null>(null);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          F1 · Diagnose
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          진단 (Adaptive CAT)
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          vocab-cat-test (FastAPI, IRT 2PL/3PL) 백엔드 임베드 예정. 현재는 데모 데이터로
          5D Radar 컴포넌트 동작만 확인.
        </p>
      </header>

      <section className="flex gap-3">
        <button
          type="button"
          onClick={() => setResult(DEMO_DIAGNOSTIC)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
        >
          데모 진단 결과 로드
        </button>
        <button
          type="button"
          onClick={() => setResult(null)}
          className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          초기화
        </button>
      </section>

      {result ? (
        <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium text-zinc-950 dark:text-zinc-50">
              {result.studentName}
            </h2>
            <p className="text-xs text-zinc-500">
              Level {result.level} · CEFR {result.cefr} · θ {result.theta.toFixed(2)}
            </p>
          </div>
          <GrowthRadar before={result.dimensionScores} after={result.dimensionScores} />
          <div className="flex flex-col gap-1 text-xs text-zinc-500">
            <p>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Weak:</span>{" "}
              {result.weakDim.join(", ")}
            </p>
            <p>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Strong:</span>{" "}
              {result.strongDim.join(", ")}
            </p>
          </div>
        </section>
      ) : (
        <p className="text-sm text-zinc-500">
          진단 결과가 없습니다. 위 버튼으로 데모를 로드하거나 vocab-cat-test 백엔드와 연결.
        </p>
      )}
    </main>
  );
}
