/**
 * Skill Ontology — P→V→S→D→R→A 6-layer English learning competency graph.
 *
 * PR-1 of p2a-ontology feature.
 * Design: docs/02-design/p2a-pr1-skill-ontology-design.md
 * Visual reference: docs/01-plan/assets/p2a-roadmap.png
 *
 * This module is *additive* — it does not modify lib/ontology.ts, weights,
 * or any existing surface. Downstream PRs (2~9) import from here.
 */

import seedJson from "./skill-ontology-seed.json";

export type SkillLayer = "P" | "V" | "S" | "D" | "R" | "A";

export type GradeLevel = "elem_1_3" | "elem_4_6" | "middle" | "high" | "csat";

/** Edge labels mirror the roadmap image legend (Korean canonical names). */
export type EdgeType =
  | "core_dependency"       // 핵심 의존 관계 (solid)
  | "supportive_influence"  // 보조적 영향 관계 (dashed)
  | "indirect_relation";    // 간접적 연관 관계 (dotted)

export interface SkillNode {
  id: string;
  layer: SkillLayer;
  name: string;
  nameEn: string;
  description: string;
  gradeLevel: GradeLevel;
  measuredByDims: string[];
  measuredByQts: string[];
  measuredByKeyVars: string[];
  mvpActive: boolean;
}

export interface SkillEdge {
  from: string;
  to: string;
  type: EdgeType;
  note?: string;
}

export interface SkillOntology {
  schemaVersion: 1;
  version: string;
  nodes: SkillNode[];
  edges: SkillEdge[];
}

const ONTOLOGY = seedJson as SkillOntology;

export function loadSkillOntology(): SkillOntology {
  return ONTOLOGY;
}

export function getNode(id: string): SkillNode | undefined {
  return ONTOLOGY.nodes.find((n) => n.id === id);
}

export function getNodesByLayer(layer: SkillLayer): SkillNode[] {
  return ONTOLOGY.nodes.filter((n) => n.layer === layer);
}

export function getActiveNodes(): SkillNode[] {
  return ONTOLOGY.nodes.filter((n) => n.mvpActive);
}

export function getEdgesOfType(type: EdgeType): SkillEdge[] {
  return ONTOLOGY.edges.filter((e) => e.type === type);
}

/**
 * BFS ancestors over core_dependency edges (incoming edges to `id`).
 * Returns ids of all skills that `id` depends on, transitively.
 */
export function getAncestors(id: string): string[] {
  const deps = ONTOLOGY.edges.filter((e) => e.type === "core_dependency");
  const visited = new Set<string>();
  const queue: string[] = [id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of deps) {
      if (e.to === cur && !visited.has(e.from)) {
        visited.add(e.from);
        queue.push(e.from);
      }
    }
  }
  return [...visited];
}

/**
 * Trace "causal roots" — find the upstream-most ancestors (no further
 * incoming core_dependency edges among the ancestor set).
 * Used by PR-3.6 weakness→cause traceback.
 */
export function getCausalRoots(id: string): string[] {
  const ancestors = getAncestors(id);
  if (ancestors.length === 0) return [];
  const deps = ONTOLOGY.edges.filter((e) => e.type === "core_dependency");
  return ancestors.filter(
    (a) => !deps.some((e) => e.to === a && ancestors.includes(e.from))
  );
}

/** Detect any cycle in the core_dependency subgraph. Returns offending edge or null. */
export function detectCycle(): { from: string; to: string } | null {
  const deps = ONTOLOGY.edges.filter((e) => e.type === "core_dependency");
  const adj = new Map<string, string[]>();
  for (const e of deps) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of ONTOLOGY.nodes) color.set(n.id, WHITE);

  let foundCycle: { from: string; to: string } | null = null;

  function dfs(u: string) {
    if (foundCycle) return;
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) {
        foundCycle = { from: u, to: v };
        return;
      }
      if (color.get(v) === WHITE) dfs(v);
      if (foundCycle) return;
    }
    color.set(u, BLACK);
  }

  for (const n of ONTOLOGY.nodes) {
    if (color.get(n.id) === WHITE) dfs(n.id);
    if (foundCycle) return foundCycle;
  }
  return null;
}
