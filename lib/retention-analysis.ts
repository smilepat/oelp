/**
 * Retention analysis lib (v19) — 학습자 휴학/복귀 cycle 감지.
 *
 * v18 finding (dogfood-14, dogfood-15):
 *   - 단발성 휴학 8w까지 안전 (avg 94.5%+ 회복)
 *   - 반복 cycle (이탈 2+회) 치명적 (avg -57.3%)
 *
 * 본 module은 sessions에서 비활성 기간(gap)을 계산해서 retention 위험도
 * 분류:
 *   - "safe": 모든 gap < 3주
 *   - "single-break": 1번의 ≥ 3주 gap (안전, 회복 가능)
 *   - "repeated-cycle": ≥ 2번의 ≥ 3주 gap (위험군, v18 finding)
 */

import type { SessionRecord } from "./session-store";

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RetentionGap {
  /** Gap start date (last session before break) */
  startDate: string;
  /** Gap end date (first session after break) */
  endDate: string;
  /** Gap length in days */
  days: number;
  /** Gap length in weeks (rounded) */
  weeks: number;
}

export type RetentionRisk = "safe" | "single-break" | "repeated-cycle";

export interface RetentionAnalysisResult {
  sessionsAnalyzed: number;
  totalSpanDays: number;
  gaps: RetentionGap[];
  /** Gaps ≥ 3 weeks (significant inactivity) */
  significantGaps: RetentionGap[];
  /** Largest gap in weeks */
  maxGapWeeks: number;
  /** Current inactivity: days since last session (if today is later than last) */
  daysSinceLastSession: number | null;
  risk: RetentionRisk;
  /** v18 finding 기반 권장 액션 */
  recommendation: string;
}

/**
 * Analyze sessions for retention risk patterns.
 *
 * @param sessions Session history (any order, sorted internally)
 * @param now Reference date for "days since last session" (default: Date.now)
 * @param significantGapWeeks 어느 길이부터 "휴학"으로 간주 (default 3주)
 */
export function analyzeRetention(
  sessions: SessionRecord[],
  now: Date = new Date(),
  significantGapWeeks = 3
): RetentionAnalysisResult {
  if (sessions.length === 0) {
    return {
      sessionsAnalyzed: 0,
      totalSpanDays: 0,
      gaps: [],
      significantGaps: [],
      maxGapWeeks: 0,
      daysSinceLastSession: null,
      risk: "safe",
      recommendation: "세션 기록 없음. 진단 후 학습 큐 시작.",
    };
  }

  const sorted = [...sessions].sort(
    (a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime()
  );

  const gaps: RetentionGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].endedAt);
    const curr = new Date(sorted[i].endedAt);
    const days = Math.floor((curr.getTime() - prev.getTime()) / MS_PER_DAY);
    if (days < 1) continue; // same-day sessions
    gaps.push({
      startDate: prev.toISOString(),
      endDate: curr.toISOString(),
      days,
      weeks: Math.round(days / DAYS_PER_WEEK),
    });
  }

  const significantGaps = gaps.filter((g) => g.weeks >= significantGapWeeks);
  const maxGapWeeks = gaps.length === 0 ? 0 : Math.max(...gaps.map((g) => g.weeks));

  const last = new Date(sorted[sorted.length - 1].endedAt);
  const daysSinceLastSession = Math.floor((now.getTime() - last.getTime()) / MS_PER_DAY);
  // If current inactivity is ≥ significant threshold, count as additional gap-in-progress
  const currentInactivityIsGap = daysSinceLastSession >= significantGapWeeks * DAYS_PER_WEEK;
  const effectiveSignificantGapCount = significantGaps.length + (currentInactivityIsGap ? 1 : 0);

  const totalSpanDays = Math.floor(
    (last.getTime() - new Date(sorted[0].endedAt).getTime()) / MS_PER_DAY
  );

  let risk: RetentionRisk;
  let recommendation: string;
  if (effectiveSignificantGapCount === 0) {
    risk = "safe";
    recommendation = "정상 학습 패턴 — 모든 gap < 3주.";
  } else if (effectiveSignificantGapCount === 1) {
    risk = "single-break";
    recommendation = currentInactivityIsGap
      ? `현재 ${daysSinceLastSession}일 비활성. 복귀 시 baseline 진단 재실행 권장.`
      : "단발성 휴학 감지 (v18 finding: 8w까지 회복 가능). 정상 학습 지속 권장.";
  } else {
    risk = "repeated-cycle";
    recommendation = `반복 휴학 cycle 감지 (${effectiveSignificantGapCount}회). v18 finding: 학습 효과 무효화 위험. 진단 재실행 + Leitner SR 재시작 권장.`;
  }

  return {
    sessionsAnalyzed: sorted.length,
    totalSpanDays,
    gaps,
    significantGaps,
    maxGapWeeks,
    daysSinceLastSession,
    risk,
    recommendation,
  };
}
