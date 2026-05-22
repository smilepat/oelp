/**
 * Leitner 5-Box spaced repetition.
 *
 * Ported from smilepat/vocab-learn-pat/src/lib/spaced-repetition.ts.
 * Storage key namespaced to `oelp.sr.box` so OELP and vocab-learn-pat can
 * coexist on the same localStorage without collision.
 *
 * Intervals (days): Box1=1, Box2=2, Box3=4, Box4=7, Box5=14.
 * Correct → next box (max 5). Wrong → back to Box 1.
 */

export type Box = 1 | 2 | 3 | 4 | 5;

export interface SRState {
  itemId: string;
  box: Box;
  lastSeen: string;
  dueAt: string;
  correctStreak: number;
}

const K_SR = "oelp.sr.box";

const INTERVALS: Record<Box, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };

function addDaysISO(isoBase: string, days: number): string {
  const d = new Date(isoBase);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function loadSRMap(): Record<string, SRState> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(K_SR);
    return raw ? (JSON.parse(raw) as Record<string, SRState>) : {};
  } catch {
    return {};
  }
}

export function saveSRMap(map: Record<string, SRState>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(K_SR, JSON.stringify(map));
  } catch {
    /* quota — ignore */
  }
}

export function applyResponses(
  responses: Array<{ itemId: string; correct: boolean; at: string }>
): Record<string, SRState> {
  const map = loadSRMap();
  for (const r of responses) {
    const prev = map[r.itemId];
    const prevBox: Box = prev?.box ?? 1;
    const nextBox: Box = r.correct ? (Math.min(5, prevBox + 1) as Box) : 1;
    map[r.itemId] = {
      itemId: r.itemId,
      box: nextBox,
      lastSeen: r.at,
      dueAt: addDaysISO(r.at, INTERVALS[nextBox]),
      correctStreak: r.correct ? (prev?.correctStreak ?? 0) + 1 : 0,
    };
  }
  saveSRMap(map);
  return map;
}

export function getBoxSummary(): Record<Box, number> {
  const map = loadSRMap();
  const out: Record<Box, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const s of Object.values(map)) out[s.box]++;
  return out;
}

/**
 * Count how many items advanced (box increased) in a batch of responses.
 * Used for KR3.2 metric: "큐 내 어휘 10개 중 사후 즉시 회상 ≥ 6개".
 */
export function countAdvancements(
  responses: Array<{ itemId: string; correct: boolean }>,
  beforeMap: Record<string, SRState>
): number {
  let n = 0;
  for (const r of responses) {
    if (!r.correct) continue;
    const before = beforeMap[r.itemId];
    const beforeBox = before?.box ?? 1;
    if (beforeBox < 5) n++;
  }
  return n;
}
