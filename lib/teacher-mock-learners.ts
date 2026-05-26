/**
 * Mock learner cohort for the /teacher dashboard (PR-3.7 of p2a-ontology).
 *
 * The /teacher route lights up only when ≥3 real learner accounts exist
 * in session-store. Until then, this module supplies 5 synthetic learner
 * profiles so the UI can be developed, reviewed, and A11y-tested without
 * blocking on external data collection.
 *
 * Each profile is intentionally archetypal — matching the synthetic
 * archetypes used by dogfood-9 (low_voc / weak_struct / low_disc / etc.)
 * so the heatmap visibly differentiates them.
 *
 * Replace by reading from a multi-user session storage once the
 * Stage C learner channel (≥3 users) is active.
 */

import type { VocabDimension } from "./diagnostic";

export interface TeacherLearnerProfile {
  /** Stable id — anonymous display label */
  id: string;
  /** UI label (operator-facing only — do NOT log learner-identifying data) */
  label: string;
  /** Optional 1-line archetype description */
  archetype: string;
  /** 5D scores 0-100 */
  scores: Partial<Record<VocabDimension, number>>;
  /** Day count since first session — drives retention column when shown */
  daysActive: number;
}

export const MOCK_LEARNERS: TeacherLearnerProfile[] = [
  {
    id: "mock-L01",
    label: "Learner 01",
    archetype: "balanced — mid-range across all 5 dims",
    scores: { D1_Form: 55, D2_Meaning: 60, D3_Context: 58, D4_Network: 52, D5_Usage: 56 },
    daysActive: 28,
  },
  {
    id: "mock-L02",
    label: "Learner 02",
    archetype: "low_voc — D2_Meaning / D4_Network weak",
    scores: { D1_Form: 70, D2_Meaning: 25, D3_Context: 55, D4_Network: 30, D5_Usage: 60 },
    daysActive: 14,
  },
  {
    id: "mock-L03",
    label: "Learner 03",
    archetype: "weak_struct — D1_Form weak (sentence parsing)",
    scores: { D1_Form: 22, D2_Meaning: 70, D3_Context: 65, D4_Network: 60, D5_Usage: 60 },
    daysActive: 21,
  },
  {
    id: "mock-L04",
    label: "Learner 04",
    archetype: "low_disc — D3_Context weak (discourse)",
    scores: { D1_Form: 65, D2_Meaning: 65, D3_Context: 28, D4_Network: 55, D5_Usage: 60 },
    daysActive: 35,
  },
  {
    id: "mock-L05",
    label: "Learner 05",
    archetype: "advanced — high across the board, slight D5 dip",
    scores: { D1_Form: 80, D2_Meaning: 85, D3_Context: 82, D4_Network: 80, D5_Usage: 70 },
    daysActive: 42,
  },
];
