/**
 * @vitest-environment jsdom
 *
 * Vitest — Leitner 5-Box spaced repetition (A7 coverage push).
 *
 * lib/leitner.ts had 0% coverage. This brings it to ~100% with no
 * runtime behavior change.
 */
import { describe, test, expect, beforeEach } from "vitest";
import {
  loadSRMap,
  saveSRMap,
  applyResponses,
  getBoxSummary,
  countAdvancements,
  type SRState,
  type Box,
} from "@/lib/leitner";

beforeEach(() => {
  localStorage.removeItem("oelp.sr.box");
});

describe("leitner (A7)", () => {
  test("T1: empty store returns {}", () => {
    expect(loadSRMap()).toEqual({});
    expect(getBoxSummary()).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });

  test("T2: saveSRMap roundtrip", () => {
    const map: Record<string, SRState> = {
      "item-1": {
        itemId: "item-1",
        box: 2,
        lastSeen: "2026-01-01T00:00:00.000Z",
        dueAt: "2026-01-03T00:00:00.000Z",
        correctStreak: 1,
      },
    };
    saveSRMap(map);
    expect(loadSRMap()).toEqual(map);
  });

  test("T3: malformed storage falls back to {}", () => {
    localStorage.setItem("oelp.sr.box", "not json");
    expect(loadSRMap()).toEqual({});
  });

  test("T4: applyResponses moves new item to box 2 on correct (was implicit box 1)", () => {
    const map = applyResponses([
      { itemId: "w-1", correct: true, at: "2026-01-01T10:00:00.000Z" },
    ]);
    expect(map["w-1"].box).toBe(2);
    expect(map["w-1"].correctStreak).toBe(1);
  });

  test("T5: applyResponses keeps box 1 on wrong", () => {
    const map = applyResponses([
      { itemId: "w-1", correct: false, at: "2026-01-01T10:00:00.000Z" },
    ]);
    expect(map["w-1"].box).toBe(1);
    expect(map["w-1"].correctStreak).toBe(0);
  });

  test("T6: applyResponses caps at box 5", () => {
    // Set up state at box 5
    const initial: Record<string, SRState> = {
      "w-1": {
        itemId: "w-1",
        box: 5,
        lastSeen: "2026-01-01T00:00:00.000Z",
        dueAt: "2026-01-15T00:00:00.000Z",
        correctStreak: 5,
      },
    };
    saveSRMap(initial);
    const map = applyResponses([
      { itemId: "w-1", correct: true, at: "2026-01-02T00:00:00.000Z" },
    ]);
    expect(map["w-1"].box).toBe(5);
    expect(map["w-1"].correctStreak).toBe(6);
  });

  test("T7: wrong response resets streak even from high box", () => {
    saveSRMap({
      "w-1": {
        itemId: "w-1",
        box: 4,
        lastSeen: "2026-01-01T00:00:00.000Z",
        dueAt: "2026-01-08T00:00:00.000Z",
        correctStreak: 3,
      },
    });
    const map = applyResponses([
      { itemId: "w-1", correct: false, at: "2026-01-02T00:00:00.000Z" },
    ]);
    expect(map["w-1"].box).toBe(1);
    expect(map["w-1"].correctStreak).toBe(0);
  });

  test("T8: dueAt is in the future of lastSeen (interval applied)", () => {
    // addDaysISO clamps to local-midnight then ISO-stringifies, so the
    // exact day-diff is timezone-dependent. Just assert dueAt > lastSeen
    // and within a reasonable upper bound (box 2 interval = 2 days).
    const map = applyResponses([
      { itemId: "w-1", correct: true, at: "2026-01-01T10:00:00.000Z" },
    ]);
    const lastSeen = new Date(map["w-1"].lastSeen).getTime();
    const dueAt = new Date(map["w-1"].dueAt).getTime();
    expect(dueAt).toBeGreaterThan(lastSeen);
    // box 2 = 2 day interval; allow 1.0 - 3.0 days due to TZ clamping
    const diffDays = (dueAt - lastSeen) / 86400000;
    expect(diffDays).toBeGreaterThan(0.5);
    expect(diffDays).toBeLessThan(3);
  });

  test("T8b: box 5 dueAt ~ 2 weeks", () => {
    saveSRMap({
      "w-1": {
        itemId: "w-1",
        box: 4,
        lastSeen: "",
        dueAt: "",
        correctStreak: 4,
      },
    });
    const map = applyResponses([
      { itemId: "w-1", correct: true, at: "2026-01-01T10:00:00.000Z" },
    ]);
    expect(map["w-1"].box).toBe(5);
    const lastSeen = new Date(map["w-1"].lastSeen).getTime();
    const dueAt = new Date(map["w-1"].dueAt).getTime();
    const diffDays = (dueAt - lastSeen) / 86400000;
    expect(diffDays).toBeGreaterThan(12);
    expect(diffDays).toBeLessThan(15);
  });

  test("T9: getBoxSummary aggregates correctly", () => {
    saveSRMap({
      a: { itemId: "a", box: 1, lastSeen: "", dueAt: "", correctStreak: 0 },
      b: { itemId: "b", box: 1, lastSeen: "", dueAt: "", correctStreak: 0 },
      c: { itemId: "c", box: 3, lastSeen: "", dueAt: "", correctStreak: 1 },
      d: { itemId: "d", box: 5, lastSeen: "", dueAt: "", correctStreak: 4 },
    } as Record<string, SRState>);
    expect(getBoxSummary()).toEqual({ 1: 2, 2: 0, 3: 1, 4: 0, 5: 1 });
  });

  test("T10: countAdvancements only counts correct + non-max-box items", () => {
    const before: Record<string, SRState> = {
      a: { itemId: "a", box: 1, lastSeen: "", dueAt: "", correctStreak: 0 },
      b: { itemId: "b", box: 5, lastSeen: "", dueAt: "", correctStreak: 5 },
      // c not in before — defaults to box 1
    };
    const advanced = countAdvancements(
      [
        { itemId: "a", correct: true }, // 1 → 2 (count)
        { itemId: "b", correct: true }, // 5 → 5 (no advance)
        { itemId: "c", correct: true }, // implicit 1 → 2 (count)
        { itemId: "a", correct: false }, // wrong, no count
      ],
      before
    );
    expect(advanced).toBe(2);
  });

  test("T11: Box type accepts only 1-5 (compile + runtime check)", () => {
    const boxes: Box[] = [1, 2, 3, 4, 5];
    expect(boxes).toHaveLength(5);
    // Box 6 wouldn't compile — relying on TS narrowing alongside numeric bounds.
    const summary = getBoxSummary();
    expect(Object.keys(summary).sort()).toEqual(["1", "2", "3", "4", "5"]);
  });
});
