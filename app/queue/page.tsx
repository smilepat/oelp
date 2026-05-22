export default function QueuePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          F3 · Learning Queue
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          학습 큐
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          약점 QuestionType 1개 → 어휘 10개(IRT b 매칭) + 지문 1개. Leitner 5-Box SR.
          현재는 placeholder.
        </p>
      </header>

      <section className="rounded-lg border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
        룰엔진 + Leitner SR — W9-10 마일스톤
      </section>
    </main>
  );
}
