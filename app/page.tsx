import Link from "next/link";

const FEATURES = [
  {
    href: "/diagnose",
    title: "F1. 진단 (Diagnose)",
    body: "IRT 2PL/3PL 적응형 어휘 진단. vocab-cat-test 백엔드 임베드 + 5D Radar.",
    status: "scaffold",
  },
  {
    href: "/map",
    title: "F2. Ontology Map",
    body: "10 QuestionType + 21 keyVariables + 7 DistractorType (Cytoscape.js).",
    status: "scaffold",
  },
  {
    href: "/queue",
    title: "F3. 학습 큐 (Learning Queue)",
    body: "약점 QuestionType 기반 룰엔진 + Leitner 5-Box SR.",
    status: "scaffold",
  },
  {
    href: "/sessions",
    title: "Sessions. 히스토리 (P-1.5)",
    body: "완료된 세션 + W8 평가 누적. Calibration JSON 내보내기.",
    status: "phase 1.5",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          OELP · Phase 1 MVP
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-zinc-950 dark:text-zinc-50">
          Ontology English Learning Platform
        </h1>
        <p className="max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          LogicFlow 생태계의 분산 자산(vocabulary-db, csat-graphdb-318, csat-text-master,
          vocab-cat-test, vocab-learn-pat)을 단일 학습 경험으로 통합하는 Next.js 16 앱.
          현재는 스캐폴드 상태 — 각 기능은 placeholder.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        {FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group flex flex-col gap-1 rounded-lg border border-zinc-200 px-5 py-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-zinc-950 dark:text-zinc-50">
                {f.title}
              </h2>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                {f.status}
              </span>
            </div>
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {f.body}
            </p>
          </Link>
        ))}
      </section>

      <footer className="border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800">
        <p>
          PRD:{" "}
          <a
            className="underline"
            href="https://github.com/smilepat/myprojects/blob/main/docs/01-plan/prd-oelp-mvp-phase1.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            docs/01-plan/prd-oelp-mvp-phase1.md
          </a>
        </p>
      </footer>
    </main>
  );
}
