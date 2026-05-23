"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  posteriorBalance,
  findExplorationTarget,
} from "@/lib/recommendation";
import { QUESTION_TYPES } from "@/lib/ontology";

const STORAGE_KEY = "oelp.posteriors.default";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function snapshot(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

/**
 * Posterior balance widget (Phase 2 P-1 W9).
 *
 * Surfaces the per-QT sample distribution. Low balance = some QTs starved.
 * Reads localStorage directly (no API call) — observed via useSyncExternalStore.
 *
 * Design: smilepat/myprojects docs/02-design/phase2-p1-recommendation-w9-exploration.md §4.2
 */
export function PosteriorBalancePanel() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);

  const { posteriorMap, balance, starvedQTs, explorationTarget } = useMemo(() => {
    if (!raw) {
      return { posteriorMap: null, balance: 0, starvedQTs: [] as string[], explorationTarget: null };
    }
    try {
      const env = JSON.parse(raw);
      if (env.schemaVersion !== 1) {
        return { posteriorMap: null, balance: 0, starvedQTs: [], explorationTarget: null };
      }
      const map = env.posteriors ?? {};
      const bal = posteriorBalance(map);
      const starved = QUESTION_TYPES.filter((qt) => (map[qt.id]?.samples ?? 0) === 0).map(
        (qt) => qt.name
      );
      const exp = findExplorationTarget(map);
      return { posteriorMap: map, balance: bal, starvedQTs: starved, explorationTarget: exp };
    } catch {
      return { posteriorMap: null, balance: 0, starvedQTs: [], explorationTarget: null };
    }
  }, [raw]);

  if (!posteriorMap) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          Posterior Balance (P-1 W9)
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          아직 학습 데이터 없음. <code>/queue</code>에서 첫 세션 진행 시 자동 채워짐.
        </p>
      </section>
    );
  }

  const totalSamples = Object.values(posteriorMap as Record<string, { samples: number }>).reduce(
    (s, p) => s + (p?.samples ?? 0),
    0
  );

  const stateLabel =
    balance >= 0.5
      ? { text: "well-balanced", color: "emerald" }
      : balance >= 0.1
      ? { text: "exploration recommended", color: "amber" }
      : { text: "starvation alert", color: "rose" };

  const colorClasses = {
    emerald: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
    rose: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
  };

  return (
    <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          Posterior Balance (P-1 W9)
        </p>
        <p className="text-[10px] text-zinc-500">
          학습 데이터의 QT 분포 균형 — 1.0 = 완벽 balanced
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <p className="text-zinc-500">balance score</p>
          <p className="text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
            {balance.toFixed(2)}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${colorClasses[stateLabel.color as keyof typeof colorClasses]}`}
        >
          {stateLabel.text}
        </span>
        <div className="ml-auto text-right text-[10px] text-zinc-500">
          <p>총 {totalSamples} samples</p>
          <p>{QUESTION_TYPES.length - starvedQTs.length} / {QUESTION_TYPES.length} QT covered</p>
        </div>
      </div>

      {starvedQTs.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-1 text-[11px]">
          <span className="text-zinc-500">starved (0 samples):</span>
          {starvedQTs.map((name) => (
            <span
              key={name}
              className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {explorationTarget && (
        <div className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          ▶ <span className="font-medium">{explorationTarget.questionType.name}</span>
          {" "}— {explorationTarget.samples} samples, info value{" "}
          {explorationTarget.informationValue.toFixed(4)}.{" "}
          <span className="text-amber-700 dark:text-amber-300">
            다음 큐의 alternate로 권장됨.
          </span>
        </div>
      )}

      <p className="text-[10px] text-zinc-500">
        ※ Design: <code>docs/02-design/phase2-p1-recommendation-w9-exploration.md</code>.
        localStorage 키 <code>oelp.posteriors.default</code> 구독.
      </p>
    </section>
  );
}
