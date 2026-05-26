/**
 * Prompt Evolution — closes the feedback loop on content generation.
 *
 * PR-8 (final) of p2a-ontology. Rule-based MVP — no LLM call. Consumes a
 * batch of generator outputs together with their validator issues and
 * proposes structured diffs against the prompt template that produced
 * them. The proposed diffs are returned as data; this module never
 * mutates a template directly — that decision is left to the operator
 * (or PR-9 LLM-driven variant).
 *
 * Pipeline (manual trigger via scripts/prompt-iterate.mjs)
 *   1. Run content generator → batch of cards + ValidatorIssue[]
 *   2. analyseBatch(batch)              → IssueStatistics
 *   3. proposePromptAdjustments(stats)  → PromptDiff[]
 *   4. Operator reviews + applies (or files PR-9 to autom. with LLM)
 *
 * Why rule-based first
 *   - Deterministic — easy to test / dogfood-19 sentinel reproducible
 *   - 0 external cost / latency / vendor lock-in
 *   - Becomes the regression baseline for any future learned model
 */

import type { ValidatorIssue } from "./content-validators";
import type { VocabCard } from "./vocabulary-pool";
import type { ContentGeneratorResult } from "./content-generator";

export type IssueSeverity = "error" | "warning";

export interface IssueStatistics {
  totalCards: number;
  /** cards that produced ≥1 error */
  failedCards: number;
  failureRate: number; // 0-1
  /** count of each (code, severity) pair across the batch */
  countsByCode: Record<string, { error: number; warning: number }>;
  /** distinct issue codes ordered by descending error count */
  topIssueCodes: string[];
}

export interface PromptDiff {
  /** Which segment of the prompt template to edit. */
  segment:
    | "system"
    | "constraints"
    | "few_shot_examples"
    | "output_schema"
    | "post_validate";
  /** Short instruction the operator can paste into the prompt edit. */
  instruction: string;
  /** Issue code(s) that motivated this diff. */
  motivatingIssues: string[];
  /** Heuristic priority — higher first. */
  priority: number;
}

const FAILURE_RATE_TRIGGER = 0.15; // ≥15% of cards failing trips evolution
const MIN_ISSUES_FOR_DIFF = 3;

/** Compute statistics for a batch (multiple ContentGeneratorResult lumped together). */
export function analyseBatch(results: ContentGeneratorResult[]): IssueStatistics {
  const cards: VocabCard[] = results.flatMap((r) => r.cards);
  const issues: ValidatorIssue[] = results.flatMap((r) => r.issues);
  const totalCards = cards.length;

  const cardsWithError = new Set<number>();
  const countsByCode: Record<string, { error: number; warning: number }> = {};

  for (const iss of issues) {
    const bucket = countsByCode[iss.code] ?? { error: 0, warning: 0 };
    if (iss.severity === "error") {
      bucket.error += 1;
      cardsWithError.add(iss.cardIndex);
    } else if (iss.severity === "warning") {
      bucket.warning += 1;
    }
    countsByCode[iss.code] = bucket;
  }

  const topIssueCodes = Object.entries(countsByCode)
    .sort((a, b) => b[1].error - a[1].error)
    .map(([code]) => code);

  return {
    totalCards,
    failedCards: cardsWithError.size,
    failureRate: totalCards > 0 ? cardsWithError.size / totalCards : 0,
    countsByCode,
    topIssueCodes,
  };
}

/**
 * Map an issue code → a templated PromptDiff. The mapping is the rule-base
 * — every new validator code adds one entry here. Unknown codes fall through
 * to a generic "tighten output schema" diff so unhandled codes still produce
 * actionable output.
 */
const CODE_TO_DIFF: Record<
  string,
  Omit<PromptDiff, "motivatingIssues"> & { motivatingIssues?: string[] }
> = {
  "missing-translation": {
    segment: "constraints",
    instruction: "Always include a non-empty translation field — reject if blank.",
    priority: 90,
  },
  "duplicate-word": {
    segment: "constraints",
    instruction: "Each card must have a unique surface form within the batch.",
    priority: 80,
  },
  "invalid-difficulty": {
    segment: "output_schema",
    instruction: "difficulty must be an integer in [1, 5]; emit explicit example range.",
    priority: 70,
  },
  "wrong-dimension": {
    segment: "few_shot_examples",
    instruction:
      "Add 2 few-shot examples per target dimension and label each example's dimension explicitly.",
    priority: 85,
  },
  "off-topic": {
    segment: "system",
    instruction:
      "Restate the QT scope at the top of the system prompt; forbid out-of-scope tokens.",
    priority: 95,
  },
};

const GENERIC_DIFF: PromptDiff = {
  segment: "post_validate",
  instruction:
    "Run validator before emitting any card; on failure, regenerate up to 3x before yielding partial.",
  motivatingIssues: [],
  priority: 40,
};

export function proposePromptAdjustments(stats: IssueStatistics): PromptDiff[] {
  // Below the failure-rate trigger? No diffs proposed.
  if (stats.failureRate < FAILURE_RATE_TRIGGER) return [];
  if (Object.keys(stats.countsByCode).length === 0) return [];

  const diffs: PromptDiff[] = [];
  for (const code of stats.topIssueCodes) {
    const counts = stats.countsByCode[code];
    if (counts.error < MIN_ISSUES_FOR_DIFF) continue;
    const template = CODE_TO_DIFF[code];
    if (template) {
      diffs.push({
        segment: template.segment,
        instruction: template.instruction,
        motivatingIssues: [code],
        priority: template.priority,
      });
    }
  }

  // Always append the generic safety net once.
  diffs.push({ ...GENERIC_DIFF, motivatingIssues: stats.topIssueCodes.slice(0, 3) });

  diffs.sort((a, b) => b.priority - a.priority);
  return diffs;
}
