/**
 * Reverse index: keyVariable → skill_id[].
 *
 * PR-2 of p2a-ontology.
 *
 * Built lazily from skill-ontology-seed.json's measuredByKeyVars arrays.
 * Pure derived view — no manual mapping tables to keep in sync.
 *
 * Consumers:
 *   - scripts/check-dim-coverage.mjs (skill_coverage section)
 *   - scripts/validate-skill-ontology.mjs (orphan keyVar check)
 *   - PR-3+ recommendation engine (find skills targeting a keyVar)
 */

import { loadSkillOntology } from "./skill-ontology";

let cache: Map<string, string[]> | null = null;

function buildIndex(): Map<string, string[]> {
  if (cache) return cache;
  const idx = new Map<string, string[]>();
  for (const node of loadSkillOntology().nodes) {
    for (const kv of node.measuredByKeyVars) {
      const arr = idx.get(kv) ?? [];
      arr.push(node.id);
      idx.set(kv, arr);
    }
  }
  cache = idx;
  return idx;
}

/** Skill ids that claim to measure the given keyVariable. */
export function skillsForKeyVar(keyVar: string): string[] {
  return [...(buildIndex().get(keyVar) ?? [])];
}

/** All keyVariables that have ≥1 skill mapping. */
export function getAllMappedKeyVars(): string[] {
  return [...buildIndex().keys()];
}

/**
 * Given a list of known keyVariables (from ontology.ts QUESTION_TYPES),
 * return those with zero skill mapping. Drives CI gate.
 */
export function getOrphanKeyVars(allKnownKeyVars: string[]): string[] {
  const mapped = new Set(getAllMappedKeyVars());
  return allKnownKeyVars.filter((kv) => !mapped.has(kv));
}

/** For a skill, list its declared keyVariables (forward, helper). */
export function getKeyVarsForSkill(skillId: string): string[] {
  const node = loadSkillOntology().nodes.find((n) => n.id === skillId);
  return node ? [...node.measuredByKeyVars] : [];
}

/** Diagnostic: skill ids referenced in the index but missing from ontology nodes. */
export function getInvalidSkillRefs(): string[] {
  const ontology = loadSkillOntology();
  const nodeIds = new Set(ontology.nodes.map((n) => n.id));
  const out = new Set<string>();
  for (const ids of buildIndex().values()) {
    for (const id of ids) if (!nodeIds.has(id)) out.add(id);
  }
  return [...out];
}
