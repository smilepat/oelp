/**
 * Vitest — buildOntologyElements skill overlay (PR-3.5 of p2a-ontology).
 *
 * Verifies that the includeSkills opt-in extends the graph with
 * skill nodes, 3 edge types, and QT → skill links — while keeping
 * the default behavior backward-compatible.
 */
import { describe, test, expect } from "vitest";
import { buildOntologyElements } from "@/lib/ontology";

describe("buildOntologyElements — default backward compat", () => {
  test("T1: no includeSkills option → no skill-* nodes or edges", () => {
    const elements = buildOntologyElements();
    const hasSkill = elements.some((e) => e.classes?.includes("skill"));
    expect(hasSkill).toBe(false);
    const hasEdgeCore = elements.some((e) => e.classes === "edge-core");
    expect(hasEdgeCore).toBe(false);
  });

  test("T2: includeSkills: false → identical to no option", () => {
    const a = buildOntologyElements();
    const b = buildOntologyElements(undefined, { includeSkills: false });
    expect(b.length).toBe(a.length);
  });
});

describe("buildOntologyElements — skill overlay enabled", () => {
  test("T3: includeSkills: true adds 33 skill nodes + 5 layer clusters", () => {
    const elements = buildOntologyElements(undefined, { includeSkills: true });
    const skillNodes = elements.filter(
      (e) => typeof e.classes === "string" && e.classes.startsWith("skill skill-")
    );
    expect(skillNodes.length).toBe(33);
    const clusters = elements.filter(
      (e) => e.classes === "cluster cluster-skill"
    );
    expect(clusters.length).toBe(5);
  });

  test("T4: 3 edge types from roadmap legend are present", () => {
    const elements = buildOntologyElements(undefined, { includeSkills: true });
    const core = elements.filter((e) => e.classes === "edge-core").length;
    const support = elements.filter((e) => e.classes === "edge-support").length;
    const indirect = elements.filter((e) => e.classes === "edge-indirect").length;
    expect(core).toBe(18);
    expect(support).toBe(12);
    expect(indirect).toBe(8);
  });

  test("T5: QT → skill bridge edges are emitted (≥24, one per QT.skillId)", () => {
    const elements = buildOntologyElements(undefined, { includeSkills: true });
    const qtSkill = elements.filter((e) => e.classes === "edge-qt-skill");
    expect(qtSkill.length).toBeGreaterThanOrEqual(24);
  });

  test("T6: skillLayers filter ['R'] restricts to R-layer skills only", () => {
    const elements = buildOntologyElements(undefined, {
      includeSkills: true,
      skillLayers: ["R"],
    });
    const skillNodes = elements.filter(
      (e) => typeof e.classes === "string" && e.classes.startsWith("skill skill-")
    );
    expect(skillNodes.length).toBe(10); // R-layer = 10 skills
    expect(skillNodes.every((n) => n.classes === "skill skill-R")).toBe(true);
  });

  test("T7: edges between skills not in filtered layer set are dropped", () => {
    const elements = buildOntologyElements(undefined, {
      includeSkills: true,
      skillLayers: ["V"],
    });
    // Only V-layer skills visible (5). Only V-internal edges remain.
    const skillEdges = elements.filter(
      (e) =>
        typeof e.classes === "string" &&
        (e.classes === "edge-core" || e.classes === "edge-support" || e.classes === "edge-indirect")
    );
    // V → V edges: V1→V4 (core), V3→V4 (support) = 2
    expect(skillEdges.length).toBe(2);
  });

  test("T8: existing QT / keyVar / distractor counts unchanged when overlay on", () => {
    const elements = buildOntologyElements(undefined, { includeSkills: true });
    const qts = elements.filter((e) => typeof e.classes === "string" && e.classes.startsWith("qt"));
    const kvs = elements.filter((e) => e.classes === "kv");
    const dists = elements.filter((e) => e.classes === "dist");
    expect(qts.length).toBe(10);
    expect(kvs.length).toBe(21);
    expect(dists.length).toBe(7);
  });
});
