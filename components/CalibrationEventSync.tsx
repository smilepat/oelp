"use client";

import { useEffect, useState } from "react";
import {
  logEvent,
  readEventQueue,
  type CalibrationAttemptedEvent,
} from "@/lib/analytics-events";
import type { RegressionEvent } from "@/lib/regression-history";

interface Props {
  events: RegressionEvent[];
}

/**
 * CalibrationEventSync — surfaces regression-history events as
 * `calibration.attempted` analytics events.
 *
 * Idempotent: on mount, scans the analytics queue and emits one event
 * per regression-history record that doesn't yet have a corresponding
 * queue entry (matched by version). Manual re-sync button for ops.
 *
 * Why: closes the last unwired analytics event type. When Supabase
 * config lands, the queue will already contain the full audit trail.
 *
 * NOT a calibration trigger — calibration is run by scripts/calibrate.mjs.
 * This widget only mirrors the audit log into the client event stream.
 */
export function CalibrationEventSync({ events }: Props) {
  const [synced, setSynced] = useState<number | null>(null);
  const [total, setTotal] = useState<number>(events.length);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const result = syncMissingEvents(events);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSynced(result.added);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTotal(events.length);
  }, [events]);

  function handleResync() {
    // Force-sync regardless of existing queue entries (re-emits all).
    for (const e of events) emitCalibrationEvent(e);
    setSynced(events.length);
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 text-xs dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-zinc-700 dark:text-zinc-300">
          Analytics queue 동기화 (`calibration.attempted` 이벤트)
        </p>
        {synced !== null && (
          <p className="text-[10px] text-zinc-500">
            {synced > 0
              ? `${synced}건 신규 동기화 / 총 ${total}건`
              : `이미 모두 동기화 (총 ${total}건)`}
          </p>
        )}
      </div>
      <p className="text-[10px] text-zinc-500">
        regression-history JSON의 모든 calibration 시도를 client analytics
        queue로 미러링. Supabase config 도착 시 Stage B 인프라가 자동 sync 시작.
      </p>
      <button
        type="button"
        onClick={handleResync}
        className="self-start rounded-md border border-zinc-300 px-2 py-1 text-[10px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        강제 재동기화 (모든 event 재발화)
      </button>
    </section>
  );
}

function emitCalibrationEvent(e: RegressionEvent) {
  const event: CalibrationAttemptedEvent = {
    type: "calibration.attempted",
    properties: {
      version: e.version ?? e.id,
      tau: e.tau ?? 0,
      contradictions: e.contradictions ?? 0,
      result: e.result,
      trigger: e.trigger,
      changedQTs: "changedQTs" in e ? (e as { changedQTs: string[] }).changedQTs : undefined,
    },
  };
  logEvent(event);
}

interface SyncResult {
  added: number;
  alreadyPresent: number;
}

export function syncMissingEvents(events: RegressionEvent[]): SyncResult {
  const queue = readEventQueue();
  const existingVersions = new Set<string>();
  for (const entry of queue) {
    if (entry.event.type === "calibration.attempted") {
      existingVersions.add(entry.event.properties.version);
    }
  }
  let added = 0;
  let alreadyPresent = 0;
  for (const e of events) {
    const key = e.version ?? e.id;
    if (existingVersions.has(key)) {
      alreadyPresent++;
      continue;
    }
    emitCalibrationEvent(e);
    added++;
  }
  return { added, alreadyPresent };
}
