/**
 * Vitest — retention-analysis lib (v19).
 *
 * v18 finding (dogfood-14/15) 기반 휴학 cycle 감지 알고리즘:
 *   - safe: 모든 gap < 3주
 *   - single-break: 1번의 ≥ 3주 gap
 *   - repeated-cycle: ≥ 2번의 ≥ 3주 gap
 */
import { describe, test, expect } from "vitest";
import { analyzeRetention } from "@/lib/retention-analysis";
import type { SessionRecord } from "@/lib/session-store";

function makeSession(daysFromBase: number): SessionRecord {
  const base = new Date("2026-01-01T00:00:00Z").getTime();
  const time = base + daysFromBase * 86400000;
  return {
    sessionId: `s-${daysFromBase}`,
    startedAt: new Date(time - 1500000).toISOString(),
    endedAt: new Date(time).toISOString(),
    durationSec: 1500,
    targetQuestionType: "TYPE-요지",
    algorithm: "thompson-v2",
    confidence: "mid",
    alternateQuestionType: "TYPE-제목",
    correct: 7,
    total: 10,
    advancements: 5,
    boxAfter: { "1": 5, "2": 5, "3": 0, "4": 0, "5": 0 },
    posteriorAfter: { alpha: 8, beta: 4, samples: 10 },
    responses: [],
  };
}

const REF_NOW = new Date("2026-07-01T00:00:00Z"); // 6 months after Jan 1

describe("analyzeRetention", () => {
  test("T1: empty sessions → safe + 안내", () => {
    const r = analyzeRetention([], REF_NOW);
    expect(r.risk).toBe("safe");
    expect(r.sessionsAnalyzed).toBe(0);
    expect(r.recommendation).toContain("세션 기록 없음");
  });

  test("T2: continuous sessions (모두 < 3주 gap) → safe", () => {
    // Day 0, 7, 14, 21 (1주씩 — 평균 패턴)
    const sessions = [0, 7, 14, 21].map(makeSession);
    const r = analyzeRetention(sessions, new Date("2026-01-25"));
    expect(r.risk).toBe("safe");
    expect(r.significantGaps.length).toBe(0);
    expect(r.maxGapWeeks).toBe(1);
  });

  test("T3: 1회 ≥ 3주 gap → single-break", () => {
    // Day 0, 7, 14, 60 (4주 gap)
    const sessions = [0, 7, 14, 60].map(makeSession);
    const r = analyzeRetention(sessions, new Date("2026-03-05"));
    expect(r.risk).toBe("single-break");
    expect(r.significantGaps.length).toBe(1);
    expect(r.significantGaps[0].weeks).toBe(7); // 60-14 = 46일 ≈ 7주
  });

  test("T4: 2회 ≥ 3주 gap → repeated-cycle (위험)", () => {
    // Day 0, 7, 70 (9주 gap), 80, 150 (10주 gap) — 2번 휴학
    const sessions = [0, 7, 70, 80, 150].map(makeSession);
    const r = analyzeRetention(sessions, new Date("2026-06-01"));
    expect(r.risk).toBe("repeated-cycle");
    expect(r.significantGaps.length).toBe(2);
    expect(r.recommendation).toContain("반복 휴학 cycle");
  });

  test("T5: current inactivity ≥ 3주 → 추가 gap 인식", () => {
    // Last session 100일 전 + 그 전에는 정상
    const sessions = [0, 7, 14].map(makeSession);
    const r = analyzeRetention(sessions, new Date("2026-04-30")); // 100+ 일 후
    expect(r.daysSinceLastSession).toBeGreaterThanOrEqual(21);
    expect(r.risk).toBe("single-break"); // current inactivity = 1번의 gap
    expect(r.recommendation).toContain("baseline 진단 재실행");
  });

  test("T6: 1 과거 gap + 현재 비활성 → repeated-cycle", () => {
    // Day 0, 7, 60 (1번 휴학 후 복귀), 그 후 현재까지 ≥ 3주
    const sessions = [0, 7, 60].map(makeSession);
    const r = analyzeRetention(sessions, new Date("2026-04-30")); // 100+ 일 후
    expect(r.risk).toBe("repeated-cycle");
    expect(r.significantGaps.length).toBe(1); // 과거 gap 1
    // + current inactivity gap = total 2
  });

  test("T7: maxGapWeeks 계산 정확", () => {
    const sessions = [0, 7, 14, 50, 57, 100].map(makeSession);
    const r = analyzeRetention(sessions, new Date("2026-04-15"));
    // gaps: 7, 7, 36, 7, 43 days → max 43일 ≈ 6주
    expect(r.maxGapWeeks).toBe(6);
  });

  test("T8: out-of-order sessions sorted internally", () => {
    const sessions = [0, 60, 7, 14].map(makeSession);
    const r = analyzeRetention(sessions, new Date("2026-03-05"));
    expect(r.risk).toBe("single-break"); // 14 → 60 gap correctly detected
    expect(r.significantGaps.length).toBe(1);
  });
});
