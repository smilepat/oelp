/**
 * Vitest — plateau-detection (v13 D1_Form 실 데이터 검증 lib).
 *
 * 실 학습자 4주+ 누적 시 dim score plateau 자동 감지. 본 test는 알고리즘
 * 정확성 보장 — PlateauWarningPanel은 본 lib에 의존.
 */
import { describe, test, expect } from "vitest";
import { detectPlateaus } from "@/lib/plateau-detection";
import type { SessionRecord } from "@/lib/session-store";
import type { VocabDimension } from "@/lib/diagnostic";

function makeSession(
  idx: number,
  dimensionScores: Partial<Record<VocabDimension, number>>
): SessionRecord {
  const base = new Date("2026-01-01T00:00:00Z").getTime();
  return {
    sessionId: `s-${idx}`,
    startedAt: new Date(base + idx * 86400000).toISOString(),
    endedAt: new Date(base + idx * 86400000 + 1500000).toISOString(),
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
    responses: [
      {
        itemId: "card-1",
        qtId: "TYPE-요지",
        isCorrect: true,
        dimensionScores,
        at: new Date(base + idx * 86400000 + 60000).toISOString(),
      },
    ],
  };
}

describe("detectPlateaus", () => {
  test("T1: empty sessions → no flags", () => {
    const r = detectPlateaus([]);
    expect(r.flags).toEqual([]);
    expect(r.hasD1Plateau).toBe(false);
    expect(r.sessionsAnalyzed).toBe(0);
  });

  test("T2: < minSessions → no flags (under threshold)", () => {
    const sessions = [
      makeSession(0, { D1_Form: 60, D2_Meaning: 50 }),
      makeSession(1, { D1_Form: 60, D2_Meaning: 52 }),
      makeSession(2, { D1_Form: 60, D2_Meaning: 54 }),
    ];
    const r = detectPlateaus(sessions, 4, 3);
    expect(r.flags).toEqual([]);
    expect(r.sessionsAnalyzed).toBe(3);
  });

  test("T3: D1_Form flat across 4+ sessions → warn flag", () => {
    const sessions = [
      makeSession(0, { D1_Form: 60, D2_Meaning: 50, D3_Context: 55 }),
      makeSession(1, { D1_Form: 60, D2_Meaning: 60, D3_Context: 65 }),
      makeSession(2, { D1_Form: 60, D2_Meaning: 70, D3_Context: 75 }),
      makeSession(3, { D1_Form: 60, D2_Meaning: 75, D3_Context: 80 }),
    ];
    const r = detectPlateaus(sessions, 4, 3);
    expect(r.hasD1Plateau).toBe(true);
    const d1Flag = r.flags.find((f) => f.dim === "D1_Form");
    expect(d1Flag).toBeDefined();
    expect(d1Flag?.severity).toBe("warn");
    expect(d1Flag?.rangePoints).toBe(0);
    expect(d1Flag?.meanScore).toBe(60);
  });

  test("T4: D2 normal evolution (range > threshold) → not flagged", () => {
    const sessions = [
      makeSession(0, { D2_Meaning: 50 }),
      makeSession(1, { D2_Meaning: 60 }),
      makeSession(2, { D2_Meaning: 70 }),
      makeSession(3, { D2_Meaning: 80 }),
    ];
    const r = detectPlateaus(sessions, 4, 3);
    expect(r.flags.find((f) => f.dim === "D2_Meaning")).toBeUndefined();
  });

  test("T5: D3 with 2-point variation → flag as info (non-D1)", () => {
    const sessions = [
      makeSession(0, { D3_Context: 70 }),
      makeSession(1, { D3_Context: 71 }),
      makeSession(2, { D3_Context: 70 }),
      makeSession(3, { D3_Context: 72 }),
    ];
    const r = detectPlateaus(sessions, 4, 3);
    const d3Flag = r.flags.find((f) => f.dim === "D3_Context");
    expect(d3Flag).toBeDefined();
    expect(d3Flag?.severity).toBe("info");
    expect(d3Flag?.rangePoints).toBe(2);
  });

  test("T6: out-of-order sessions sorted by endedAt internally", () => {
    const s0 = makeSession(0, { D1_Form: 60 });
    const s1 = makeSession(1, { D1_Form: 60 });
    const s2 = makeSession(2, { D1_Form: 60 });
    const s3 = makeSession(3, { D1_Form: 60 });
    const r = detectPlateaus([s3, s0, s2, s1], 4, 3);
    expect(r.hasD1Plateau).toBe(true);
  });

  test("T7: missing dimensionScores in some sessions → graceful", () => {
    const sessions = [
      makeSession(0, { D1_Form: 60 }),
      makeSession(1, {}), // no scores
      makeSession(2, { D1_Form: 60 }),
      makeSession(3, { D1_Form: 60 }),
    ];
    const r = detectPlateaus(sessions, 4, 3);
    // Only 3 D1 samples → < minSessions for this dim → no flag (graceful)
    expect(r.flags.find((f) => f.dim === "D1_Form")).toBeUndefined();
    expect(r.sessionsAnalyzed).toBe(4);
  });

  test("T8: 5 sessions all dims flat → multiple flags", () => {
    const sessions = [0, 1, 2, 3, 4].map((i) =>
      makeSession(i, {
        D1_Form: 60,
        D2_Meaning: 60,
        D3_Context: 60,
        D4_Network: 60,
        D5_Usage: 60,
      })
    );
    const r = detectPlateaus(sessions, 4, 3);
    expect(r.flags.length).toBe(5);
    // D1 should be warn, others info
    const d1 = r.flags.find((f) => f.dim === "D1_Form");
    expect(d1?.severity).toBe("warn");
    for (const f of r.flags) {
      if (f.dim !== "D1_Form") expect(f.severity).toBe("info");
    }
  });
});
