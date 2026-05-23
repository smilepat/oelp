import {
  getRegressionEvents,
  countByResult,
  type RegressionEvent,
} from "@/lib/regression-history";

export const metadata = {
  title: "Regression History — OELP",
  description: "C4.1 게이트 통과·롤백 이력 (auditable)",
};

function ResultBadge({ result }: { result: RegressionEvent["result"] }) {
  if (result === "pass") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        ✓ PASS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-200">
      ✗ FAIL · rollback
    </span>
  );
}

function KindLabel({ kind }: { kind: RegressionEvent["kind"] }) {
  const map: Record<RegressionEvent["kind"], string> = {
    "initial": "초기 휴리스틱",
    "manual-calibration": "수동 calibration",
    "auto-promote": "auto-promote (calibrate.mjs)",
  };
  return <span className="text-xs text-zinc-500">{map[kind]}</span>;
}

export default function RegressionHistoryPage() {
  const events = getRegressionEvents();
  const counts = countByResult();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          Safety Net · Audit
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Regression History
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          C4.1 도메인 모순 게이트의 모든 통과·실패 사례. 가중치 변경 시도가
          어떻게 검증되고 거부되는지 추적합니다.{" "}
          <span className="text-zinc-500">
            (source: <code>lib/regression-history.json</code>)
          </span>
        </p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Total events</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {events.length}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Pass (promoted)
          </p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900 dark:text-emerald-100">
            {counts.pass}
          </p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50/30 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300">
            Fail (rolled back)
          </p>
          <p className="mt-1 text-2xl font-semibold text-rose-900 dark:text-rose-100">
            {counts.fail}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        {events.map((e) => (
          <article
            key={e.id}
            className={`flex flex-col gap-3 rounded-lg border p-5 ${
              e.result === "pass"
                ? "border-emerald-200 dark:border-emerald-900"
                : "border-rose-200 dark:border-rose-900"
            }`}
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <ResultBadge result={e.result} />
                <KindLabel kind={e.kind} />
                {e.version && (
                  <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {e.version}
                  </code>
                )}
              </div>
              <time className="text-xs text-zinc-500" dateTime={e.occurredAt}>
                {new Date(e.occurredAt).toLocaleString("ko-KR")}
              </time>
            </header>

            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div>
                <p className="uppercase tracking-wider text-zinc-500">τ (Kendall)</p>
                <p className="text-base font-medium text-zinc-950 dark:text-zinc-50">
                  {e.tau.toFixed(2)}
                </p>
                <p className="text-zinc-500">gate: ≥ 0.40</p>
              </div>
              <div>
                <p className="uppercase tracking-wider text-zinc-500">Contradictions</p>
                <p className="text-base font-medium text-zinc-950 dark:text-zinc-50">
                  {e.contradictions}
                </p>
                <p className="text-zinc-500">gate: ≤ 0</p>
              </div>
              <div className="col-span-2 sm:col-span-2">
                <p className="uppercase tracking-wider text-zinc-500">Trigger</p>
                <p className="leading-snug text-zinc-700 dark:text-zinc-300">{e.trigger}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <p className="leading-6 text-zinc-800 dark:text-zinc-200">{e.summary}</p>
              {(e.changedQTs || e.attemptedChanges) && (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="text-zinc-500">
                    {e.result === "pass" ? "Promoted QTs:" : "Attempted QTs:"}
                  </span>
                  {(e.changedQTs ?? e.attemptedChanges ?? []).map((qt) => (
                    <code
                      key={qt}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                    >
                      {qt}
                    </code>
                  ))}
                </div>
              )}
            </div>

            <footer className="flex flex-col gap-1 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-900">
              <p className="text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Lesson: </span>
                {e.lesson}
              </p>
              {e.note && (
                <p className="text-zinc-500">
                  <span className="font-medium">Note: </span>
                  {e.note}
                </p>
              )}
              {e.reportPath && (
                <p>
                  <a
                    href={`https://github.com/smilepat/myprojects/blob/main/${e.reportPath}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    상세 보고서: {e.reportPath}
                  </a>
                </p>
              )}
            </footer>
          </article>
        ))}
      </section>

      <footer className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">
          이 페이지가 존재하는 이유
        </p>
        <p className="mt-1 leading-5">
          OELP는 calibration에 자동으로 가중치를 맞춰가는 시스템입니다. 하지만
          calibration 결과가 도메인 지식과 모순되면 자동 롤백합니다. 통과 사례와
          실패 사례를 동등하게 가시화함으로써, &ldquo;학습 시스템이 늘 옳지는 않으며
          이를 잡아내는 게이트가 있다&rdquo; 는 사실을 audit 가능한 형태로 유지합니다.
        </p>
      </footer>
    </main>
  );
}
