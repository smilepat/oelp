/**
 * Phase 2 P-1 W2 — Beta posterior persistence layer.
 *
 * Spec: smilepat/myprojects/docs/02-design/phase2-p1-recommendation-v2.md §4.1
 *
 * Storage:
 *   - localStorage key `oelp.posteriors.{userId}` (JSON)
 *   - Default userId = "default" (single-user dogfooding env)
 *   - Schema versioned with `schemaVersion` field for future migration
 *
 * Supabase sync (deferred):
 *   - Phase 1 dogfooding stays local-only
 *   - When NEXT_PUBLIC_SUPABASE_URL is set, syncPosteriors() will mirror
 *     events.queue.item_answered → posterior updates server-side
 *
 * Prior reseed:
 *   - On diagnostic change (new theta / weakDim), prior must adapt
 *   - Policy: blend (0.7 × old posterior mean + 0.3 × new prior mean) preserving sample count
 *   - Avoids hard reset which loses accumulated learner signal
 */

import type { VocabDimension } from "./diagnostic";
import { QUESTION_TYPES } from "./ontology";
import {
  initialPosteriors,
  priorFromDiagnostic,
  type BetaPosterior,
} from "./recommendation";

const STORAGE_KEY_PREFIX = "oelp.posteriors";
const SCHEMA_VERSION = 1;
const DEFAULT_USER_ID = "default";

interface StoredEnvelope {
  schemaVersion: number;
  userId: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Diagnostic fingerprint at time of last reseed (used to detect drift) */
  diagnosticFingerprint: string;
  posteriors: Record<string, BetaPosterior>;
}

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}.${userId}`;
}

/**
 * Stable fingerprint of dimension scores — used to detect when reseed is needed.
 * Quantizes each dim score to 5-unit buckets to avoid spurious drift detection.
 */
export function diagnosticFingerprint(
  scores: Partial<Record<VocabDimension, number>>
): string {
  const parts = (
    ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"] as VocabDimension[]
  ).map((d) => {
    const s = scores[d] ?? 0;
    return `${d}=${Math.round(s / 5) * 5}`;
  });
  return parts.join("|");
}

// ─── Load / save ────────────────────────────────────────────────────

export function loadPosteriors(
  scores: Partial<Record<VocabDimension, number>>,
  userId: string = DEFAULT_USER_ID
): Record<string, BetaPosterior> {
  if (typeof localStorage === "undefined") return initialPosteriors(scores);

  let envelope: StoredEnvelope | null = null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) envelope = JSON.parse(raw) as StoredEnvelope;
  } catch {
    /* corrupted → fall through to fresh prior */
  }

  if (!envelope || envelope.schemaVersion !== SCHEMA_VERSION) {
    return initialPosteriors(scores);
  }

  // Detect diagnostic drift and reseed if needed
  const currentFp = diagnosticFingerprint(scores);
  if (envelope.diagnosticFingerprint !== currentFp) {
    return reseedPosteriors(envelope.posteriors, scores);
  }

  // Ensure every QT has a posterior (handles future QT additions)
  const result: Record<string, BetaPosterior> = {};
  for (const qt of QUESTION_TYPES) {
    result[qt.id] = envelope.posteriors[qt.id] ?? priorFromDiagnostic(qt, scores);
  }
  return result;
}

export function savePosteriors(
  posteriors: Record<string, BetaPosterior>,
  scores: Partial<Record<VocabDimension, number>>,
  userId: string = DEFAULT_USER_ID
): void {
  if (typeof localStorage === "undefined") return;
  const envelope: StoredEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    userId,
    updatedAt: new Date().toISOString(),
    diagnosticFingerprint: diagnosticFingerprint(scores),
    posteriors,
  };
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(envelope));
  } catch {
    /* quota / private mode — silent */
  }
}

export function clearPosteriors(userId: string = DEFAULT_USER_ID): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* silent */
  }
}

// ─── Prior reseed (blend policy) ────────────────────────────────────

/**
 * When the diagnostic fingerprint changes, blend old posterior mean with new
 * prior mean rather than hard-reset.
 *
 * Blend weight: 0.7 × old + 0.3 × new prior. Sample count preserved so future
 * updates continue to converge.
 */
export function reseedPosteriors(
  oldPosteriors: Record<string, BetaPosterior>,
  newScores: Partial<Record<VocabDimension, number>>,
  blendOldWeight = 0.7
): Record<string, BetaPosterior> {
  const blendNewWeight = 1 - blendOldWeight;
  const result: Record<string, BetaPosterior> = {};

  for (const qt of QUESTION_TYPES) {
    const old = oldPosteriors[qt.id];
    const newPrior = priorFromDiagnostic(qt, newScores);

    if (!old) {
      result[qt.id] = newPrior;
      continue;
    }

    // Blended mean
    const oldMean = old.alpha / (old.alpha + old.beta);
    const newMean = newPrior.alpha / (newPrior.alpha + newPrior.beta);
    const blendedMean = blendOldWeight * oldMean + blendNewWeight * newMean;

    // Reduce effective sample size by blendNewWeight (new diagnostic = less certain)
    const oldStrength = old.alpha + old.beta;
    const newStrength = oldStrength * blendOldWeight + (newPrior.alpha + newPrior.beta) * blendNewWeight;

    result[qt.id] = {
      qtId: qt.id,
      alpha: blendedMean * newStrength,
      beta: (1 - blendedMean) * newStrength,
      samples: Math.floor(old.samples * blendOldWeight),
    };
  }
  return result;
}

// ─── Session integration ────────────────────────────────────────────

export interface SessionResponse {
  /** QuestionType the queue targeted */
  qtId: string;
  isCorrect: boolean;
  /** Optional — for analytics-events sync */
  itemId?: string;
  at?: string;
}

/**
 * Apply queue session responses to stored posteriors + persist.
 * Returns the updated map for in-memory use.
 */
export function persistSessionResponses(
  responses: SessionResponse[],
  scores: Partial<Record<VocabDimension, number>>,
  userId: string = DEFAULT_USER_ID
): Record<string, BetaPosterior> {
  const current = loadPosteriors(scores, userId);
  const next: Record<string, BetaPosterior> = { ...current };
  for (const r of responses) {
    const cur = next[r.qtId];
    if (!cur) continue;
    next[r.qtId] = {
      qtId: r.qtId,
      alpha: cur.alpha + (r.isCorrect ? 1 : 0),
      beta: cur.beta + (r.isCorrect ? 0 : 1),
      samples: cur.samples + 1,
    };
  }
  savePosteriors(next, scores, userId);
  return next;
}

// ─── Supabase sync stub (Phase 1.5+) ────────────────────────────────

/**
 * Placeholder for Supabase events sync. Currently no-op since dogfooding
 * environment doesn't have Supabase configured.
 *
 * When NEXT_PUBLIC_SUPABASE_URL is set, this will:
 *   1. Query events.queue.item_answered since `updatedAt`
 *   2. Convert each response → posterior update
 *   3. Merge into local + write back to localStorage
 */
export async function syncFromSupabase(
  _userId: string = DEFAULT_USER_ID
): Promise<{ synced: number; reason?: string }> {
  if (typeof process === "undefined" || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { synced: 0, reason: "NEXT_PUBLIC_SUPABASE_URL not configured" };
  }
  // TODO (P-1 W6): wire to @supabase/supabase-js
  return { synced: 0, reason: "not yet implemented (P-1 W6)" };
}
