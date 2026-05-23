"use client";

import { useState } from "react";
import { OntologyMap } from "@/components/OntologyMap";
import { QUESTION_TYPES, DISTRACTOR_TYPES } from "@/lib/ontology";
import { DEMO_DIAGNOSTIC } from "@/lib/diagnostic";

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
              <ul className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                {(Object.keys(selectedQt.weights) as Array<keyof typeof selectedQt.weights>).map(
                  (d) => (
                    <li key={d}>
                      {d.replace("_", " ")} : {(selectedQt.weights[d] * 100).toFixed(0)}%
                    </li>
                  )
                )}
              </ul>
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
