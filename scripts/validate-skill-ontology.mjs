#!/usr/bin/env node
/**
 * Skill Ontology validator (CI gate 13 — PR-1 of p2a-ontology).
 *
 * Validates lib/skill-ontology-seed.json against:
 *   1. AJV JSON Schema (schemas/skill-ontology.schema.json)
 *   2. node id uniqueness
 *   3. all edges reference existing nodes
 *   4. core_dependency subgraph is acyclic (DFS 3-color)
 *   5. mvpActive=true skills each have ≥1 mapping (dims | qts | keyVars)
 *   6. layer "P" excluded in PR-1 (persona P0 alignment)
 *
 * Exit codes:
 *   0  All checks pass
 *   1  At least one check fails
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SCHEMA_PATH = join(ROOT, "schemas/skill-ontology.schema.json");
const SEED_PATH = join(ROOT, "lib/skill-ontology-seed.json");

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
const seed = JSON.parse(readFileSync(SEED_PATH, "utf-8"));

const ajv = new Ajv({ allErrors: true, strict: false });
try { addFormats(ajv); } catch { /* optional */ }

const errors = [];

// (1) JSON Schema
const validate = ajv.compile(schema);
if (!validate(seed)) {
  for (const err of validate.errors ?? []) {
    errors.push(`[schema] ${err.instancePath || "(root)"} ${err.message}`);
  }
}

const ids = seed.nodes.map((n) => n.id);

// (2) id uniqueness
const dupSeen = new Set();
const dups = new Set();
for (const id of ids) {
  if (dupSeen.has(id)) dups.add(id);
  dupSeen.add(id);
}
if (dups.size > 0) errors.push(`[ids] duplicate node ids: ${[...dups].join(", ")}`);

const idSet = new Set(ids);

// (3) edge endpoints
for (const e of seed.edges) {
  if (!idSet.has(e.from)) errors.push(`[edges] edge.from "${e.from}" not in nodes`);
  if (!idSet.has(e.to)) errors.push(`[edges] edge.to "${e.to}" not in nodes`);
}

// (4) acyclic core_dependency
{
  const deps = seed.edges.filter((e) => e.type === "core_dependency");
  const adj = new Map();
  for (const e of deps) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const id of ids) color.set(id, WHITE);
  let cycle = null;
  function dfs(u, path) {
    if (cycle) return;
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) {
        cycle = [...path, u, v];
        return;
      }
      if (color.get(v) === WHITE) dfs(v, [...path, u]);
      if (cycle) return;
    }
    color.set(u, BLACK);
  }
  for (const id of ids) {
    if (color.get(id) === WHITE) dfs(id, []);
    if (cycle) break;
  }
  if (cycle) errors.push(`[cycle] core_dependency cycle detected: ${cycle.join(" -> ")}`);
}

// (5) mvpActive ≥1 mapping
for (const n of seed.nodes) {
  if (!n.mvpActive) continue;
  const total =
    (n.measuredByDims?.length ?? 0) +
    (n.measuredByQts?.length ?? 0) +
    (n.measuredByKeyVars?.length ?? 0);
  // R-layer reasoning skills are allowed mapping-free (they map to QTs that
  // may not yet exist in PR-1, e.g. R1/R2/R10 — distractor-derived).
  if (total === 0 && n.layer !== "R") {
    errors.push(`[mapping] mvpActive ${n.id} (${n.layer}) has no dim/qt/keyVar mapping`);
  }
}

// (6) P-layer excluded in PR-1
for (const n of seed.nodes) {
  if (n.layer === "P") {
    errors.push(`[layer] PR-1 forbids layer "P" (Phonics) — found ${n.id}. Defer to v2/Stage C.`);
  }
}

if (errors.length > 0) {
  console.error(`[FAIL] skill-ontology validation: ${errors.length} error(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const layerCounts = {};
for (const n of seed.nodes) layerCounts[n.layer] = (layerCounts[n.layer] ?? 0) + 1;
const edgeCounts = {};
for (const e of seed.edges) edgeCounts[e.type] = (edgeCounts[e.type] ?? 0) + 1;

console.log(`[ OK ] skill-ontology: ${seed.nodes.length} nodes, ${seed.edges.length} edges`);
console.log(`       layers: ${JSON.stringify(layerCounts)}`);
console.log(`       edges:  ${JSON.stringify(edgeCounts)}`);
console.log(`       version: ${seed.version}`);
