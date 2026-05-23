#!/usr/bin/env node
/**
 * Schema validation gate (T1.1 — long-term stability roadmap).
 *
 * Validates all curated JSON artifacts against their JSON Schemas.
 * Used by CI (pr-check.yml) and Vitest (tests/schemas.test.ts) so that
 * silent corruption of regression-history.json or other audit data is
 * caught at PR time — not at /regression-history page load.
 *
 * Adding a new pair:
 *   1. Put schema at  schemas/<name>.schema.json
 *   2. Put data at    lib/<name>.json (or wherever)
 *   3. Append to PAIRS below.
 *
 * Exit codes:
 *   0  All schemas pass.
 *   1  At least one schema fails (errors printed).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PAIRS = [
  {
    name: "regression-history",
    schema: "schemas/regression-history.schema.json",
    data: "lib/regression-history.json",
  },
  {
    name: "ontology-weights",
    schema: "schemas/ontology-weights.schema.json",
    data: "lib/ontology-weights.json",
  },
];

const ajv = new Ajv({ allErrors: true, strict: false });

let hasFormats = true;
try {
  addFormats(ajv);
} catch {
  hasFormats = false;
}

let failed = 0;

for (const pair of PAIRS) {
  const schemaPath = join(ROOT, pair.schema);
  const dataPath = join(ROOT, pair.data);

  let schema, data;
  try {
    schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  } catch (err) {
    console.error(`[FAIL] ${pair.name}: cannot read schema ${pair.schema}: ${err.message}`);
    failed++;
    continue;
  }
  try {
    data = JSON.parse(readFileSync(dataPath, "utf-8"));
  } catch (err) {
    console.error(`[FAIL] ${pair.name}: cannot read data ${pair.data}: ${err.message}`);
    failed++;
    continue;
  }

  const validate = ajv.compile(schema);
  const ok = validate(data);

  if (ok) {
    console.log(`[ OK ] ${pair.name}: ${pair.data} matches ${pair.schema}`);
  } else {
    failed++;
    console.error(`[FAIL] ${pair.name}: ${pair.data} violates ${pair.schema}`);
    for (const err of validate.errors ?? []) {
      const path = err.instancePath || "(root)";
      console.error(`  - ${path} ${err.message} (${err.keyword})`);
      if (err.params && Object.keys(err.params).length > 0) {
        console.error(`    params: ${JSON.stringify(err.params)}`);
      }
    }
  }
}

if (!hasFormats) {
  console.warn("Warning: ajv-formats not installed. date-time format check skipped.");
}

if (failed > 0) {
  console.error(`\n${failed} schema(s) failed validation.`);
  process.exit(1);
}

console.log(`\nAll ${PAIRS.length} schema(s) validated.`);
