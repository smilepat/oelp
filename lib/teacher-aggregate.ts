/**
 * Class-level skill aggregates for the /teacher dashboard (PR-3.7).
 *
 * Pure derived module — applies lib/skill-mastery.ts per learner, then
 * rolls up per skill / per layer / class-wide. No mutation.
 */

import type { VocabDimension } from "./diagnostic";
import { computeAllSkillMasteries, type SkillMastery } from "./skill-mastery";
import { loadSkillOntology, type SkillLayer, type SkillNode } from "./skill-ontology";

export interface LearnerInput {
  id: string;
  label: string;
  scores: Partial<Record<VocabDimension, number>>;
}

export interface SkillClassCell {
  learnerId: string;
  skillId: string;
  /** 0-100 mastery, or null when no signal */
  mastery: number | null;
}

export interface SkillClassRow {
  skill: SkillNode;
  perLearner: Record<string, number | null>; // learnerId → mastery or null
  classMean: number | null;
  classMin: number | null;
  classMax: number | null;
  measuredCount: number;
}

export interface LayerClassRow {
  layer: SkillLayer;
  classMean: number | null;
  classMin: number | null;
  classMax: number | null;
  measuredLearners: number; // learners with ≥1 measured skill in this layer
}

export function computeSkillClassRows(learners: LearnerInput[]): SkillClassRow[] {
  const ontology = loadSkillOntology();
  const masteriesPerLearner = new Map<string, SkillMastery[]>();
  for (const l of learners) {
    masteriesPerLearner.set(l.id, computeAllSkillMasteries(l.scores));
  }

  return ontology.nodes
    .filter((n) => n.mvpActive)
    .map<SkillClassRow>((skill) => {
      const perLearner: Record<string, number | null> = {};
      const defined: number[] = [];
      for (const l of learners) {
        const m = masteriesPerLearner.get(l.id)?.find((s) => s.skillId === skill.id);
        const value = typeof m?.mastery === "number" ? m.mastery : null;
        perLearner[l.id] = value;
        if (value !== null) defined.push(value);
      }
      const classMean = defined.length > 0 ? defined.reduce((s, v) => s + v, 0) / defined.length : null;
      const classMin = defined.length > 0 ? Math.min(...defined) : null;
      const classMax = defined.length > 0 ? Math.max(...defined) : null;
      return {
        skill,
        perLearner,
        classMean,
        classMin,
        classMax,
        measuredCount: defined.length,
      };
    });
}

const LAYER_ORDER: SkillLayer[] = ["V", "S", "D", "R", "A"];

export function computeLayerClassRows(learners: LearnerInput[]): LayerClassRow[] {
  const skillRows = computeSkillClassRows(learners);
  return LAYER_ORDER.map((layer) => {
    const inLayer = skillRows.filter((r) => r.skill.layer === layer);
    const perLearnerSum = new Map<string, { sum: number; count: number }>();
    for (const r of inLayer) {
      for (const [learnerId, m] of Object.entries(r.perLearner)) {
        if (m === null) continue;
        const acc = perLearnerSum.get(learnerId) ?? { sum: 0, count: 0 };
        acc.sum += m;
        acc.count += 1;
        perLearnerSum.set(learnerId, acc);
      }
    }
    const learnerLayerMeans: number[] = [];
    for (const { sum, count } of perLearnerSum.values()) {
      if (count > 0) learnerLayerMeans.push(sum / count);
    }
    if (learnerLayerMeans.length === 0) {
      return { layer, classMean: null, classMin: null, classMax: null, measuredLearners: 0 };
    }
    return {
      layer,
      classMean: learnerLayerMeans.reduce((s, v) => s + v, 0) / learnerLayerMeans.length,
      classMin: Math.min(...learnerLayerMeans),
      classMax: Math.max(...learnerLayerMeans),
      measuredLearners: learnerLayerMeans.length,
    };
  });
}

/** Top-K skills with the lowest class mean (the worst class-wide weak spots). */
export function topClassWeaknesses(learners: LearnerInput[], k: number = 5): SkillClassRow[] {
  return computeSkillClassRows(learners)
    .filter((r) => r.classMean !== null)
    .sort((a, b) => (a.classMean as number) - (b.classMean as number))
    .slice(0, k);
}
