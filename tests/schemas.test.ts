/**
 * Vitest — JSON Schema validation (T1.1 long-term stability gate).
 *
 * Runs the same checks scripts/validate-schemas.mjs performs in CI, but
 * inside the unit test suite. Two layers because:
 *   (1) Local devs run `npm test` more often than `node scripts/validate-schemas`.
 *   (2) If AJV regresses we want a single source of failure (the test).
 *
 * Also verifies negative cases — that corruption is actually detected,
 * not silently passed. This catches schema regressions where a field
 * becomes too permissive.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ROOT = process.cwd();

function loadJson(p: string) {
  return JSON.parse(readFileSync(join(ROOT, p), "utf-8"));
}

// Fresh validator per call — AJV registers schemas by $id, and compiling
// the same $id twice within one Ajv instance throws. Each test wants a
// clean compile, so we factor.
function compileSchema(schemaPath: string) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(loadJson(schemaPath));
}

const SCHEMA_PATH = "schemas/regression-history.schema.json";

describe("Schema validation (T1.1)", () => {
  test("regression-history.json matches its schema", () => {
    const validate = compileSchema(SCHEMA_PATH);
    const data = loadJson("lib/regression-history.json");
    const ok = validate(data);
    if (!ok) {
      console.error(validate.errors);
    }
    expect(ok).toBe(true);
  });

  // ─── Negative cases — corruption must be caught ────────────────────

  test("Rejects missing schemaVersion", () => {
    const validate = compileSchema(SCHEMA_PATH);
    expect(validate({ events: [] })).toBe(false);
  });

  test("Rejects schemaVersion != 1", () => {
    const validate = compileSchema(SCHEMA_PATH);
    expect(validate({ schemaVersion: 2, events: [] })).toBe(false);
  });

  test("Rejects event with invalid result", () => {
    const validate = compileSchema(SCHEMA_PATH);
    const data = {
      schemaVersion: 1,
      events: [
        {
          id: "bad",
          occurredAt: "2026-05-23T00:00:00Z",
          kind: "auto-promote",
          result: "maybe", // not in enum
          trigger: "test trigger",
          tau: 0.5,
          contradictions: 0,
          summary: "long enough summary",
          lesson: "long enough lesson",
        },
      ],
    };
    expect(validate(data)).toBe(false);
  });

  test("Rejects pass auto-promote without changedQTs", () => {
    const validate = compileSchema(SCHEMA_PATH);
    const data = {
      schemaVersion: 1,
      events: [
        {
          id: "missing-changes",
          occurredAt: "2026-05-23T00:00:00Z",
          kind: "auto-promote",
          result: "pass",
          trigger: "test",
          tau: 0.6,
          contradictions: 0,
          summary: "long enough summary text",
          lesson: "long enough lesson text",
          // changedQTs intentionally absent
        },
      ],
    };
    expect(validate(data)).toBe(false);
  });

  test("Rejects tau out of [-1, 1]", () => {
    const validate = compileSchema(SCHEMA_PATH);
    const data = {
      schemaVersion: 1,
      events: [
        {
          id: "bad-tau",
          occurredAt: "2026-05-23T00:00:00Z",
          kind: "auto-promote",
          result: "fail",
          trigger: "test",
          tau: 2.5,
          contradictions: 0,
          summary: "long enough summary text",
          lesson: "long enough lesson text",
        },
      ],
    };
    expect(validate(data)).toBe(false);
  });

  test("Rejects negative contradictions", () => {
    const validate = compileSchema(SCHEMA_PATH);
    const data = {
      schemaVersion: 1,
      events: [
        {
          id: "bad-contradictions",
          occurredAt: "2026-05-23T00:00:00Z",
          kind: "auto-promote",
          result: "fail",
          trigger: "test",
          tau: 0.5,
          contradictions: -1,
          summary: "long enough summary text",
          lesson: "long enough lesson text",
        },
      ],
    };
    expect(validate(data)).toBe(false);
  });

  test("Rejects unknown top-level property (additionalProperties: false)", () => {
    const validate = compileSchema(SCHEMA_PATH);
    expect(validate({ schemaVersion: 1, events: [], hax: true })).toBe(false);
  });
});
