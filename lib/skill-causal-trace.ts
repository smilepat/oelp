/**
 * Causal trace for skill weakness — given a struggling skill, identify
 * the upstream prerequisite candidates most likely to be unblocking it.
 *
 * PR-3.6 of p2a-ontology. Pure derived module on top of skill-ontology.
 *
 * Two complementary views:
 *   - traceRootCauses(id)     → ranked list of upstream "root" candidates
 *     (no further core_dependency ancestors among the trace set)
 *   - recommendNextSteps(id)  → ordered list of skills to practice next,
 *     prioritising root causes, then proximate ancestors
 *
 * Algorithm
 *   • core_dependency edges form a DAG (verified at validator gate 4).
 *   • Reverse BFS from `target` collects all ancestors with their BFS depth.
 *   • Roots = ancestors with no incoming core_dependency from inside the set.
 *   • Rank score = depth (further = more fundamental).
 *   • Top-K cap keeps the UI panel readable.
 */

import { loadSkillOntology } from "./skill-ontology";

export interface CausalCandidate {
  skillId: string;
  /** distance (number of core_dependency hops) from `target` skill */
  depth: number;
  /** true when this candidate has no further upstream cause inside the trace */
  isRoot: boolean;
}

const ROOT_CAUSE_DEFAULT = 3;
const NEXT_STEP_DEFAULT = 5;

function bfsAncestors(target: string): Map<string, number> {
  const seed = loadSkillOntology();
  const deps = seed.edges.filter((e) => e.type === "core_dependency");
  const depths = new Map<string, number>();
  const queue: Array<{ id: string; d: number }> = [{ id: target, d: 0 }];
  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    for (const e of deps) {
      if (e.to !== id) continue;
      const next = e.from;
      const existing = depths.get(next);
      if (existing === undefined || existing > d + 1) {
        depths.set(next, d + 1);
        queue.push({ id: next, d: d + 1 });
      }
    }
  }
  depths.delete(target); // exclude self
  return depths;
}

function isRoot(skillId: string, traceSet: Set<string>): boolean {
  const seed = loadSkillOntology();
  const deps = seed.edges.filter((e) => e.type === "core_dependency");
  for (const e of deps) {
    if (e.to === skillId && traceSet.has(e.from)) return false;
  }
  return true;
}

/**
 * Returns the top-K most fundamental upstream causes for a given weak skill.
 * Sorted by depth descending (deeper first), then by skill id ascending.
 */
export function traceRootCauses(
  targetSkillId: string,
  topK: number = ROOT_CAUSE_DEFAULT
): CausalCandidate[] {
  const depths = bfsAncestors(targetSkillId);
  const traceSet = new Set(depths.keys());
  const candidates: CausalCandidate[] = [];
  for (const [skillId, depth] of depths) {
    candidates.push({
      skillId,
      depth,
      isRoot: isRoot(skillId, traceSet),
    });
  }
  candidates.sort((a, b) => {
    if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
    if (b.depth !== a.depth) return b.depth - a.depth;
    return a.skillId.localeCompare(b.skillId);
  });
  return candidates.slice(0, topK);
}

/**
 * Returns an ordered next-step learning path for a weak skill.
 * Roots first (foundation), then proximate ancestors (closer to target).
 */
export function recommendNextSteps(
  targetSkillId: string,
  topK: number = NEXT_STEP_DEFAULT
): CausalCandidate[] {
  const depths = bfsAncestors(targetSkillId);
  const traceSet = new Set(depths.keys());
  const candidates: CausalCandidate[] = [];
  for (const [skillId, depth] of depths) {
    candidates.push({
      skillId,
      depth,
      isRoot: isRoot(skillId, traceSet),
    });
  }
  // Roots first (deepest), then nearer ancestors (smaller depth).
  candidates.sort((a, b) => {
    if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
    if (a.isRoot) return b.depth - a.depth; // among roots: deeper first
    return a.depth - b.depth; // among non-roots: closer first
  });
  return candidates.slice(0, topK);
}

/**
 * For OntologyMap highlight: the full set of node ids on any prerequisite
 * path from `target`. Used to add a `causal-path` class.
 */
export function getCausalPathNodeIds(targetSkillId: string): string[] {
  return [targetSkillId, ...bfsAncestors(targetSkillId).keys()];
}
