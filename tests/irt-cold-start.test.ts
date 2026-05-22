/**
 * Vitest — irt-cold-start (P-2 W5).
 */
import { describe, test, expect } from "vitest";
import {
  initialColdStartParams,
  recalibrateCard,
  bStandardError,
  exposureRecommendation,
  type ResponseDatum,
} from "@/lib/irt-cold-start";

describe("initialColdStartParams (P-2 W5)", () => {
  test("T1: Initial b equals learner theta", () => {
    const params = initialColdStartParams(0.3);
    expect(params.b).toBe(0.3);
    expect(params.a).toBe(1.0);
    expect(params.samples).toBe(0);
    expect(params.status).toBe("cold");
  });

  test("T2: Different thetas → different initial b", () => {
    expect(initialColdStartParams(-1.0).b).toBe(-1.0);
    expect(initialColdStartParams(1.5).b).toBe(1.5);
  });
});

describe("recalibrateCard (P-2 W5)", () => {
  test("T1: No responses → params unchanged", () => {
    const initial = initialColdStartParams(0.5);
    const updated = recalibrateCard(initial, []);
    expect(updated.b).toBe(0.5);
    expect(updated.samples).toBe(0);
    expect(updated.status).toBe("cold");
  });

  test("T2: All correct responses → b decreases (card is easier than expected)", () => {
    const initial = initialColdStartParams(0.5);
    const responses: ResponseDatum[] = Array.from({ length: 20 }, () => ({
      theta: 0.5,
      isCorrect: true,
    }));
    const updated = recalibrateCard(initial, responses);
    expect(updated.b).toBeLessThan(0.5);
  });

  test("T3: All wrong responses → b increases (card is harder than expected)", () => {
    const initial = initialColdStartParams(0.5);
    const responses: ResponseDatum[] = Array.from({ length: 20 }, () => ({
      theta: 0.5,
      isCorrect: false,
    }));
    const updated = recalibrateCard(initial, responses);
    expect(updated.b).toBeGreaterThan(0.5);
  });

  test("T4: Status progresses with sample count", () => {
    const initial = initialColdStartParams(0.5);
    const make = (n: number, correct: boolean): ResponseDatum[] =>
      Array.from({ length: n }, () => ({ theta: 0.5, isCorrect: correct }));
    expect(recalibrateCard(initial, make(2, true)).status).toBe("cold");
    expect(recalibrateCard(initial, make(10, true)).status).toBe("warming");
    expect(recalibrateCard(initial, make(60, true)).status).toBe("warm");
  });

  test("T5: Higher priorStrength → b closer to prior", () => {
    const initial = initialColdStartParams(0.5);
    const responses: ResponseDatum[] = Array.from({ length: 30 }, () => ({
      theta: 0.5,
      isCorrect: true,
    }));
    const lowPrior = recalibrateCard(initial, responses, { priorStrength: 1 });
    const highPrior = recalibrateCard(initial, responses, { priorStrength: 100 });
    // Both b should be < 0.5 (all-correct), but high prior closer to 0.5
    expect(highPrior.b).toBeGreaterThan(lowPrior.b);
  });

  test("T6: b is clamped to [-3, 3]", () => {
    const initial = initialColdStartParams(0);
    // Extreme: 100 wrong answers at theta=0 should drive b very high, but clamped
    const responses: ResponseDatum[] = Array.from({ length: 100 }, () => ({
      theta: 0,
      isCorrect: false,
    }));
    const updated = recalibrateCard(initial, responses, { priorStrength: 0.01 });
    expect(updated.b).toBeLessThanOrEqual(3);
    expect(updated.b).toBeGreaterThanOrEqual(-3);
  });

  test("T7: Varied theta responses → b converges to true difficulty", () => {
    // True b = -0.5 (card slightly easier than average). Generate responses
    // from learners with theta ∈ [-2, 2] and Bernoulli with true Rasch.
    const TRUE_B = -0.5;
    const N = 200;
    const responses: ResponseDatum[] = [];
    for (let i = 0; i < N; i++) {
      const theta = -2 + (i / N) * 4; // uniform [-2, 2]
      const p = 1 / (1 + Math.exp(TRUE_B - theta));
      const isCorrect = Math.random() < p;
      responses.push({ theta, isCorrect });
    }
    // Use weak prior so MLE dominates
    const updated = recalibrateCard(initialColdStartParams(0), responses, {
      priorStrength: 0.1,
    });
    expect(Math.abs(updated.b - TRUE_B)).toBeLessThan(0.3);
  });
});

describe("bStandardError + exposureRecommendation (P-2 W5)", () => {
  test("T1: No responses → SE = Infinity", () => {
    const params = initialColdStartParams(0.5);
    expect(bStandardError(params, [])).toBe(Infinity);
  });

  test("T2: More responses → smaller SE", () => {
    const params = initialColdStartParams(0.5);
    const fewResponses: ResponseDatum[] = Array.from({ length: 5 }, () => ({
      theta: 0.5,
      isCorrect: true,
    }));
    const manyResponses: ResponseDatum[] = Array.from({ length: 100 }, () => ({
      theta: 0.5,
      isCorrect: true,
    }));
    expect(bStandardError(params, manyResponses)).toBeLessThan(
      bStandardError(params, fewResponses)
    );
  });

  test("T3: exposureRecommendation 'expose-more' when SE high", () => {
    const params = initialColdStartParams(0.5);
    const responses: ResponseDatum[] = [{ theta: 0.5, isCorrect: true }];
    expect(exposureRecommendation(params, responses)).toBe("expose-more");
  });

  test("T4: exposureRecommendation 'ready' when SE low + b reasonable", () => {
    const responses: ResponseDatum[] = Array.from({ length: 100 }, () => ({
      theta: 0.5,
      isCorrect: Math.random() < 0.5,
    }));
    const params = recalibrateCard(initialColdStartParams(0.5), responses);
    expect(exposureRecommendation(params, responses)).toBe("ready");
  });

  test("T5: 'retire' when stable but mismatched to learner pool", () => {
    // Synthetic: many responses, b stabilizes at -2, but learner is at +1
    const responses: ResponseDatum[] = Array.from({ length: 200 }, () => ({
      theta: -2,
      isCorrect: Math.random() < 0.5,
    }));
    const params = recalibrateCard(initialColdStartParams(-2), responses);
    expect(
      exposureRecommendation(params, responses, { learnerTheta: 1.0 })
    ).toBe("retire");
  });
});
