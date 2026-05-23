/**
 * Regression history — auditable record of C4.1 gate events.
 *
 * Source: lib/regression-history.json (curated by promote-weights.mjs results
 * + dogfooding-pass-{1,2}.md analysis docs). Updated manually after each
 * promote attempt — gate decisions are too important to derive automatically
 * from filesystem state that could be lost.
 *
 * Consumed by /regression-history route.
 */
import data from "./regression-history.json";

export type RegressionResult = "pass" | "fail";
export type RegressionKind = "initial" | "manual-calibration" | "auto-promote";

export interface RegressionEvent {
  id: string;
  occurredAt: string;
  kind: RegressionKind;
  result: RegressionResult;
  version?: string;
  previousVersion?: string;
  trigger: string;
  tau: number;
  contradictions: number;
  changedQTs?: string[];
  attemptedChanges?: string[];
  summary: string;
  lesson: string;
  reportPath?: string;
  note?: string;
}

const events = data.events as RegressionEvent[];

export function getRegressionEvents(): RegressionEvent[] {
  return [...events].sort((a, b) =>
    new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );
}

export function countByResult(): { pass: number; fail: number } {
  return events.reduce(
    (acc, e) => ({
      pass: acc.pass + (e.result === "pass" ? 1 : 0),
      fail: acc.fail + (e.result === "fail" ? 1 : 0),
    }),
    { pass: 0, fail: 0 }
  );
}
