/**
 * Vitest — lib/error-pattern-analyzer.ts (PR-7 of p2a-ontology).
 *
 * Validates classification accuracy on a small synthetic set
 * (dogfood-16 scaled down) and edge-case behaviour.
 */
import { describe, test, expect } from "vitest";
import {
  classifyWrongAnswer,
  aggregateErrorCategories,
} from "@/lib/error-pattern-analyzer";

describe("error-pattern-analyzer — distractor overrides", () => {
  test("T1: 유사어휘함정 → vocab_unknown", () => {
    const r = classifyWrongAnswer({
      qtId: "TYPE-빈칸추론",
      dimensionScores: { D1_Form: 80, D2_Meaning: 80, D3_Context: 80, D4_Network: 80, D5_Usage: 80 },
      distractorPicked: "DIST-유사어휘함정",
    });
    expect(r.category).toBe("vocab_unknown");
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  test("T2: 시제조건왜곡 → structure_misread", () => {
    expect(
      classifyWrongAnswer({
        qtId: "TYPE-문장삽입",
        dimensionScores: { D1_Form: 80, D3_Context: 80 },
        distractorPicked: "DIST-시제조건왜곡",
      }).category
    ).toBe("structure_misread");
  });

  test("T3: 인과혼동 → discourse_drift", () => {
    expect(
      classifyWrongAnswer({
        qtId: "TYPE-순서배열",
        dimensionScores: { D3_Context: 80 },
        distractorPicked: "DIST-인과혼동",
      }).category
    ).toBe("discourse_drift");
  });

  test("T4: 부분일치 → distractor_trap", () => {
    expect(
      classifyWrongAnswer({
        qtId: "TYPE-요지",
        dimensionScores: { D3_Context: 80 },
        distractorPicked: "DIST-부분일치",
      }).category
    ).toBe("distractor_trap");
  });
});

describe("error-pattern-analyzer — mastery fallback", () => {
  test("T5: V-layer weakest (D2_Meaning low) → vocab_unknown", () => {
    const r = classifyWrongAnswer({
      qtId: "TYPE-빈칸추론",
      dimensionScores: {
        D1_Form: 80,
        D2_Meaning: 15, // V/D weak via D2
        D3_Context: 80,
        D4_Network: 80,
        D5_Usage: 80,
      },
    });
    expect(r.category).toBe("vocab_unknown");
  });

  test("T6: S-layer weakest (D1_Form low) → structure_misread", () => {
    const r = classifyWrongAnswer({
      qtId: "TYPE-문장삽입",
      dimensionScores: {
        D1_Form: 10, // S-layer (V2/S1/S2/S4 all use D1)
        D2_Meaning: 80,
        D3_Context: 80,
        D4_Network: 80,
        D5_Usage: 80,
      },
    });
    expect(r.category).toBe("structure_misread");
  });

  test("T7: TYPE-빈칸추론 + D weakest → anaphora_lost (QT cue)", () => {
    const r = classifyWrongAnswer({
      qtId: "TYPE-빈칸추론",
      dimensionScores: {
        D1_Form: 80,
        D2_Meaning: 80,
        D3_Context: 20, // pulls D-layer down without dropping V (D2_Meaning still 80)
        D4_Network: 80,
        D5_Usage: 80,
      },
    });
    expect(r.category).toBe("anaphora_lost");
  });

  test("T8: TYPE-요지 + D weakest → discourse_drift (no anaphora cue)", () => {
    const r = classifyWrongAnswer({
      qtId: "TYPE-요지",
      dimensionScores: {
        D1_Form: 80,
        D2_Meaning: 80,
        D3_Context: 20,
        D4_Network: 80,
        D5_Usage: 80,
      },
    });
    expect(r.category).toBe("discourse_drift");
  });
});

describe("error-pattern-analyzer — edge cases", () => {
  test("T9: unknown qtId returns distractor_trap with very low confidence", () => {
    const r = classifyWrongAnswer({
      qtId: "TYPE-ghost",
      dimensionScores: { D2_Meaning: 50 },
    });
    expect(r.category).toBe("distractor_trap");
    expect(r.confidence).toBeLessThan(0.2);
  });

  test("T10: empty scores → distractor_trap fallback", () => {
    const r = classifyWrongAnswer({
      qtId: "TYPE-요지",
      dimensionScores: {},
    });
    expect(r.category).toBe("distractor_trap");
  });

  test("T11: aggregateErrorCategories sums correctly", () => {
    const counts = aggregateErrorCategories([
      { qtId: "TYPE-빈칸추론", dimensionScores: {}, distractorPicked: "DIST-유사어휘함정" },
      { qtId: "TYPE-빈칸추론", dimensionScores: {}, distractorPicked: "DIST-유사어휘함정" },
      { qtId: "TYPE-요지", dimensionScores: { D3_Context: 20, D2_Meaning: 80, D1_Form: 80, D4_Network: 80, D5_Usage: 80 } },
    ]);
    expect(counts.vocab_unknown).toBe(2);
    expect(counts.discourse_drift).toBe(1);
    expect(counts.distractor_trap).toBe(0);
  });
});
