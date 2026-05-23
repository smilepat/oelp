/**
 * Analytics event types + emit helper.
 *
 * Mirrors smilepat/myprojects docs/01-plan/analytics-events.md schema.
 * Currently a no-op when NEXT_PUBLIC_SUPABASE_URL is unset — events stay
 * in localStorage queue for future replay. Live transport activates when
 * Supabase config arrives (Stage C activation).
 *
 * Why this exists:
 *   - Define event payload contracts in TS so call sites can't drift
 *   - Provide single logEvent() entry point for future Supabase wiring
 *   - Maintain localStorage replay queue for dogfooding-3 style analysis
 */

import type { VocabDimension } from "./diagnostic";

// ─── Event payload types (mirror analytics-events.md §3) ────────────────

export interface AuthSignedUpEvent {
  type: "auth.signed_up" | "auth.signed_in";
  properties: {
    provider?: "email" | "google" | "github";
  };
}

export interface DiagStartedEvent {
  type: "diag.started";
  properties: {
    source: "vocab-cat-test" | "preset" | "paste-import";
    presetId?: "alpha" | "beta" | "gamma" | "delta";
  };
}

export interface DiagItemAnsweredEvent {
  type: "diag.item_answered";
  properties: {
    itemId: number;
    isCorrect: boolean;
    responseTimeMs: number;
    currentTheta: number;
    currentSe: number;
  };
}

export interface DiagCompletedEvent {
  type: "diag.completed";
  properties: {
    theta: number;
    se: number;
    cefr: string;
    level: number;
    dimensionScores: Partial<Record<VocabDimension, number>>;
    weakDim: VocabDimension[];
    strongDim: VocabDimension[];
    totalItems: number;
    durationSec: number;
  };
}

export interface MapViewedEvent {
  type: "map.viewed";
  properties: {
    hasDiagnostic: boolean;
  };
}

export interface MapNodeClickedEvent {
  type: "map.node_clicked";
  properties: {
    nodeId: string;
    nodeType: "questionType" | "keyVariable" | "distractor";
  };
}

export interface QueueStartedEvent {
  type: "queue.started";
  properties: {
    targetQT: string;
    algorithm: "rule-v1-fallback" | "thompson-v2";
    confidence: "low" | "mid" | "high";
    generator: string;
    /** Phase 2 P-1 W9 — was exploration target used? */
    selectionMode?: "primary" | "exploration";
  };
}

export interface QueueItemAnsweredEvent {
  type: "queue.item_answered";
  properties: {
    itemId: string;
    qtId: string;
    isCorrect: boolean;
    responseTimeMs: number;
    sessionPos: number; // 1-10
  };
}

export interface QueueCompletedEvent {
  type: "queue.completed";
  properties: {
    qtId: string;
    correct: number;
    total: number;
    advancements: number;
    durationSec: number;
    /** Phase 2 P-1 W9 — posteriorBalance after session */
    balanceAfter?: number;
  };
}

/**
 * Phase 2 W9 addition — calibration attempt outcome.
 * Mirrors regression-history.json events for cross-reference.
 */
export interface CalibrationAttemptedEvent {
  type: "calibration.attempted";
  properties: {
    version: string;
    tau: number;
    contradictions: number;
    result: "pass" | "fail";
    trigger: string;
    changedQTs?: string[];
  };
}

export type AnalyticsEvent =
  | AuthSignedUpEvent
  | DiagStartedEvent
  | DiagItemAnsweredEvent
  | DiagCompletedEvent
  | MapViewedEvent
  | MapNodeClickedEvent
  | QueueStartedEvent
  | QueueItemAnsweredEvent
  | QueueCompletedEvent
  | CalibrationAttemptedEvent;

export type AnalyticsEventType = AnalyticsEvent["type"];

const EVENT_TYPES_ALL: AnalyticsEventType[] = [
  "auth.signed_up",
  "auth.signed_in",
  "diag.started",
  "diag.item_answered",
  "diag.completed",
  "map.viewed",
  "map.node_clicked",
  "queue.started",
  "queue.item_answered",
  "queue.completed",
  "calibration.attempted",
];

export function isKnownEventType(t: string): t is AnalyticsEventType {
  return (EVENT_TYPES_ALL as string[]).includes(t);
}

// ─── localStorage replay queue ──────────────────────────────────────────

export interface StoredEvent {
  occurredAt: string;
  sessionId: string;
  appVersion?: string;
  event: AnalyticsEvent;
}

const QUEUE_KEY = "oelp.analytics.queue";
const MAX_QUEUE = 1000;

function readQueue(): StoredEvent[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(entries: StoredEvent[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    const trimmed = entries.slice(-MAX_QUEUE);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota — drop half and retry
    try {
      const half = entries.slice(-Math.floor(MAX_QUEUE / 2));
      localStorage.setItem(QUEUE_KEY, JSON.stringify(half));
    } catch {
      // give up
    }
  }
}

export function readEventQueue(): StoredEvent[] {
  return readQueue();
}

export function clearEventQueue(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(QUEUE_KEY);
}

// ─── Log event ─────────────────────────────────────────────────────────

const SESSION_KEY = "oelp.analytics.sessionId";

function getOrCreateSessionId(): string {
  if (typeof localStorage === "undefined") return "ssr";
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

/**
 * Reset session id (e.g. on inactivity or logout).
 * Phase 2: tie this to 25-min inactivity timer (analytics-events.md §5).
 */
export function resetAnalyticsSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Log an event. Currently writes to localStorage queue.
 * When NEXT_PUBLIC_SUPABASE_URL is set, also POSTs to Supabase (future work).
 *
 * Failsafe: errors swallowed silently — analytics never breaks UX.
 */
export function logEvent(event: AnalyticsEvent): void {
  try {
    const entry: StoredEvent = {
      occurredAt: new Date().toISOString(),
      sessionId: getOrCreateSessionId(),
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
      event,
    };
    const queue = readQueue();
    queue.push(entry);
    writeQueue(queue);
    // TODO (Phase 2 Stage C): POST to Supabase events table when configured
  } catch {
    // swallow
  }
}

/**
 * Download the queue for offline analysis (mirrors session-export pattern).
 */
export function downloadEventQueue(): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const entries = readQueue();
  const blob = new Blob([JSON.stringify(entries, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oelp-analytics-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
