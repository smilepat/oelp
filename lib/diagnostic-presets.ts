/**
 * Varied diagnostic presets for dogfooding sessions (P-1.5b L4 follow-up).
 *
 * Purpose: solve the "paste-import not used" problem observed in
 * dogfooding-1 and dogfooding-2 (docs/03-analysis/dogfooding-pass-2.md §L4).
 * Users repeatedly fell back to DEMO_DIAGNOSTIC because the paste-import
 * box was visible but required external JSON copy/paste — friction too high
 * for a single-click flow.
 *
 * Solution: ship 4 pre-defined presets covering distinct weakness profiles.
 * One click → active diagnostic set → /queue uses varied dimensionScores
 * → calibrate.mjs gets rank > 1 input matrix.
 *
 * Profile design rationale (each varies dimensionScores meaningfully):
 *   α — D3/D4 약점 (classic EFL: vocab known, context/network weak)
 *   β — D1/D5 약점 (spelling/collocation weak, meaning strong)
 *   γ — D2 약점 (meaning weak, other dims strong — atypical learner)
 *   δ — 고른 약점 (cold-start, A2 level)
 *
 * Together these 4 profiles span ~4 distinct points in dimensionScores
 * space → ridge regression identifiability satisfied with 4+ sessions.
 */

import type { DiagnosticInput } from "./diagnostic";

export interface DiagnosticPreset {
  id: "alpha" | "beta" | "gamma" | "delta";
  label: string;
  description: string;
  diagnostic: DiagnosticInput;
}

const PRESET_TIMESTAMP = "2026-05-23T10:00:00Z";

export const DIAGNOSTIC_PRESETS: DiagnosticPreset[] = [
  {
    id: "alpha",
    label: "α — D3/D4 약점 (전형 EFL)",
    description: "어휘는 알지만 지문 맥락·연결망 취약. 가장 흔한 한국 학습자 패턴.",
    diagnostic: {
      studentName: "preset-α",
      theta: 0.2,
      level: 4,
      cefr: "B1",
      dimensionScores: {
        D1_Form: 75,
        D2_Meaning: 82,
        D3_Context: 38,
        D4_Network: 52,
        D5_Usage: 68,
      },
      weakDim: ["D3_Context", "D4_Network"],
      strongDim: ["D2_Meaning"],
      timestamp: PRESET_TIMESTAMP,
      source: "preset-alpha",
    },
  },
  {
    id: "beta",
    label: "β — D1/D5 약점 (스펠링·콜로케이션 취약)",
    description: "의미 이해는 강하나 형태·사용 약함. 듣기·말하기 우선 학습자.",
    diagnostic: {
      studentName: "preset-β",
      theta: -0.1,
      level: 4,
      cefr: "B1",
      dimensionScores: {
        D1_Form: 42,
        D2_Meaning: 78,
        D3_Context: 65,
        D4_Network: 70,
        D5_Usage: 35,
      },
      weakDim: ["D1_Form", "D5_Usage"],
      strongDim: ["D2_Meaning", "D4_Network"],
      timestamp: PRESET_TIMESTAMP,
      source: "preset-beta",
    },
  },
  {
    id: "gamma",
    label: "γ — D2 약점 (의미 단독 취약)",
    description: "다른 차원은 강한데 의미만 약함. 비전형 패턴 — calibration 발견용.",
    diagnostic: {
      studentName: "preset-γ",
      theta: 0.5,
      level: 5,
      cefr: "B2",
      dimensionScores: {
        D1_Form: 80,
        D2_Meaning: 40,
        D3_Context: 72,
        D4_Network: 75,
        D5_Usage: 70,
      },
      weakDim: ["D2_Meaning"],
      strongDim: ["D1_Form", "D4_Network"],
      timestamp: PRESET_TIMESTAMP,
      source: "preset-gamma",
    },
  },
  {
    id: "delta",
    label: "δ — 고른 약점 (cold-start, A2)",
    description: "전 차원 50% 내외. 초보 학습자 / 첫 진단 시뮬레이션.",
    diagnostic: {
      studentName: "preset-δ",
      theta: -0.4,
      level: 3,
      cefr: "A2",
      dimensionScores: {
        D1_Form: 55,
        D2_Meaning: 50,
        D3_Context: 48,
        D4_Network: 45,
        D5_Usage: 52,
      },
      weakDim: ["D4_Network", "D3_Context"],
      strongDim: ["D1_Form"],
      timestamp: PRESET_TIMESTAMP,
      source: "preset-delta",
    },
  },
];

export function getPresetById(id: DiagnosticPreset["id"]): DiagnosticPreset | undefined {
  return DIAGNOSTIC_PRESETS.find((p) => p.id === id);
}
