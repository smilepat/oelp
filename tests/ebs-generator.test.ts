/**
 * Vitest — EBSCriteriaEngineGenerator real wiring (P-2 W7+ activation).
 *
 * Was a stub returning EBS_INTEGRATION_PENDING. Now wired to the planned
 * EBS-demo synthesize API contract. Validates:
 *   - No-endpoint path returns EBS_NOT_CONFIGURED (unchanged behavior)
 *   - Fetch HTTP error → EBS_HTTP_ERROR
 *   - Malformed response (missing cards array) → EBS_MALFORMED_RESPONSE
 *   - Fetch throws (network) → EBS_FETCH_FAILED
 *   - Happy path: cards returned, validators applied, count respected
 *   - Invalid cards from EBS-demo get filtered (V1_NO_ITEM_ID etc.)
 *
 * Mocks global fetch — no live EBS-demo backend required.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { EBSCriteriaEngineGenerator } from "@/lib/content-generator";
import type { VocabCard } from "@/lib/vocabulary-pool";

const ORIG_FETCH = global.fetch;

const VALID_CARD: VocabCard = {
  itemId: "ebs-1",
  word: "discerning",
  pos: "adj.",
  cefr: "C1",
  dimension: "D2_Meaning",
  difficulty: 1.2,
  discrimination: 1.0,
  meaningKo: "안목있는",
  questionText: "다음 중 'discerning'의 의미로 알맞은 것은?",
  options: ["안목있는", "무분별한", "단순한", "복잡한"],
  answerIdx: 0,
  rationaleKo: "discerning: 안목있는",
};

const CTX = {
  qtId: "TYPE-요지",
  targetDimensions: ["D2_Meaning"] as const,
  difficultyRange: { min: 0.5, max: 1.5 },
  count: 3,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  global.fetch = ORIG_FETCH;
});

describe("EBSCriteriaEngineGenerator (P-2 W7)", () => {
  test("T1: no endpoint → EBS_NOT_CONFIGURED", async () => {
    const gen = new EBSCriteriaEngineGenerator();
    const result = await gen.generate({ ...CTX, targetDimensions: [...CTX.targetDimensions] });
    expect(result.cards).toEqual([]);
    expect(result.issues[0].code).toBe("EBS_NOT_CONFIGURED");
  });

  test("T2: HTTP 500 → EBS_HTTP_ERROR", async () => {
    global.fetch = vi.fn(async () => new Response("err", { status: 500, statusText: "Internal Server Error" })) as typeof fetch;
    const gen = new EBSCriteriaEngineGenerator("https://mock-ebs.test");
    const result = await gen.generate({ ...CTX, targetDimensions: [...CTX.targetDimensions] });
    expect(result.cards).toEqual([]);
    expect(result.issues[0].code).toBe("EBS_HTTP_ERROR");
    expect(result.issues[0].message).toContain("500");
  });

  test("T3: malformed body (no cards array) → EBS_MALFORMED_RESPONSE", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ wrong: "shape" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
    const gen = new EBSCriteriaEngineGenerator("https://mock-ebs.test");
    const result = await gen.generate({ ...CTX, targetDimensions: [...CTX.targetDimensions] });
    expect(result.cards).toEqual([]);
    expect(result.issues[0].code).toBe("EBS_MALFORMED_RESPONSE");
  });

  test("T4: fetch throws → EBS_FETCH_FAILED", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const gen = new EBSCriteriaEngineGenerator("https://mock-ebs.test");
    const result = await gen.generate({ ...CTX, targetDimensions: [...CTX.targetDimensions] });
    expect(result.cards).toEqual([]);
    expect(result.issues[0].code).toBe("EBS_FETCH_FAILED");
    expect(result.issues[0].message).toContain("ECONNREFUSED");
  });

  test("T5: happy path — 3 valid cards returned", async () => {
    const ebsCards = [
      VALID_CARD,
      { ...VALID_CARD, itemId: "ebs-2", word: "rigorous", questionText: "다음 중 'rigorous'의 의미로 알맞은 것은?" },
      { ...VALID_CARD, itemId: "ebs-3", word: "concise", questionText: "다음 중 'concise'의 의미로 알맞은 것은?" },
    ];
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ cards: ebsCards }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
    const gen = new EBSCriteriaEngineGenerator("https://mock-ebs.test");
    const result = await gen.generate({ ...CTX, targetDimensions: [...CTX.targetDimensions] });
    expect(result.cards).toHaveLength(3);
    expect(result.cards.map((c) => c.itemId)).toEqual(["ebs-1", "ebs-2", "ebs-3"]);
    expect(result.generator).toBe("ebs-criteria-engine-v1");
  });

  test("T6: invalid cards filtered out, valid ones kept", async () => {
    const ebsCards = [
      VALID_CARD,
      { ...VALID_CARD, itemId: "" }, // V1 error
      { ...VALID_CARD, itemId: "ebs-3", word: "rigorous", questionText: "다음 중 'rigorous'의 의미로 알맞은 것은?" },
    ];
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ cards: ebsCards }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
    const gen = new EBSCriteriaEngineGenerator("https://mock-ebs.test");
    const result = await gen.generate({ ...CTX, targetDimensions: [...CTX.targetDimensions] });
    expect(result.cards).toHaveLength(2); // V1 error removes the middle one
    expect(result.cards.every((c) => c.itemId.length > 0)).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0); // V1_NO_ITEM_ID reported
  });

  test("T7: ctx.count respected — slice if EBS returns more", async () => {
    const ebsCards = Array.from({ length: 10 }, (_, i) => ({
      ...VALID_CARD,
      itemId: `ebs-${i}`,
      word: `word${i}`,
      questionText: `다음 중 'word${i}'의 의미로 알맞은 것은?`,
    }));
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ cards: ebsCards }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
    const gen = new EBSCriteriaEngineGenerator("https://mock-ebs.test");
    const result = await gen.generate({ ...CTX, count: 5, targetDimensions: [...CTX.targetDimensions] });
    expect(result.cards).toHaveLength(5);
  });

  test("T8: POST body shape matches contract", async () => {
    let capturedBody: string | null = null;
    global.fetch = vi.fn(async (url, init) => {
      capturedBody = init?.body as string | null;
      return new Response(JSON.stringify({ cards: [VALID_CARD] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const gen = new EBSCriteriaEngineGenerator("https://mock-ebs.test");
    await gen.generate({
      ...CTX,
      targetDimensions: [...CTX.targetDimensions],
      excludeItemIds: ["x-1"],
    });
    expect(capturedBody).toBeTruthy();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.qtId).toBe("TYPE-요지");
    expect(parsed.targetDimensions).toEqual(["D2_Meaning"]);
    expect(parsed.difficultyRange).toEqual({ min: 0.5, max: 1.5 });
    expect(parsed.count).toBe(3);
    expect(parsed.excludeItemIds).toEqual(["x-1"]);
  });
});
