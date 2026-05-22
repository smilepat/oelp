#!/usr/bin/env node
/**
 * C4.2 — Learning Queue diversity validation.
 *
 * Goal (PRD §B-5 C4.2): theta ±0.4 sampling 시 10단어 큐가 다양성 확보 —
 *   lemma overlap < 30% across multiple queue builds for similar diagnostic inputs.
 *
 * Method:
 *   1. Generate 5 similar DiagnosticInputs (same level, ±0.1 theta jitter,
 *      same weakDim) — simulating "본인이 비슷한 컨디션에서 5회 진단" scenario.
 *   2. For each, run buildQueue() (rule engine in lib/queue.ts).
 *   3. Measure lemma overlap between consecutive queues (Jaccard index).
 *   4. Pass criterion: median Jaccard overlap < 0.30 (i.e., > 70% unique words across runs).
 *
 * Limitation: Currently uses STUB_POOL (30 cards). Real validation requires
 * vocabulary-db mount (~9,183 words). Report explicitly flags this scope.
 *
 * Output: markdown report to stdout.
 */

// ─── Mirror lib/ontology.ts QUESTION_TYPES (v2 calibrated) ────────

const QUESTION_TYPES = [
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

const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

// ─── Mirror lib/queue.ts STUB_POOL (15 seeds × 2 difficulty variants) ─

const SEEDS = [
  { word: "psychology", dimension: "D1_Form", cefr: "B2" },
  { word: "rhythm", dimension: "D1_Form", cefr: "B1" },
  { word: "necessary", dimension: "D1_Form", cefr: "B1" },
  { word: "intricate", dimension: "D2_Meaning", cefr: "C1" },
  { word: "alleviate", dimension: "D2_Meaning", cefr: "B2" },
  { word: "scrutinize", dimension: "D2_Meaning", cefr: "C1" },
  { word: "ostensible", dimension: "D3_Context", cefr: "C1" },
  { word: "underscore", dimension: "D3_Context", cefr: "B2" },
  { word: "tantamount", dimension: "D3_Context", cefr: "C1" },
  { word: "rigorous", dimension: "D4_Network", cefr: "B2" },
  { word: "augment", dimension: "D4_Network", cefr: "B2" },
  { word: "veracity", dimension: "D4_Network", cefr: "C1" },
  { word: "adhere", dimension: "D5_Usage", cefr: "B2" },
  { word: "consist", dimension: "D5_Usage", cefr: "B1" },
  { word: "comply", dimension: "D5_Usage", cefr: "B2" },
];

function cefrOffset(cefr) {
  if (cefr === "C1") return 0.5;
  if (cefr === "B2") return 0.2;
  return 0;
}

const STUB_POOL = SEEDS.flatMap((s, i) =>
  [-0.5, 0.5].map((bOffset, j) => ({
    itemId: `stub-${i}-${j}`,
    word: s.word,
    dimension: s.dimension,
    cefr: s.cefr,
    difficulty: bOffset + cefrOffset(s.cefr),
  }))
);

function predictCorrectness(scores, qt) {
  let sum = 0;
  for (const d of DIMS) sum += qt.weights[d] * ((scores[d] ?? 0) / 100);
  return sum;
}

function buildQueue(diag, opts = {}) {
  const sessionSize = opts.sessionSize ?? 10;
  const halfWidth = opts.difficultyHalfWidth ?? 0.4;
  const ranked = QUESTION_TYPES.map((qt) => ({
    qt,
    p: predictCorrectness(diag.dimensionScores, qt),
  })).sort((a, b) => a.p - b.p);
  const target = ranked[0];
  const dimsRanked = Object.entries(target.qt.weights).sort((a, b) => b[1] - a[1]).map(([d]) => d);
  const targetDims = dimsRanked.slice(0, 2);

  const bMin = diag.theta - halfWidth;
  const bMax = diag.theta + halfWidth;
  let candidates = STUB_POOL.filter(
    (c) => targetDims.includes(c.dimension) && c.difficulty >= bMin && c.difficulty <= bMax
  );
  if (candidates.length < sessionSize) {
    candidates = STUB_POOL.filter(
      (c) =>
        targetDims.includes(c.dimension) &&
        c.difficulty >= bMin - 0.6 &&
        c.difficulty <= bMax + 0.6
    );
  }
  const cards = [];
  for (const dim of targetDims) {
    const dimCards = candidates
      .filter((c) => c.dimension === dim)
      .sort((a, b) => a.difficulty - b.difficulty)
      .slice(0, Math.ceil(sessionSize / targetDims.length));
    cards.push(...dimCards);
  }
  return { targetQT: target.qt.name, targetDims, cards: cards.slice(0, sessionSize) };
}

// ─── Generate 5 jittered diagnostics ───────────────────────────────

const BASE_DIAG = {
  studentName: "P0 (jittered)",
  level: 5,
  cefr: "B2",
  weakDim: ["D3_Context", "D4_Network"],
  strongDim: ["D2_Meaning", "D1_Form"],
};

const RUNS = [-0.2, -0.1, 0.0, 0.1, 0.2].map((jitter, i) => ({
  ...BASE_DIAG,
  theta: 0.3 + jitter,
  dimensionScores: {
    D1_Form: 78 + i * 2,
    D2_Meaning: 82 - i,
    D3_Context: 45 + jitter * 10,
    D4_Network: 60 + jitter * 5,
    D5_Usage: 71,
  },
  timestamp: `2026-05-${10 + i}T09:00:00.000Z`,
}));

const queues = RUNS.map((d, i) => {
  const q = buildQueue(d);
  return {
    runIdx: i,
    theta: d.theta.toFixed(2),
    targetQT: q.targetQT,
    targetDims: q.targetDims,
    lemmas: new Set(q.cards.map((c) => c.word)),
    cardCount: q.cards.length,
  };
});

// ─── Pairwise Jaccard overlap ──────────────────────────────────────

function jaccard(a, b) {
  const intersect = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersect / union;
}

const pairs = [];
for (let i = 0; i < queues.length; i++) {
  for (let j = i + 1; j < queues.length; j++) {
    pairs.push({
      i: queues[i].runIdx,
      j: queues[j].runIdx,
      jaccard: jaccard(queues[i].lemmas, queues[j].lemmas),
    });
  }
}

const jaccs = pairs.map((p) => p.jaccard).sort((a, b) => a - b);
const median = jaccs[Math.floor(jaccs.length / 2)];
const max = Math.max(...jaccs);
const min = Math.min(...jaccs);

const PASS_THRESHOLD = 0.3;
const passed = median < PASS_THRESHOLD;

// ─── Unique lemma analysis across all runs ─────────────────────────

const allLemmas = new Set();
for (const q of queues) for (const l of q.lemmas) allLemmas.add(l);
const totalCards = queues.reduce((s, q) => s + q.cardCount, 0);
const uniqueRatio = allLemmas.size / totalCards;

// ─── Markdown output ──────────────────────────────────────────────

function pct(n) {
  return (n * 100).toFixed(1) + "%";
}

console.log("# C4.2 합성 검증 결과 — 학습 큐 다양성 (lemma overlap)");
console.log("");
console.log("> 실행: " + new Date().toISOString() + " · 출처: smilepat/oelp/scripts/c4-2-diversity.mjs");
console.log("> 기준: [PRD §B-5 C4.2](../01-plan/prd-oelp-mvp-phase1.md)");
console.log("");
console.log("## 0. 종합 결과");
console.log("");
console.log(`- **Pairwise Jaccard median**: ${pct(median)} (목표 < ${pct(PASS_THRESHOLD)}) → ${passed ? "✅ PASS" : "❌ FAIL"}`);
console.log(`- Jaccard range: ${pct(min)} ~ ${pct(max)}`);
console.log(`- 5회 큐 누적 unique lemma: ${allLemmas.size} / ${totalCards} (${pct(uniqueRatio)})`);
console.log("");
console.log(`**최종 판정**: ${passed ? "PASS (STUB_POOL scope)" : "FAIL"} — 실제 vocabulary-db (9,183 어휘) 마운트 후 재검증 권장`);
console.log("");
console.log("## ⚠️ Scope 한계");
console.log("");
console.log(`본 검증은 \`STUB_POOL\` 30 카드 (15 lemma × 2 difficulty)에서 실행됨. 실제 vocabulary-db는 9,183 어휘이므로 다양성 잠재력이 ${Math.round(9183 / 15)}배 큼. 본 결과는 \"룰엔진의 다양성 보장 메커니즘이 작동하는지\"의 scaffold-level 확인이며, 실제 다양성 수치는 vocabulary-db 마운트 후 의미 있음.`);
console.log("");
console.log("---");
console.log("");
console.log("## 1. 5회 큐 상세");
console.log("");
console.log("| Run | theta | targetQT | targetDims | cards | unique lemmas |");
console.log("|---:|---:|---|---|---:|---:|");
for (const q of queues) {
  console.log(`| ${q.runIdx} | ${q.theta} | ${q.targetQT} | ${q.targetDims.join(", ")} | ${q.cardCount} | ${q.lemmas.size} |`);
}
console.log("");
console.log("## 2. Pairwise Jaccard overlap");
console.log("");
console.log("| Run A | Run B | Jaccard |");
console.log("|---:|---:|---:|");
for (const p of pairs) {
  console.log(`| ${p.i} | ${p.j} | ${pct(p.jaccard)} |`);
}
console.log("");
console.log("## 3. 방법론");
console.log("");
console.log("- 5회 jittered diagnostics: theta ±0.2 shift, dimensionScores ±2 jitter (같은 컨디션 가정).");
console.log("- 각 회 `buildQueue()` 호출 → 10 카드 묶음.");
console.log("- Jaccard(A, B) = |A∩B| / |A∪B| (단어 단위, itemId 아님).");
console.log("- 통과 기준: median Jaccard < 0.30 (즉 평균 70% 이상의 카드가 다름).");
console.log("- 한계: STUB_POOL 풀 크기(30)가 너무 작아 잠재 overlap 상한이 높음. 실제 vocabulary-db에서 재실행 필요.");
