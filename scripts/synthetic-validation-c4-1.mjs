#!/usr/bin/env node
/**
 * C4.1 — Synthetic validation of dimension-mapping.md §2 weights.
 *
 * Method:
 *   1. Each QuestionType has a small set of `keyVariables` (ground truth from
 *      csat-graphdb-318/src/domains/csat/graph/csat-schema.ts).
 *   2. Classify each unique keyVariable into one or more of the 5 dimensions
 *      via a hand-coded semantic mapping (explicit, auditable).
 *   3. For each QuestionType derive a normalized weight vector from its
 *      keyVariables. Compare to declared weights via:
 *        - Domain contradiction count: cells where declared >= 0.2 but derived
 *          contribution = 0, AND vice versa.
 *        - Kendall tau between declared dimension rank and derived rank, per QT.
 *   4. Report aggregates + per-QT detail.
 *
 * Output: stdout markdown to be redirected to a file.
 *
 * Pass criterion (PRD §B-5 C4.1):
 *   - Kendall tau >= 0.4 (median across QTs)
 *   - 0 domain contradictions
 */

// Inlined from lib/ontology.ts to avoid TS loader requirement.
// Source of truth: lib/ontology.ts (which is itself sourced from
// csat-graphdb-318/src/domains/csat/graph/csat-schema.ts).
const QUESTION_TYPES = [
  // v2 (2026-05-22 calibration after C4.1 v1 FAIL)
  { id: "TYPE-목적", name: "목적 파악", keyVariables: ["purpose_indirectness", "text_type_variation"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.1, D5_Usage: 0.25 } },
  { id: "TYPE-심경", name: "심경·분위기", keyVariables: ["emotional_indirectness", "emotion_vocab_density"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.35, D3_Context: 0.4, D4_Network: 0.1, D5_Usage: 0.1 } },
  { id: "TYPE-주장", name: "필자 주장", keyVariables: ["claim_explicitness", "argument_structure"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.2 } },
  { id: "TYPE-요지", name: "요지 파악", keyVariables: ["topic_abstractness", "topic_sentence_position"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.25, D5_Usage: 0.1 } },
  { id: "TYPE-주제", name: "주제 파악", keyVariables: ["topic_abstractness", "topic_sentence_position", "advanced_vocab"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.25, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.05 } },
  { id: "TYPE-제목", name: "제목 추론", keyVariables: ["title_abstractness", "metaphor_density"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.35, D4_Network: 0.4, D5_Usage: 0.1 } },
  { id: "TYPE-빈칸추론", name: "빈칸 추론", keyVariables: ["coherence_gap", "abstractness", "context_clue", "advanced_vocab"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.2, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.1 } },
  { id: "TYPE-흐름무관", name: "흐름무관 문장", keyVariables: ["coherence_disruption", "topic_consistency"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.15 } },
  { id: "TYPE-순서배열", name: "순서 배열", keyVariables: ["paragraph_dependency", "discourse_marker_density", "discourse_structure"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.3 } },
  { id: "TYPE-문장삽입", name: "문장 삽입", keyVariables: ["coherence_disruption", "connective_density", "given_sentence_role"],
    weights: { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.25 } },
];

// ─── 1. Semantic mapping: keyVariable → dimension contributions ──────
// Auditable, hand-coded. Each variable contributes 1.0 distributed across
// the listed dimensions (equal split if multiple).
const KV_TO_DIMS = {
  // discourse / cohesion → D5_Usage primarily
  coherence_gap: ["D3_Context", "D5_Usage"],
  coherence_disruption: ["D5_Usage", "D3_Context"],
  connective_density: ["D5_Usage"],
  discourse_marker_density: ["D5_Usage"],
  discourse_structure: ["D5_Usage", "D3_Context"],
  paragraph_dependency: ["D5_Usage", "D3_Context"],
  given_sentence_role: ["D5_Usage", "D3_Context"],
  topic_consistency: ["D3_Context"],
  topic_sentence_position: ["D3_Context"],

  // inference / abstractness → D3_Context primarily
  purpose_indirectness: ["D3_Context"],
  emotional_indirectness: ["D3_Context", "D2_Meaning"],
  claim_explicitness: ["D3_Context"],
  topic_abstractness: ["D3_Context", "D4_Network"],
  title_abstractness: ["D4_Network", "D3_Context"],
  abstractness: ["D3_Context", "D4_Network"],
  context_clue: ["D3_Context"],
  argument_structure: ["D5_Usage", "D3_Context"],

  // vocab nature → D2_Meaning / D4_Network
  advanced_vocab: ["D2_Meaning", "D4_Network"],
  emotion_vocab_density: ["D2_Meaning"],
  metaphor_density: ["D4_Network"],

  // text type
  text_type_variation: ["D5_Usage"],
};

const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

// ─── 2. Build derived weights per QuestionType ────────────────────
function derivedWeights(qt) {
  const acc = { D1_Form: 0, D2_Meaning: 0, D3_Context: 0, D4_Network: 0, D5_Usage: 0 };
  for (const kv of qt.keyVariables) {
    const dims = KV_TO_DIMS[kv];
    if (!dims) {
      console.error(`WARN: keyVariable not classified: ${kv} (in ${qt.id})`);
      continue;
    }
    const each = 1 / dims.length;
    for (const d of dims) acc[d] += each;
  }
  // normalize so sum = 1.0
  const total = DIMS.reduce((s, d) => s + acc[d], 0);
  if (total === 0) return acc;
  for (const d of DIMS) acc[d] = acc[d] / total;
  return acc;
}

// ─── 3. Kendall tau between declared and derived ranks ───────────
function rank(values) {
  const sorted = [...values.entries()].sort((a, b) => b[1] - a[1]);
  const ranks = new Map();
  sorted.forEach(([i], r) => ranks.set(i, r));
  return [...ranks.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

function kendallTau(declared, derived) {
  const xs = DIMS.map((d) => declared[d]);
  const ys = DIMS.map((d) => derived[d]);
  const rx = rank(xs);
  const ry = rank(ys);
  const n = rx.length;
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = Math.sign(rx[i] - rx[j]);
      const dy = Math.sign(ry[i] - ry[j]);
      if (dx === dy) concordant++;
      else if (dx === -dy) discordant++;
    }
  }
  const pairs = (n * (n - 1)) / 2;
  return pairs === 0 ? 0 : (concordant - discordant) / pairs;
}

// ─── 4. Detect domain contradictions ─────────────────────────────
function contradictions(declared, derived, threshold = 0.2) {
  const hits = [];
  for (const d of DIMS) {
    if (declared[d] >= threshold && derived[d] === 0) {
      hits.push({ dim: d, kind: "declared-no-evidence", declared: declared[d], derived: derived[d] });
    }
    if (derived[d] >= threshold && declared[d] < 0.05) {
      hits.push({ dim: d, kind: "evidence-not-declared", declared: declared[d], derived: derived[d] });
    }
  }
  return hits;
}

// ─── 5. Compose markdown report ──────────────────────────────────
function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pct(n) {
  return (n * 100).toFixed(0) + "%";
}

const rows = QUESTION_TYPES.map((qt) => {
  const declared = qt.weights;
  const derived = derivedWeights(qt);
  const tau = kendallTau(declared, derived);
  const cons = contradictions(declared, derived);
  return { qt, declared, derived, tau, contradictions: cons };
});

const taus = rows.map((r) => r.tau);
const taumed = median(taus);
const taumin = Math.min(...taus);
const taumax = Math.max(...taus);
const totalContradictions = rows.reduce((s, r) => s + r.contradictions.length, 0);

console.log("# C4.1 합성 검증 결과 — keyVariable 분포 vs §2 가중치");
console.log("");
console.log("> 실행: " + new Date().toISOString() + " · 출처: smilepat/oelp/scripts/synthetic-validation-c4-1.mjs");
console.log("> 기준: [PRD §B-5 C4.1](../01-plan/prd-oelp-mvp-phase1.md) · [dimension-mapping §2](../01-plan/dimension-mapping.md)");
console.log("");
console.log("## 0. 종합 결과");
console.log("");
console.log(`- **Kendall tau (median)**: ${taumed.toFixed(3)} → ${taumed >= 0.4 ? "✅ PASS (≥0.4)" : "❌ FAIL"}`);
console.log(`- Tau range: ${taumin.toFixed(3)} ~ ${taumax.toFixed(3)}`);
console.log(`- **도메인 모순 (50셀 중)**: ${totalContradictions} → ${totalContradictions === 0 ? "✅ PASS (0건)" : "❌ FAIL"}`);
console.log("");
console.log(`**최종 판정**: ${taumed >= 0.4 && totalContradictions === 0 ? "PASS — Phase 2 P-1 (Recommendation v2) 진행 가능" : "FAIL — dimension-mapping §2 가중치 재산정 필요"}`);
console.log("");
console.log("---");
console.log("");
console.log("## 1. QuestionType별 비교표");
console.log("");
console.log("| QT | tau | 모순수 | D1 (decl/derv) | D2 | D3 | D4 | D5 |");
console.log("|---|---:|---:|---|---|---|---|---|");
for (const r of rows) {
  const ds = (d) => `${pct(r.declared[d])} / ${pct(r.derived[d])}`;
  console.log(`| ${r.qt.name} | ${r.tau.toFixed(2)} | ${r.contradictions.length} | ${ds("D1_Form")} | ${ds("D2_Meaning")} | ${ds("D3_Context")} | ${ds("D4_Network")} | ${ds("D5_Usage")} |`);
}
console.log("");
console.log("범례: 셀은 `declared / derived`. declared = §2 휴리스틱, derived = keyVariables 의미 매핑 기반.");
console.log("");
console.log("## 2. 도메인 모순 상세");
console.log("");
if (totalContradictions === 0) {
  console.log("**없음.** 모든 QT에서 declared ≥0.2 차원은 keyVariable에 의해 뒷받침되며, 그 반대도 성립.");
} else {
  for (const r of rows) {
    if (r.contradictions.length === 0) continue;
    console.log(`### ${r.qt.name} (${r.qt.id})`);
    console.log("");
    for (const c of r.contradictions) {
      const dn = c.dim.replace("_", " ");
      if (c.kind === "declared-no-evidence") {
        console.log(`- ⚠️ **${dn}**: 선언 ${pct(c.declared)}이지만 keyVariables에서 근거 없음`);
      } else {
        console.log(`- ⚠️ **${dn}**: keyVariables 기반 ${pct(c.derived)}이지만 선언 ${pct(c.declared)} (저평가)`);
      }
    }
    console.log("");
  }
}
console.log("");
console.log("## 3. keyVariable 의미 매핑 (auditable)");
console.log("");
console.log("본 검증의 핵심 가정. 변경 시 결과 변동.");
console.log("");
console.log("| keyVariable | 매핑 차원 (균등 분배) |");
console.log("|---|---|");
for (const [kv, dims] of Object.entries(KV_TO_DIMS)) {
  console.log(`| \`${kv}\` | ${dims.join(", ")} |`);
}
console.log("");
console.log("## 4. 방법론");
console.log("");
console.log("1. 각 QT의 keyVariables를 §3 매핑 표로 차원에 분배 (한 변수가 N차원 → 각 1/N 기여).");
console.log("2. 합을 1로 normalize → derived weight vector.");
console.log("3. declared vs derived 두 벡터의 차원 순위(rank) 비교 → Kendall tau.");
console.log("4. 도메인 모순: declared ≥0.2 인데 derived=0 (선언만 있고 증거 없음) OR derived ≥0.2 인데 declared <0.05 (증거 있는데 저평가).");
console.log("5. D1_Form(0.05 균일)은 모든 QT에서 동일하게 무관하다는 가정 — keyVariables가 form/spelling을 다루지 않으므로 derived=0. 본 검증에서는 D1을 사실상 무시.");
