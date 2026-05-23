/**
 * Vitest — DiagnosticInput round-trip + schema validation (T1.3).
 *
 * Two CI gates in one file:
 *   A. Schema validation — every DIAGNOSTIC_PRESETS entry must satisfy
 *      schemas/diagnostic-input.schema.json. Catches preset drift if
 *      someone adds a 6th dimension or a CEFR outside the enum.
 *   B. Round-trip integrity — encode → URL ?result=... base64 → decode
 *      → deepEqual original. Catches any encode/decode regression that
 *      would silently corrupt user-pasted diagnostics on /diagnose.
 *
 * Coverage: 4 preset diagnostics + 2 edge cases (boundary CEFR + theta).
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import {
  decodeResultParam,
  isDiagnosticInput,
  DEMO_DIAGNOSTIC,
  type DiagnosticInput,
} from "@/lib/diagnostic";
import { DIAGNOSTIC_PRESETS } from "@/lib/diagnostic-presets";

const ROOT = process.cwd();

function compileSchema(p: string) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(JSON.parse(readFileSync(join(ROOT, p), "utf-8")));
}

function encode(d: DiagnosticInput): string {
  const json = JSON.stringify(d);
  return Buffer.from(json, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const SCHEMA = "schemas/diagnostic-input.schema.json";

const ALL_SAMPLES: { label: string; diagnostic: DiagnosticInput }[] = [
  ...DIAGNOSTIC_PRESETS.map((p) => ({ label: p.id, diagnostic: p.diagnostic })),
  { label: "demo", diagnostic: DEMO_DIAGNOSTIC },
  {
    label: "edge-A1-lowtheta",
    diagnostic: {
      studentName: "edge-low",
      theta: -3.5,
      level: 1,
      cefr: "A1",
      dimensionScores: { D1_Form: 5, D2_Meaning: 8, D3_Context: 2, D4_Network: 1, D5_Usage: 0 },
      weakDim: ["D5_Usage"],
      strongDim: ["D2_Meaning"],
      timestamp: "2026-05-23T00:00:00Z",
    },
  },
  {
    label: "edge-C2-hightheta",
    diagnostic: {
      studentName: "edge-high",
      theta: 3.5,
      level: 6,
      cefr: "C2",
      dimensionScores: { D1_Form: 98, D2_Meaning: 97, D3_Context: 95, D4_Network: 99, D5_Usage: 96 },
      weakDim: ["D3_Context"],
      strongDim: ["D4_Network"],
      timestamp: "2026-05-23T00:00:00Z",
    },
  },
];

describe("DiagnosticInput schema + round-trip (T1.3)", () => {
  test("All samples satisfy schema", () => {
    const validate = compileSchema(SCHEMA);
    for (const s of ALL_SAMPLES) {
      const ok = validate(s.diagnostic);
      if (!ok) console.error(`Schema FAIL on ${s.label}:`, validate.errors);
      expect(ok, `${s.label} should pass schema`).toBe(true);
    }
  });

  test("All samples round-trip lossless (encode → decode → deepEqual)", () => {
    for (const s of ALL_SAMPLES) {
      const encoded = encode(s.diagnostic);
      const decoded = decodeResultParam(encoded);
      expect(decoded, `${s.label} decoded null`).not.toBeNull();
      expect(decoded).toEqual(s.diagnostic);
    }
  });

  test("isDiagnosticInput agrees with schema on positive samples", () => {
    for (const s of ALL_SAMPLES) {
      expect(isDiagnosticInput(s.diagnostic), s.label).toBe(true);
    }
  });

  // ─── Negative cases — schema must reject bad data ───────────────

  test("Schema rejects out-of-range theta", () => {
    const validate = compileSchema(SCHEMA);
    const bad = { ...DEMO_DIAGNOSTIC, theta: 5.0 };
    expect(validate(bad)).toBe(false);
  });

  test("Schema rejects invalid CEFR", () => {
    const validate = compileSchema(SCHEMA);
    const bad = { ...DEMO_DIAGNOSTIC, cefr: "Z9" };
    expect(validate(bad)).toBe(false);
  });

  test("Schema rejects level outside 1-6", () => {
    const validate = compileSchema(SCHEMA);
    const bad = { ...DEMO_DIAGNOSTIC, level: 7 };
    expect(validate(bad)).toBe(false);
  });

  test("Schema rejects unknown dimension key", () => {
    const validate = compileSchema(SCHEMA);
    const bad = {
      ...DEMO_DIAGNOSTIC,
      dimensionScores: { ...DEMO_DIAGNOSTIC.dimensionScores, D6_Cloze: 50 },
    };
    expect(validate(bad)).toBe(false);
  });

  test("Schema rejects dimensionScores > 100", () => {
    const validate = compileSchema(SCHEMA);
    const bad = {
      ...DEMO_DIAGNOSTIC,
      dimensionScores: { ...DEMO_DIAGNOSTIC.dimensionScores, D1_Form: 150 },
    };
    expect(validate(bad)).toBe(false);
  });

  test("Schema rejects weakDim with invalid value", () => {
    const validate = compileSchema(SCHEMA);
    const bad = { ...DEMO_DIAGNOSTIC, weakDim: ["D9_Fake"] };
    expect(validate(bad)).toBe(false);
  });
});
