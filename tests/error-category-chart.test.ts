/**
 * Vitest — ErrorCategoryChart aggregation (PR-7c of p2a-ontology).
 *
 * Component is mostly UI — render testing is covered by Playwright A11y.
 * Here we test the aggregation path that the component depends on.
 */
import { describe, test, expect } from "vitest";
import { aggregateErrorCategories } from "@/lib/error-pattern-analyzer";

describe("ErrorCategoryChart — aggregation", () => {
  test("T1: mixed sessions sum across responses by category", () => {
    const inputs = [
      { qtId: "TYPE-빈칸추론", dimensionScores: { D2_Meaning: 15, D1_Form: 80, D3_Context: 80, D4_Network: 80, D5_Usage: 80 } },
      { qtId: "TYPE-문장삽입", dimensionScores: { D1_Form: 10, D2_Meaning: 80, D3_Context: 80, D4_Network: 80, D5_Usage: 80 } },
      { qtId: "TYPE-요지", dimensionScores: { D3_Context: 20, D1_Form: 80, D2_Meaning: 80, D4_Network: 80, D5_Usage: 80 } },
    ];
    const counts = aggregateErrorCategories(inputs);
    expect(counts.vocab_unknown).toBe(1);
    expect(counts.structure_misread).toBe(1);
    expect(counts.discourse_drift).toBe(1);
  });

  test("T2: empty input → all zero counts (chart shows placeholder)", () => {
    const counts = aggregateErrorCategories([]);
    const total = (Object.values(counts) as number[]).reduce((s, v) => s + v, 0);
    expect(total).toBe(0);
    expect(counts.vocab_unknown).toBe(0);
  });

  test("T3: aggregate respects distractor override path", () => {
    const counts = aggregateErrorCategories([
      { qtId: "TYPE-요지", dimensionScores: { D2_Meaning: 80 }, distractorPicked: "DIST-유사어휘함정" },
      { qtId: "TYPE-요지", dimensionScores: { D2_Meaning: 80 }, distractorPicked: "DIST-유사어휘함정" },
    ]);
    expect(counts.vocab_unknown).toBe(2);
  });
});
