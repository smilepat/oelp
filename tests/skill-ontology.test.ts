/**
 * Vitest — lib/skill-ontology.ts (PR-1 of p2a-ontology).
 *
 * Sentinel tests over the 33-node / 38-edge seed.
 * Design: docs/02-design/p2a-pr1-skill-ontology-design.md
 */
import { describe, test, expect } from "vitest";
import {
  loadSkillOntology,
  getNode,
  getNodesByLayer,
  getActiveNodes,
  getEdgesOfType,
  getAncestors,
  getCausalRoots,
  detectCycle,
} from "@/lib/skill-ontology";

describe("skill-ontology — seed integrity", () => {
  test("T1: loadSkillOntology returns 33 nodes + 38 edges", () => {
    const o = loadSkillOntology();
    expect(o.nodes.length).toBe(33);
    expect(o.edges.length).toBe(38);
    expect(o.schemaVersion).toBe(1);
  });

  test("T2: layer distribution V=5 S=5 D=8 R=10 A=5 (P=0 in PR-1)", () => {
    expect(getNodesByLayer("V").length).toBe(5);
    expect(getNodesByLayer("S").length).toBe(5);
    expect(getNodesByLayer("D").length).toBe(8);
    expect(getNodesByLayer("R").length).toBe(10);
    expect(getNodesByLayer("A").length).toBe(5);
    expect(getNodesByLayer("P").length).toBe(0);
  });

  test("T3: all edges reference existing nodes", () => {
    const o = loadSkillOntology();
    const ids = new Set(o.nodes.map((n) => n.id));
    for (const e of o.edges) {
      expect(ids.has(e.from), `edge.from ${e.from} missing`).toBe(true);
      expect(ids.has(e.to), `edge.to ${e.to} missing`).toBe(true);
    }
  });

  test("T4: core_dependency subgraph is acyclic", () => {
    expect(detectCycle()).toBeNull();
  });

  test("T5: all mvpActive nodes are active in seed", () => {
    expect(getActiveNodes().length).toBe(33);
  });
});

describe("skill-ontology — traversal helpers", () => {
  test("T6: getAncestors(D7) includes D4 and D5 (direct deps)", () => {
    const ancestors = getAncestors("D7");
    expect(ancestors).toContain("D4");
    expect(ancestors).toContain("D5");
  });

  test("T7: getAncestors(D7) transitively includes D2 and D3 via D4", () => {
    const ancestors = getAncestors("D7");
    expect(ancestors).toContain("D2");
    expect(ancestors).toContain("D3");
    expect(ancestors).toContain("D1");
  });

  test("T8: getCausalRoots(R7) returns top non-dependent ancestors", () => {
    const roots = getCausalRoots("R7");
    // R7 ← D8 ← D7 ← {D4 ← D2/D3, D5 ← D1 ← S5 ← {S2,S3,S4} ← S1 ← V2}
    // Causal roots (no inbound core_dependency among ancestors): D2, D3, V2.
    expect(roots).toContain("D2");
    expect(roots).toContain("D3");
    expect(roots).toContain("V2");
    // V1 is NOT an ancestor of R7 (V1 only feeds V4, off the R7 chain).
    expect(roots).not.toContain("V1");
    // D5 has D1 as ancestor → not a root
    expect(roots).not.toContain("D5");
  });

  test("T9: edge type counts: 18 core / 12 supportive / 8 indirect", () => {
    expect(getEdgesOfType("core_dependency").length).toBe(18);
    expect(getEdgesOfType("supportive_influence").length).toBe(12);
    expect(getEdgesOfType("indirect_relation").length).toBe(8);
  });

  test("T10: getNode returns named skill with image-canonical name", () => {
    expect(getNode("D5")?.name).toBe("요지 파악");
    expect(getNode("R6")?.nameEn).toBe("Cloze inference");
    expect(getNode("XX")).toBeUndefined();
  });
});
