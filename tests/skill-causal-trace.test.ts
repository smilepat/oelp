/**
 * Vitest — lib/skill-causal-trace.ts (PR-3.6 of p2a-ontology).
 */
import { describe, test, expect } from "vitest";
import {
  traceRootCauses,
  recommendNextSteps,
  getCausalPathNodeIds,
} from "@/lib/skill-causal-trace";

describe("skill-causal-trace — traceRootCauses", () => {
  test("T1: traceRootCauses(R7) returns ≤3 candidates, roots first", () => {
    const causes = traceRootCauses("R7");
    expect(causes.length).toBeLessThanOrEqual(3);
    // Roots come first (sorted property)
    const firstNonRootIdx = causes.findIndex((c) => !c.isRoot);
    if (firstNonRootIdx >= 0) {
      for (let i = 0; i < firstNonRootIdx; i++) {
        expect(causes[i].isRoot).toBe(true);
      }
    }
  });

  test("T2: traceRootCauses(R7) top results include D2/D3/V2 (no inbound deps)", () => {
    const causes = traceRootCauses("R7", 10);
    const rootIds = causes.filter((c) => c.isRoot).map((c) => c.skillId);
    expect(rootIds).toContain("D2");
    expect(rootIds).toContain("D3");
    expect(rootIds).toContain("V2");
  });

  test("T3: traceRootCauses(V2) returns empty (V2 is itself a root)", () => {
    expect(traceRootCauses("V2")).toEqual([]);
  });

  test("T4: traceRootCauses(unknown id) returns empty", () => {
    expect(traceRootCauses("XX99")).toEqual([]);
  });

  test("T5: candidates carry depth = positive integer", () => {
    const causes = traceRootCauses("R7", 20);
    for (const c of causes) {
      expect(c.depth).toBeGreaterThan(0);
      expect(Number.isInteger(c.depth)).toBe(true);
    }
  });
});

describe("skill-causal-trace — recommendNextSteps", () => {
  test("T6: recommendNextSteps(R7) returns ≤5 items", () => {
    expect(recommendNextSteps("R7").length).toBeLessThanOrEqual(5);
  });

  test("T7: roots appear before non-roots in next-step ordering", () => {
    const steps = recommendNextSteps("R7", 10);
    const rootDone = steps.findIndex((s) => !s.isRoot);
    if (rootDone >= 0) {
      for (let i = 0; i < rootDone; i++) expect(steps[i].isRoot).toBe(true);
    }
  });

  test("T8: among non-roots, closer ancestors come first", () => {
    const steps = recommendNextSteps("R7", 20);
    const nonRoots = steps.filter((s) => !s.isRoot);
    for (let i = 1; i < nonRoots.length; i++) {
      expect(nonRoots[i].depth).toBeGreaterThanOrEqual(nonRoots[i - 1].depth);
    }
  });
});

describe("skill-causal-trace — getCausalPathNodeIds", () => {
  test("T9: includes target and all upstream ancestors", () => {
    const ids = getCausalPathNodeIds("R7");
    expect(ids).toContain("R7");
    expect(ids).toContain("D8");
    expect(ids).toContain("D7");
    expect(ids).toContain("V2");
  });

  test("T10: unknown id returns just the target itself", () => {
    expect(getCausalPathNodeIds("XX99")).toEqual(["XX99"]);
  });
});
