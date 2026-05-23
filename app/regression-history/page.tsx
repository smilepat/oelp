import {
  getRegressionEvents,
  countByResult,
} from "@/lib/regression-history";
import { RegressionEventList } from "@/components/RegressionEventList";

export const metadata = {
  title: "Regression History — OELP",
  description: "C4.1 게이트 통과·롤백 이력 (auditable)",
};

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

      <RegressionEventList events={events} />

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
