/**
 * Vitest — kv-dim-mapping (D5 over-declared root cause UI prep).
 *
 * Verifies the TS copy of dimension-mapping.md §3 keyVariable → dim
 * mapping logic + contradiction detection matches what
 * scripts/synthetic-validation-c4-1.mjs uses server-side.
 */
import { describe, test, expect } from "vitest";
import {
  KV_DIM_MAPPING,
  deriveWeightsFromKeyVariables,
  compareWeights,
} from "@/lib/kv-dim-mapping";

describe("kv-dim-mapping (UI prep)", () => {
  test("T1: 21 keyVariables defined", () => {
    expect(Object.keys(KV_DIM_MAPPING).length).toBe(21);
  });

  test("T2: deriveWeights — single-dim kv contributes 100% to that dim", () => {
    const result = deriveWeightsFromKeyVariables(["context_clue"]);
    expect(result.D3_Context).toBeCloseTo(1.0, 5);
    expect(result.D5_Usage).toBe(0);
  });

  test("T3: deriveWeights — multi-dim kv splits evenly", () => {
    const result = deriveWeightsFromKeyVariables(["coherence_gap"]);
    expect(result.D3_Context).toBeCloseTo(0.5, 5);
    expect(result.D5_Usage).toBeCloseTo(0.5, 5);
  });

  test("T4: deriveWeights — sums to 1.0 (normalized)", () => {
    const result = deriveWeightsFromKeyVariables(["emotional_indirectness", "emotion_vocab_density"]);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  test("T5: empty keyVariables → all-zero", () => {
    const result = deriveWeightsFromKeyVariables([]);
    expect(Object.values(result).every((v) => v === 0)).toBe(true);
  });

  test("T6: unknown kv → skipped (no crash)", () => {
    const result = deriveWeightsFromKeyVariables(["unknown_kv"]);
    expect(Object.values(result).every((v) => v === 0)).toBe(true);
  });

  test("T7: compareWeights flags declared-over contradiction", () => {
    // TYPE-심경 case: emotional_indirectness + emotion_vocab_density →
    // D2/D3 only. If declared D5 = 0.28, contradiction "declared-over".
    const declared = { D1_Form: 0.05, D2_Meaning: 0.10, D3_Context: 0.30, D4_Network: 0.27, D5_Usage: 0.28 };
    const result = compareWeights(declared, ["emotional_indirectness", "emotion_vocab_density"]);
    const d5 = result.find((r) => r.dim === "D5_Usage")!;
    expect(d5.contradiction).toBe("declared-over");
  });

  test("T8: compareWeights flags declared-under contradiction", () => {
    // declared D3 < 0.05 but kv strongly maps to D3 (e.g., context_clue)
    const declared = { D1_Form: 0.05, D2_Meaning: 0.30, D3_Context: 0.02, D4_Network: 0.30, D5_Usage: 0.33 };
    const result = compareWeights(declared, ["context_clue"]);
    const d3 = result.find((r) => r.dim === "D3_Context")!;
    expect(d3.contradiction).toBe("declared-under");
  });

  test("T9: no contradiction in safe zone", () => {
    const declared = { D1_Form: 0.05, D2_Meaning: 0.10, D3_Context: 0.50, D4_Network: 0.25, D5_Usage: 0.10 };
    const result = compareWeights(declared, ["topic_abstractness", "topic_sentence_position"]);
    // All within declared 5-50%, no contradiction
    expect(result.every((r) => r.contradiction === null)).toBe(true);
  });

  test("T10: TYPE-심경/제목 D5 = 0 derived (root cause analysis)", () => {
    const sim = deriveWeightsFromKeyVariables(["emotional_indirectness", "emotion_vocab_density"]);
    expect(sim.D5_Usage).toBe(0);
    const jemok = deriveWeightsFromKeyVariables(["title_abstractness", "metaphor_density"]);
    expect(jemok.D5_Usage).toBe(0);
  });
});
