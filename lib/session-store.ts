/**
 * Phase 1.5 — Session history persistence.
 *
 * Spec: docs/02-design/phase1-5-bridge-dogfooding.md
 *
 * Stores completed queue sessions (per-card responses + optional qualitative
 * evaluation) in localStorage. Enables:
 *   1. W8 dogfooding accumulation (no more "starts from scratch every refresh")
 *   2. P-2 calibration data supply (via lib/session-export.ts)
 *   3. C2.1/C3.3 qualitative scores in-app
 */

import type { BetaPosterior } from "./recommendation";
import type { VocabDimension } from "./diagnostic";

const STORAGE_KEY_PREFIX = "oelp.sessions";
const SCHEMA_VERSION = 1;
const DEFAULT_USER_ID = "default";

export interface SessionResponseRecord {
  itemId: string;
  qtId: string;
  isCorrect: boolean;
  /** Dimension scores in effect at the time (for calibration export) */
  dimensionScores: Partial<Record<VocabDimension, number>>;
  at: string;
}

export interface SessionEvaluation {
  /** C1.2 — diagnostic weakDim 직관 일치도 (1-5) */
  c1_2_diagnostic_consistency: number;
  /** C2.1 — Map weakness 도메인 납득도 (1-5) */
  c2_1_map_acceptance: number;
  /** C2.3 — 노드 detail 직관성 (1-5) */
  c2_3_node_intuition: number;
  /** C3.3 — "다시 할 의향" */
  c3_3_continue_intention: "yes" | "no";
  /** 종합 만족도 (1-5) */
  overall_satisfaction: number;
  /** 자유 메모 */
  notes: string;
}

export interface SessionRecord {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  targetQuestionType: string;
  algorithm: "rule-v1-fallback" | "thompson-v2";
  confidence: "low" | "mid" | "high";
  alternateQuestionType: string;
  correct: number;
  total: number;
  advancements: number;
  boxAfter: Record<string, number>;
  posteriorAfter: BetaPosterior;
  responses: SessionResponseRecord[];
  evaluation?: SessionEvaluation;
}

interface StoredEnvelope {
  schemaVersion: number;
  userId: string;
  updatedAt: string;
  sessions: SessionRecord[];
}

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}.${userId}`;
}

export function loadSessions(userId: string = DEFAULT_USER_ID): SessionRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const env = JSON.parse(raw) as StoredEnvelope;
    if (env.schemaVersion !== SCHEMA_VERSION) return [];
    return Array.isArray(env.sessions) ? env.sessions : [];
  } catch {
    return [];
  }
}

export function saveSession(record: SessionRecord, userId: string = DEFAULT_USER_ID): void {
  if (typeof localStorage === "undefined") return;
  const existing = loadSessions(userId);
  const envelope: StoredEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    userId,
    updatedAt: new Date().toISOString(),
    sessions: [...existing, record],
  };
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(envelope));
  } catch {
    /* quota — silent */
  }
}

export function clearSessions(userId: string = DEFAULT_USER_ID): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* silent */
  }
}

/** Aggregate stats for /sessions dashboard. */
export interface SessionsSummary {
  total: number;
  withEvaluation: number;
  averageSatisfaction: number | null;
  continueIntentionYesPct: number | null;
  lastSessionAt: string | null;
}

export function summarizeSessions(sessions: SessionRecord[]): SessionsSummary {
  const total = sessions.length;
  const evaluated = sessions.filter((s) => s.evaluation);
  const avgSat =
    evaluated.length > 0
      ? evaluated.reduce((sum, s) => sum + (s.evaluation?.overall_satisfaction ?? 0), 0) /
        evaluated.length
      : null;
  const yesCount = evaluated.filter((s) => s.evaluation?.c3_3_continue_intention === "yes").length;
  const yesPct = evaluated.length > 0 ? yesCount / evaluated.length : null;
  const lastSessionAt =
    sessions.length > 0 ? sessions[sessions.length - 1].endedAt : null;
  return {
    total,
    withEvaluation: evaluated.length,
    averageSatisfaction: avgSat,
    continueIntentionYesPct: yesPct,
    lastSessionAt,
  };
}
