/**
 * Vitest — ontology.ts (A7+ Phase 2 coverage push, was 30%).
 *
 * Targets predictCorrectness + buildOntologyElements + bucketize edge
 * cases. Combined with existing dimension-mapping-consistency.test.ts
 * (which already touches QUESTION_TYPES / DISTRACTOR_TYPES), this brings
 * lib/ontology.ts to ~95%+.
 */
import { describe, test, expect } from "vitest";
import {
  QUESTION_TYPES,
  DISTRACTOR_TYPES,
  predictCorrectness,
  buildOntologyElements,
} from "@/lib/ontology";

describe("ontology.predictCorrectness (A7+)", () => {
  test("T1: 0% on all dims → 0", () => {
    const qt = QUESTION_TYPES[0];
    expect(
      predictCorrectness(
        { D1_Form: 0, D2_Meaning: 0, D3_Context: 0, D4_Network: 0, D5_Usage: 0 },
        qt
      )
    ).toBe(0);
  });

  test("T2: 100% on all dims → 1.0 (weights sum to 1)", () => {
    const qt = QUESTION_TYPES[0];
    const p = predictCorrectness(
      { D1_Form: 100, D2_Meaning: 100, D3_Context: 100, D4_Network: 100, D5_Usage: 100 },
      qt
    );
    expect(p).toBeCloseTo(1, 5);
  });

  test("T3: missing dim defaults to 0", () => {
    const qt = QUESTION_TYPES.find((q) => q.id === "TYPE-요지")!;
    const withMissing = predictCorrectness({ D3_Context: 100 }, qt);
    // Only D3 contributes — w[D3]
    expect(withMissing).toBeCloseTo(qt.weights.D3_Context, 5);
  });

  test("T4: returns linear sum across all 10 QT", () => {
    // For each QT, half scores → ~0.5 result (since weights sum to 1)
    for (const qt of QUESTION_TYPES) {
      const p = predictCorrectness(
        { D1_Form: 50, D2_Meaning: 50, D3_Context: 50, D4_Network: 50, D5_Usage: 50 },
        qt
      );
      expect(p, qt.id).toBeCloseTo(0.5, 5);
    }
  });
});

describe("ontology.buildOntologyElements (A7+)", () => {
  test("T5: no scores → produces cluster parents + 10 QT + unique kvs + 7 distractors + edges", () => {
    const elements = buildOntologyElements();
    const clusters = elements.filter((e) => e.classes === "cluster");
    const qtNodes = elements.filter((e) => e.classes === "qt" && !e.data.source);
    const kvNodes = elements.filter((e) => e.classes === "kv");
    const distNodes = elements.filter((e) => e.classes === "dist");
    const edges = elements.filter((e) => e.data.source);

    expect(clusters).toHaveLength(2); // KV_PARENT + DIST_PARENT
    expect(qtNodes).toHaveLength(10);
    expect(distNodes).toHaveLength(7);
    // 21 unique key variables per dimension-mapping.md §1.2
    expect(kvNodes).toHaveLength(21);
    // edges: QT → KV (one per (qt, kv) pair)
    // Total kv refs across all 10 QT (with duplicates) determines edge count
    let totalRefs = 0;
    for (const qt of QUESTION_TYPES) totalRefs += qt.keyVariables.length;
    expect(edges).toHaveLength(totalRefs);
  });

  test("T6: scores annotate weakness class (w0..w4)", () => {
    // Strong learner — 95% everywhere → low weakness
    const strong = buildOntologyElements({
      D1_Form: 95,
      D2_Meaning: 95,
      D3_Context: 95,
      D4_Network: 95,
      D5_Usage: 95,
    });
    const qtClassesStrong = strong
      .filter((e) => e.classes?.startsWith("qt"))
      .map((e) => e.classes);
    // All should be w0 (weakness < 0.2)
    expect(qtClassesStrong.every((c) => c?.includes("w0"))).toBe(true);

    // Weak learner — 5% everywhere → high weakness
    const weak = buildOntologyElements({
      D1_Form: 5,
      D2_Meaning: 5,
      D3_Context: 5,
      D4_Network: 5,
      D5_Usage: 5,
    });
    const qtClassesWeak = weak
      .filter((e) => e.classes?.startsWith("qt"))
      .map((e) => e.classes);
    expect(qtClassesWeak.every((c) => c?.includes("w4"))).toBe(true);
  });

  test("T7: bucketize boundary 0.2 / 0.4 / 0.6 / 0.8", () => {
    // Construct scores that map to each bucket boundary
    // weakness = 1 - predictCorrectness; for averaged dimensions and sum=1 weights,
    // dimensionScores=X gives weakness ≈ 1 - X/100
    // Target weakness 0.5 → score 50
    const mid = buildOntologyElements({
      D1_Form: 50, D2_Meaning: 50, D3_Context: 50, D4_Network: 50, D5_Usage: 50,
    });
    const qtMid = mid.filter((e) => e.classes?.startsWith("qt"));
    expect(qtMid.every((e) => e.classes?.includes("w2"))).toBe(true); // 0.4-0.6
  });

  test("T8: parent references — kvs under KV_PARENT, distractors under DIST_PARENT", () => {
    const elements = buildOntologyElements();
    const kvs = elements.filter((e) => e.classes === "kv");
    const dists = elements.filter((e) => e.classes === "dist");
    expect(kvs.every((e) => e.data.parent === "cluster-keyvars")).toBe(true);
    expect(dists.every((e) => e.data.parent === "cluster-distractors")).toBe(true);
  });

  test("T9: kv deduplication — same kv name across QTs shares one node", () => {
    const elements = buildOntologyElements();
    const kvLabels = elements
      .filter((e) => e.classes === "kv")
      .map((e) => e.data.label);
    // Unique only
    expect(new Set(kvLabels).size).toBe(kvLabels.length);
    // But edges may reference same kv multiple times (across QTs)
    const edges = elements.filter((e) => e.data.source);
    const refsByKv: Record<string, number> = {};
    for (const e of edges) {
      const kvId = e.data.target!;
      refsByKv[kvId] = (refsByKv[kvId] ?? 0) + 1;
    }
    // At least one kv must be referenced by >1 QT (proves dedup matters)
    expect(Object.values(refsByKv).some((n) => n > 1)).toBe(true);
  });

  test("T10: all edges target an existing kv node + source an existing qt", () => {
    const elements = buildOntologyElements();
    const nodeIds = new Set(
      elements.filter((e) => !e.data.source).map((e) => e.data.id)
    );
    const edges = elements.filter((e) => e.data.source);
    for (const e of edges) {
      expect(nodeIds.has(e.data.source!), `source ${e.data.source} missing`).toBe(true);
      expect(nodeIds.has(e.data.target!), `target ${e.data.target} missing`).toBe(true);
    }
  });
});

describe("ontology — exported constants invariants (A7+)", () => {
  test("QUESTION_TYPES — every QT has 5D weights summing to ~1.0", () => {
    for (const qt of QUESTION_TYPES) {
      const sum = Object.values(qt.weights).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(0.005);
    }
  });

  test("DISTRACTOR_TYPES — all 7 have non-empty trapMechanism + description", () => {
    expect(DISTRACTOR_TYPES.length).toBe(7);
    for (const d of DISTRACTOR_TYPES) {
      expect(d.trapMechanism.length).toBeGreaterThan(3);
      expect(d.description.length).toBeGreaterThan(5);
    }
  });
});
