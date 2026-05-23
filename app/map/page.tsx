"use client";

import { useState } from "react";
import { OntologyMap } from "@/components/OntologyMap";
import { QUESTION_TYPES, DISTRACTOR_TYPES } from "@/lib/ontology";
import { DEMO_DIAGNOSTIC } from "@/lib/diagnostic";
import { compareWeights } from "@/lib/kv-dim-mapping";

export default function MapPage() {
  const [useDemo, setUseDemo] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scores = useDemo ? DEMO_DIAGNOSTIC.dimensionScores : undefined;

  const selectedQt = selectedId ? QUESTION_TYPES.find((q) => q.id === selectedId) : null;
  const selectedDist = selectedId
    ? DISTRACTOR_TYPES.find((d) => d.id === selectedId)
    : null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          F2 · Ontology Map
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          마이크로스킬 의존성 그래프
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          10 QuestionType (round) + 21 keyVariables (•) + 7 DistractorType (◆).
          진단 점수 로드 시 QuestionType 노드가 약점(빨강) ~ 강점(녹색)으로 색상화 —
          dimension-mapping.md §2.2 역추정 공식.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setUseDemo((v) => !v)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
        >
          {useDemo ? "약점 색상 끄기" : "데모 진단 로드 (약점 색상)"}
        </button>
        {useDemo && (
          <p className="text-xs text-zinc-500">
            weak: {DEMO_DIAGNOSTIC.weakDim.join(", ")} · strong:{" "}
            {DEMO_DIAGNOSTIC.strongDim.join(", ")}
          </p>
        )}
      </section>

      <div className="block sm:hidden">
        <OntologyMap scores={scores} onNodeClick={setSelectedId} height={360} />
      </div>
      <div className="hidden sm:block">
        <OntologyMap scores={scores} onNodeClick={setSelectedId} height={560} />
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <DetailPanel
          title="선택된 QuestionType"
          empty="QuestionType 노드를 클릭하세요."
        >
          {selectedQt ? (
            <div className="flex flex-col gap-2 text-sm">
              <p>
                <span className="font-medium">{selectedQt.name}</span> · 번호{" "}
                {selectedQt.numberRange} · 배점 {selectedQt.pointValue}
              </p>
              <div className="flex flex-wrap gap-1">
                {selectedQt.keyVariables.map((kv) => (
                  <span
                    key={kv}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {kv}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex flex-col gap-1.5 text-xs">
                <div className="flex items-baseline justify-between text-zinc-500">
                  <span className="uppercase tracking-wider">5D weights</span>
                  <span className="text-[10px]">declared vs derived (C4.1)</span>
                </div>
                {compareWeights(selectedQt.weights, selectedQt.keyVariables).map((row) => {
                  const dec = row.declared * 100;
                  const der = row.derived * 100;
                  return (
                    <div key={row.dim} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-zinc-600 dark:text-zinc-400">
                        {row.dim.replace("_", " ")}
                      </span>
                      <div className="flex flex-1 flex-col gap-0.5">
                        <div className="flex h-1.5 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
                          <div
                            className="bg-zinc-700 dark:bg-zinc-300"
                            style={{ width: `${dec}%` }}
                            title={`declared ${dec.toFixed(0)}%`}
                          />
                        </div>
                        <div className="flex h-1.5 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
                          <div
                            className="bg-indigo-500 dark:bg-indigo-400"
                            style={{ width: `${der}%` }}
                            title={`derived ${der.toFixed(0)}%`}
                          />
                        </div>
                      </div>
                      <span className="w-20 shrink-0 text-right tabular-nums text-[10px] text-zinc-500">
                        {dec.toFixed(0)} / {der.toFixed(0)}
                      </span>
                      {row.contradiction && (
                        <span
                          className="rounded bg-rose-100 px-1 text-[9px] text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          title={
                            row.contradiction === "declared-over"
                              ? "도메인 keyVariables 증거 없음 (derived = 0%) 인데 declared ≥ 20%"
                              : "도메인 keyVariables 증거 있음 (derived ≥ 20%) 인데 declared < 5%"
                          }
                        >
                          {row.contradiction === "declared-over" ? "over" : "under"}
                        </span>
                      )}
                    </div>
                  );
                })}
                <p className="mt-1 text-[10px] text-zinc-500">
                  ▣ declared (ontology-weights.json) · ◆ derived (keyVariables × C4.1 매핑)
                </p>
              </div>
            </div>
          ) : null}
        </DetailPanel>

        <DetailPanel
          title="선택된 DistractorType"
          empty="DistractorType 노드(◆)를 클릭하세요."
        >
          {selectedDist ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium">{selectedDist.name}</p>
              <p className="text-zinc-600 dark:text-zinc-400">
                {selectedDist.description}
              </p>
              <p className="text-xs text-zinc-500">
                trap: {selectedDist.trapMechanism}
              </p>
            </div>
          ) : null}
        </DetailPanel>
      </section>
    </main>
  );
}

function DetailPanel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{title}</p>
      {children ?? <p className="text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>}
    </div>
  );
}
