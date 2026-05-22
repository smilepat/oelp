/**
 * F3 Learning Queue rule engine.
 *
 * Phase 1 contract (PRD §B-4):
 *   1. Pick weakest QuestionType (predictCorrectness ascending)
 *   2. Look up that QuestionType's dominant dimensions (top 2 by weight)
 *   3. Pick 10 vocab items whose dimension matches + IRT b in [theta-0.4, theta+0.4]
 *   4. (Future) attach 1 passage matched by topic + difficulty
 *
 * Real data wiring (Phase 1 W3-5+):
 *   - vocabulary-db (9183 items) via /api or SQLite mount
 *   - csat-text-master (50 passages) via /api
 * For now this file uses STUB_POOL — small synthetic set sufficient to wire UI.
 */

import type { DiagnosticInput, VocabDimension } from "./diagnostic";
import { QUESTION_TYPES, predictCorrectness, type QuestionType } from "./ontology";

export interface VocabCard {
  itemId: string;
  word: string;
  pos: string;
  cefr: string;
  dimension: VocabDimension;
  /** IRT b parameter — item difficulty */
  difficulty: number;
  meaningKo: string;
  questionText: string;
  options: string[]; // length 4
  /** 0-based index into options */
  answerIdx: number;
  rationaleKo: string;
}

/**
 * Synthetic pool for Phase 1 scaffold.
 * Each dimension gets 6 items spanning b = -1.0 to +1.0.
 * Real implementation will replace with vocabulary-db query.
 */
const STUB_POOL: VocabCard[] = buildStubPool();

function buildStubPool(): VocabCard[] {
  const seeds: Array<{
    word: string;
    pos: string;
    cefr: string;
    ko: string;
    dimension: VocabDimension;
    opts: [string, string, string, string];
    ans: number;
  }> = [
    // D1_Form — spelling/phonics
    { word: "psychology", pos: "n.", cefr: "B2", ko: "심리학", dimension: "D1_Form", opts: ["psicology", "psychology", "psicology", "psychology"], ans: 1 },
    { word: "rhythm", pos: "n.", cefr: "B1", ko: "리듬", dimension: "D1_Form", opts: ["rythm", "rhythm", "rhytm", "rhythme"], ans: 1 },
    { word: "necessary", pos: "adj.", cefr: "B1", ko: "필요한", dimension: "D1_Form", opts: ["neccessary", "necesary", "necessary", "necessery"], ans: 2 },
    // D2_Meaning — core translation
    { word: "intricate", pos: "adj.", cefr: "C1", ko: "복잡한", dimension: "D2_Meaning", opts: ["단순한", "복잡한", "명확한", "광범위한"], ans: 1 },
    { word: "alleviate", pos: "v.", cefr: "B2", ko: "완화하다", dimension: "D2_Meaning", opts: ["악화시키다", "완화하다", "증가시키다", "유지하다"], ans: 1 },
    { word: "scrutinize", pos: "v.", cefr: "C1", ko: "면밀히 조사하다", dimension: "D2_Meaning", opts: ["면밀히 조사하다", "대략 살펴보다", "무시하다", "기록하다"], ans: 0 },
    // D3_Context — inference in context
    { word: "ostensible", pos: "adj.", cefr: "C1", ko: "표면상의", dimension: "D3_Context", opts: ["실제의", "표면상의", "숨겨진", "공식적인"], ans: 1 },
    { word: "underscore", pos: "v.", cefr: "B2", ko: "강조하다", dimension: "D3_Context", opts: ["반박하다", "무시하다", "강조하다", "수정하다"], ans: 2 },
    { word: "tantamount", pos: "adj.", cefr: "C1", ko: "~와 다름없는", dimension: "D3_Context", opts: ["~보다 큰", "~와 다름없는", "~와 다른", "~의 일부인"], ans: 1 },
    // D4_Network — synonyms/derivatives
    { word: "rigorous", pos: "adj.", cefr: "B2", ko: "엄격한", dimension: "D4_Network", opts: ["lenient", "rigid", "casual", "soft"], ans: 1 },
    { word: "augment", pos: "v.", cefr: "B2", ko: "증대시키다", dimension: "D4_Network", opts: ["reduce", "ignore", "increase", "maintain"], ans: 2 },
    { word: "veracity", pos: "n.", cefr: "C1", ko: "진실성", dimension: "D4_Network", opts: ["truthfulness", "speed", "vagueness", "complexity"], ans: 0 },
    // D5_Usage — collocation/grammar
    { word: "adhere", pos: "v.", cefr: "B2", ko: "고수하다", dimension: "D5_Usage", opts: ["adhere with", "adhere on", "adhere to", "adhere of"], ans: 2 },
    { word: "consist", pos: "v.", cefr: "B1", ko: "구성되다", dimension: "D5_Usage", opts: ["consist of", "consist with", "consist in", "consist by"], ans: 0 },
    { word: "comply", pos: "v.", cefr: "B2", ko: "준수하다", dimension: "D5_Usage", opts: ["comply for", "comply with", "comply on", "comply at"], ans: 1 },
  ];

  return seeds.flatMap((s, i) => {
    // Generate 2 variants per seed (b = -0.5 and +0.5 relative to base 0)
    return [-0.5, 0.5].map((bOffset, j) => ({
      itemId: `stub-${i}-${j}`,
      word: s.word,
      pos: s.pos,
      cefr: s.cefr,
      dimension: s.dimension,
      difficulty: bOffset + (s.cefr === "C1" ? 0.5 : s.cefr === "B2" ? 0.2 : 0),
      meaningKo: s.ko,
      questionText: variantQuestion(s.dimension, s.word, j),
      options: s.opts,
      answerIdx: s.ans,
      rationaleKo: `${s.word}: ${s.ko}.`,
    }));
  });
}

function variantQuestion(dim: VocabDimension, word: string, variant: number): string {
  switch (dim) {
    case "D1_Form":
      return `다음 중 올바른 철자는?`;
    case "D2_Meaning":
      return `"${word}"의 의미로 가장 적절한 것은?`;
    case "D3_Context":
      return `다음 문장의 맥락에서 "${word}"의 의미로 가장 적절한 것은?`;
    case "D4_Network":
      return `"${word}"와 가장 유사한 의미의 단어는?`;
    case "D5_Usage":
      return `다음 중 "${word}"의 올바른 사용은?` + (variant ? "" : "");
    default:
      return `${word}?`;
  }
}

// ─── Queue selection ──────────────────────────────────────────────

export interface QueuePlan {
  /** Targeted weakest QuestionType */
  targetQuestionType: QuestionType;
  /** Predicted correctness (0-1) on that type — lower = weaker */
  predictedCorrectness: number;
  /** Dimensions chosen (top 2 by weight in the target QT) */
  targetDimensions: VocabDimension[];
  /** The vocab cards selected (length = sessionSize, may be < if pool exhausted) */
  cards: VocabCard[];
}

export interface QueueOpts {
  sessionSize?: number;
  /** Width of IRT b window around theta */
  difficultyHalfWidth?: number;
}

/**
 * Build a learning queue from a diagnostic.
 * Deterministic given (diagnostic + RNG seed if shuffled).
 */
export function buildQueue(
  diag: DiagnosticInput,
  opts: QueueOpts = {}
): QueuePlan {
  const sessionSize = opts.sessionSize ?? 10;
  const halfWidth = opts.difficultyHalfWidth ?? 0.4;

  // 1. Weakest QuestionType
  const ranked = QUESTION_TYPES.map((qt) => ({
    qt,
    p: predictCorrectness(diag.dimensionScores, qt),
  })).sort((a, b) => a.p - b.p);
  const target = ranked[0];

  // 2. Top-2 dimensions by weight
  const dimsRanked = (Object.entries(target.qt.weights) as Array<[VocabDimension, number]>)
    .sort((a, b) => b[1] - a[1])
    .map(([d]) => d);
  const targetDims = dimsRanked.slice(0, 2);

  // 3. Filter pool by dimension + difficulty window
  const bMin = diag.theta - halfWidth;
  const bMax = diag.theta + halfWidth;
  let candidates = STUB_POOL.filter(
    (c) =>
      targetDims.includes(c.dimension) && c.difficulty >= bMin && c.difficulty <= bMax
  );

  // Window expansion if too few (recursive fallback) — keep simple, single retry
  if (candidates.length < sessionSize) {
    const wider = STUB_POOL.filter(
      (c) =>
        targetDims.includes(c.dimension) &&
        c.difficulty >= bMin - 0.6 &&
        c.difficulty <= bMax + 0.6
    );
    candidates = wider;
  }

  // 4. Balanced by dimension, deterministic order (sorted by difficulty)
  const cards: VocabCard[] = [];
  for (const dim of targetDims) {
    const dimCards = candidates
      .filter((c) => c.dimension === dim)
      .sort((a, b) => a.difficulty - b.difficulty)
      .slice(0, Math.ceil(sessionSize / targetDims.length));
    cards.push(...dimCards);
  }

  return {
    targetQuestionType: target.qt,
    predictedCorrectness: target.p,
    targetDimensions: targetDims,
    cards: cards.slice(0, sessionSize),
  };
}

/**
 * Returns the unique dimensions present in a queue (for summary display).
 */
export function dimensionsInQueue(cards: VocabCard[]): VocabDimension[] {
  return Array.from(new Set(cards.map((c) => c.dimension)));
}
