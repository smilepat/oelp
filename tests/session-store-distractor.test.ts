/**
 * Vitest — backward-compat for the optional distractorPicked field
 * added to SessionResponseRecord (p2a-ontology follow-up).
 */
import { describe, test, expect } from "vitest";
import type { SessionResponseRecord } from "@/lib/session-store";

describe("SessionResponseRecord distractorPicked (optional)", () => {
  test("T1: old envelopes without distractorPicked still type-check", () => {
    // Pre-PR shape — no distractorPicked field present
    const legacy: SessionResponseRecord = {
      itemId: "i1",
      qtId: "TYPE-요지",
      isCorrect: false,
      dimensionScores: { D2_Meaning: 60 },
      at: new Date().toISOString(),
    };
    expect(legacy.distractorPicked).toBeUndefined();
  });

  test("T2: new envelopes can carry distractorPicked", () => {
    const enriched: SessionResponseRecord = {
      itemId: "i2",
      qtId: "TYPE-빈칸추론",
      isCorrect: false,
      dimensionScores: { D2_Meaning: 60 },
      at: new Date().toISOString(),
      distractorPicked: "DIST-유사어휘함정",
    };
    expect(enriched.distractorPicked).toBe("DIST-유사어휘함정");
  });
});
