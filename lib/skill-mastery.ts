/**
 * Skill Mastery Score — derived per-skill view of learner mastery.
 *
 * PR-6 of p2a-ontology. Read-only projection of the existing 5D
 * dimension scores onto the P→V→S→D→R→A skill ontology. The 5D
 * scores remain canonical; this module never writes.
 *
 * Derivation rules
 *   1. If a skill declares measuredByDims, mastery = mean of those
 *      dim scores (0-100).
 *   2. Else if it declares measuredByQts, mastery = mean of
 *      predictCorrectness * 100 over those QTs.
 *   3. Else mastery is undefined (UI shows as "no signal").
 *
 * Layer aggregate = mean of defined skill masteries within the layer.
 */

import { loadSkillOntology, type SkillLayer, type SkillNode } from "./skill-ontology";
import { QUESTION_TYPES, predictCorrectness } from "./ontology";
import type { VocabDimension } from "./diagnostic";

export interface SkillMastery {
  skillId: string;
  layer: SkillLayer;
  /** 0-100. undefined when no measurable signal exists for this learner. */
  mastery: number | undefined;
  /** how many evidence points (dims + qts) contributed */
  evidenceCount: number;
}

export interface LayerMastery {
  layer: SkillLayer;
  /** 0-100, undefined when no measurable skill in the layer */
  mastery: number | undefined;
  /** skills with a defined mastery / total active skills in the layer */
  coverage: { measured: number; total: number };
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function computeSkillMastery(
  scores: Partial<Record<VocabDimension, number>>,
  node: SkillNode
): SkillMastery {
  const contributions: number[] = [];

  for (const dim of node.measuredByDims) {
    const v = scores[dim as VocabDimension];
    if (typeof v === "number") contributions.push(v);
  }

  if (contributions.length === 0) {
    for (const qtId of node.measuredByQts) {
      const qt = QUESTION_TYPES.find((q) => q.id === qtId);
      if (!qt) continue;
      // Skip QT fallback when learner has zero defined scores for the
      // dims this QT weighs — otherwise predictCorrectness returns 0,
      // which "no signal" can't be distinguished from genuine mastery=0.
      const hasAnyDimScore = (Object.keys(qt.weights) as VocabDimension[]).some(
        (d) => typeof scores[d] === "number"
      );
      if (!hasAnyDimScore) continue;
      contributions.push(predictCorrectness(scores, qt) * 100);
    }
  }

  return {
    skillId: node.id,
    layer: node.layer,
    mastery: contributions.length > 0 ? mean(contributions) : undefined,
    evidenceCount: contributions.length,
  };
}

export function computeAllSkillMasteries(
  scores: Partial<Record<VocabDimension, number>>
): SkillMastery[] {
  return loadSkillOntology()
    .nodes.filter((n) => n.mvpActive)
    .map((n) => computeSkillMastery(scores, n));
}

const LAYER_ORDER: SkillLayer[] = ["V", "S", "D", "R", "A"];

export function computeLayerMasteries(
  scores: Partial<Record<VocabDimension, number>>
): LayerMastery[] {
  const all = computeAllSkillMasteries(scores);
  return LAYER_ORDER.map((layer) => {
    const inLayer = all.filter((s) => s.layer === layer);
    const measured = inLayer.filter((s) => typeof s.mastery === "number");
    return {
      layer,
      mastery:
        measured.length > 0
          ? mean(measured.map((s) => s.mastery as number))
          : undefined,
      coverage: { measured: measured.length, total: inLayer.length },
    };
  });
}
