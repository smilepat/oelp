/**
 * keyVariable → VocabDimension mapping (C4.1 ground truth).
 *
 * Mirrors `smilepat/myprojects/docs/01-plan/dimension-mapping.md §3`.
 * Same logic also lives in scripts/synthetic-validation-c4-1.mjs — the
 * TS copy here is what UI components consume (e.g. declared vs derived
 * weight comparison on /map).
 *
 * Multi-mapping = even distribution. e.g. coherence_gap → D3 + D5 means
 * each variable contributes 1/2 to each dim.
 */

import type { VocabDimension } from "./diagnostic";

export const KV_DIM_MAPPING: Record<string, VocabDimension[]> = {
  coherence_gap: ["D3_Context", "D5_Usage"],
  coherence_disruption: ["D5_Usage", "D3_Context"],
  connective_density: ["D5_Usage"],
  discourse_marker_density: ["D5_Usage"],
  discourse_structure: ["D5_Usage", "D3_Context"],
  paragraph_dependency: ["D5_Usage", "D3_Context"],
  given_sentence_role: ["D5_Usage", "D3_Context"],
  topic_consistency: ["D3_Context"],
  topic_sentence_position: ["D3_Context"],
  purpose_indirectness: ["D3_Context"],
  emotional_indirectness: ["D3_Context", "D2_Meaning"],
  claim_explicitness: ["D3_Context"],
  topic_abstractness: ["D3_Context", "D4_Network"],
  title_abstractness: ["D4_Network", "D3_Context"],
  abstractness: ["D3_Context", "D4_Network"],
  context_clue: ["D3_Context"],
  argument_structure: ["D5_Usage", "D3_Context"],
  advanced_vocab: ["D2_Meaning", "D4_Network"],
  emotion_vocab_density: ["D2_Meaning"],
  metaphor_density: ["D4_Network"],
  text_type_variation: ["D5_Usage"],
};

const DIMS: VocabDimension[] = [
  "D1_Form",
  "D2_Meaning",
  "D3_Context",
  "D4_Network",
  "D5_Usage",
];

/**
 * Compute derived 5D weights for a QT given its keyVariables.
 *
 * Each kv contributes 1/N to each of its mapped dims (N = mapping count).
 * Result normalized to sum=1 over D2-D5 (D1=0 since no kv covers form).
 */
export function deriveWeightsFromKeyVariables(
  keyVariables: readonly string[]
): Record<VocabDimension, number> {
  const raw: Record<VocabDimension, number> = {
    D1_Form: 0,
    D2_Meaning: 0,
    D3_Context: 0,
    D4_Network: 0,
    D5_Usage: 0,
  };
  for (const kv of keyVariables) {
    const dims = KV_DIM_MAPPING[kv];
    if (!dims || dims.length === 0) continue;
    const share = 1 / dims.length;
    for (const d of dims) raw[d] += share;
  }
  const sum = DIMS.reduce((s, d) => s + raw[d], 0);
  if (sum === 0) {
    return raw; // nothing to derive
  }
  const normalized: Record<VocabDimension, number> = { ...raw };
  for (const d of DIMS) normalized[d] = raw[d] / sum;
  return normalized;
}

/**
 * Compare declared weights (from ontology-weights.json) with derived
 * weights (from keyVariables). Returns per-dim diff + contradiction flags.
 *
 * Contradiction rules (mirrors synthetic-validation-c4-1.mjs):
 *   declared ≥ 0.2 AND derived = 0    → "declared-over"
 *   declared < 0.05 AND derived ≥ 0.2 → "declared-under"
 */
export interface WeightComparison {
  dim: VocabDimension;
  declared: number;
  derived: number;
  contradiction: "declared-over" | "declared-under" | null;
}

export function compareWeights(
  declared: Record<VocabDimension, number>,
  keyVariables: readonly string[]
): WeightComparison[] {
  const derived = deriveWeightsFromKeyVariables(keyVariables);
  return DIMS.map((d) => {
    const dec = declared[d] ?? 0;
    const der = derived[d] ?? 0;
    let contradiction: WeightComparison["contradiction"] = null;
    if (dec >= 0.2 && der === 0) contradiction = "declared-over";
    else if (dec < 0.05 && der >= 0.2) contradiction = "declared-under";
    return { dim: d, declared: dec, derived: der, contradiction };
  });
}
