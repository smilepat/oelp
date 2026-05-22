export default function MapPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          F2 · Ontology Map
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          마이크로스킬 의존성 그래프
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          10 QuestionType + 21 keyVariables + 7 DistractorType 노드를 Cytoscape.js로 렌더 예정.
          현재는 placeholder.
        </p>
      </header>

      <section className="rounded-lg border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Cytoscape.js 그래프 — W6-8 마일스톤
      </section>
    </main>
  );
}
