/**
 * Vitest port of scripts/test-calibration.mjs.
 * Imports real lib/calibration.ts.
 */
import { describe, test, expect } from "vitest";
import { calibrateWeights, type CalibrationResponse } from "@/lib/calibration";
import { QUESTION_TYPES } from "@/lib/ontology";
import type { VocabDimension } from "@/lib/diagnostic";

const D2_D5: VocabDimension[] = ["D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

function priorMap() {
  const m: Record<string, Record<VocabDimension, number>> = {};
  for (const qt of QUESTION_TYPES) m[qt.id] = { ...qt.weights };
  return m;
}

function generateResponses(
  qtId: string,
  trueWeights: Record<VocabDimension, number>,
  n: number,
  noise = 0
): CalibrationResponse[] {
  const out: CalibrationResponse[] = [];
  for (let i = 0; i < n; i++) {
    const scores: Record<VocabDimension, number> = {
      D1_Form: 20 + Math.random() * 70,
      D2_Meaning: 20 + Math.random() * 70,
      D3_Context: 20 + Math.random() * 70,
      D4_Network: 20 + Math.random() * 70,
      D5_Usage: 20 + Math.random() * 70,
    };
    let p = 0;
    for (const d of D2_D5) p += trueWeights[d] * (scores[d] / 100);
    p += trueWeights.D1_Form * (scores.D1_Form / 100);
    p += (Math.random() - 0.5) * noise * 2;
    p = Math.max(0, Math.min(1, p));
    out.push({ qtId, dimensionScores: scores, isCorrect: Math.random() < p });
  }
  return out;
}

describe("calibration ridge regression (P-1 W5)", () => {
  test("T1: Empty responses → all QTs fallback to prior", () => {
    const r = calibrateWeights({ responses: [], priorWeights: priorMap() });
    expect(r.meta.qtsCalibrated).toBe(0);
    expect(r.meta.qtsFallback).toBe(QUESTION_TYPES.length);
    for (const qt of QUESTION_TYPES) {
      expect(r.perQTAlgorithm[qt.id]).toBe("prior-fallback");
      expect(r.perQTDivergence[qt.id]).toBe(0);
    }
  });

  test("T2: < minSamples for QT → fallback", () => {
    const yojiTruth = QUESTION_TYPES.find((q) => q.id === "TYPE-요지")!.weights;
    const responses = generateResponses("TYPE-요지", yojiTruth, 20);
    const r = calibrateWeights({ responses, priorWeights: priorMap() }, { minSamplesPerQT: 30 });
    expect(r.perQTAlgorithm["TYPE-요지"]).toBe("prior-fallback");
    expect(r.perQTSampleCount["TYPE-요지"]).toBe(20);
  });

  test("T3: N=300 → learned D3 is dominant (relaxed tolerance for Bernoulli noise)", () => {
    const trueW: Record<VocabDimension, number> = {
      D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.6, D4_Network: 0.15, D5_Usage: 0.1,
    };
    // Use larger N (500) to reduce Bernoulli variance, and tolerance 0.2 for robustness
    const responses = generateResponses("TYPE-요지", trueW, 500, 0);
    const r = calibrateWeights({ responses, priorWeights: priorMap() }, { lambda: 0.01, minSamplesPerQT: 30 });
    const learned = r.weights["TYPE-요지"];
    expect(r.perQTAlgorithm["TYPE-요지"]).toBe("ridge-v1");
    const dims = D2_D5.map((d) => ({ d, w: learned[d] })).sort((a, b) => b.w - a.w);
    // Top dim must be D3 (qualitative); quantitative tolerance is 0.2
    expect(dims[0].d).toBe("D3_Context");
    expect(Math.abs(learned.D3_Context - 0.6)).toBeLessThan(0.2);
  });

  test("T4: Sum-to-1 constraint preserved", () => {
    const trueW: Record<VocabDimension, number> = {
      D1_Form: 0.05, D2_Meaning: 0.3, D3_Context: 0.4, D4_Network: 0.15, D5_Usage: 0.1,
    };
    const responses = generateResponses("TYPE-요지", trueW, 200, 0.1);
    const r = calibrateWeights({ responses, priorWeights: priorMap() });
    const w = r.weights["TYPE-요지"];
    const sum = w.D1_Form + w.D2_Meaning + w.D3_Context + w.D4_Network + w.D5_Usage;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  test("T5: D1_Form fixed at 0.05", () => {
    const trueW: Record<VocabDimension, number> = {
      D1_Form: 0.5, D2_Meaning: 0.1, D3_Context: 0.2, D4_Network: 0.1, D5_Usage: 0.1,
    };
    const responses = generateResponses("TYPE-요지", trueW, 200, 0);
    const r = calibrateWeights({ responses, priorWeights: priorMap() });
    expect(r.weights["TYPE-요지"].D1_Form).toBe(0.05);
  });

  test("T6: All weights non-negative", () => {
    const trueW: Record<VocabDimension, number> = {
      D1_Form: 0.05, D2_Meaning: 0.05, D3_Context: 0.7, D4_Network: 0.1, D5_Usage: 0.1,
    };
    const responses = generateResponses("TYPE-요지", trueW, 100, 0.3);
    const r = calibrateWeights({ responses, priorWeights: priorMap() });
    const w = r.weights["TYPE-요지"];
    for (const d of D2_D5) expect(w[d]).toBeGreaterThanOrEqual(0);
  });

  test("T7: High λ → smaller divergence, low λ → larger", () => {
    const trueW: Record<VocabDimension, number> = {
      D1_Form: 0.05, D2_Meaning: 0.4, D3_Context: 0.3, D4_Network: 0.15, D5_Usage: 0.1,
    };
    const responses = generateResponses("TYPE-요지", trueW, 100, 0.1);
    const rHigh = calibrateWeights({ responses, priorWeights: priorMap() }, { lambda: 10, minSamplesPerQT: 30 });
    const rLow = calibrateWeights({ responses, priorWeights: priorMap() }, { lambda: 0.001, minSamplesPerQT: 30 });
    expect(rHigh.perQTDivergence["TYPE-요지"]).toBeLessThan(rLow.perQTDivergence["TYPE-요지"]);
  });

  test("T8: Divergence > 0 when truth ≠ prior", () => {
    const trueW: Record<VocabDimension, number> = {
      D1_Form: 0.05, D2_Meaning: 0.5, D3_Context: 0.2, D4_Network: 0.1, D5_Usage: 0.15,
    };
    const responses = generateResponses("TYPE-요지", trueW, 200, 0.05);
    const r = calibrateWeights({ responses, priorWeights: priorMap() }, { lambda: 0.1 });
    expect(r.perQTDivergence["TYPE-요지"]).toBeGreaterThan(0.01);
  });

  test("T9: Mixed → partial calibration", () => {
    const yojiTruth = QUESTION_TYPES.find((q) => q.id === "TYPE-요지")!.weights;
    const mokjeokTruth = QUESTION_TYPES.find((q) => q.id === "TYPE-목적")!.weights;
    const r = calibrateWeights({
      responses: [
        ...generateResponses("TYPE-요지", yojiTruth, 100),
        ...generateResponses("TYPE-목적", mokjeokTruth, 5),
      ],
      priorWeights: priorMap(),
    });
    expect(r.perQTAlgorithm["TYPE-요지"]).toBe("ridge-v1");
    expect(r.perQTAlgorithm["TYPE-목적"]).toBe("prior-fallback");
    expect(r.meta.qtsCalibrated).toBe(1);
  });

  test("T10: Reproducibility (deterministic)", () => {
    const responses: CalibrationResponse[] = [];
    for (let i = 0; i < 100; i++) {
      const scores: Record<VocabDimension, number> = {
        D1_Form: 50, D2_Meaning: 20 + i * 0.5, D3_Context: 30 + i * 0.4, D4_Network: 40, D5_Usage: 50,
      };
      let p = 0;
      const trueW = { D1_Form: 0.05, D2_Meaning: 0.2, D3_Context: 0.5, D4_Network: 0.15, D5_Usage: 0.1 };
      for (const d of D2_D5) p += trueW[d] * (scores[d] / 100);
      p += trueW.D1_Form * (scores.D1_Form / 100);
      responses.push({ qtId: "TYPE-요지", dimensionScores: scores, isCorrect: p > 0.4 });
    }
    const r1 = calibrateWeights({ responses, priorWeights: priorMap() });
    const r2 = calibrateWeights({ responses, priorWeights: priorMap() });
    expect(r1.weights["TYPE-요지"]).toEqual(r2.weights["TYPE-요지"]);
  });
});
