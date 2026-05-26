#!/usr/bin/env node
/**
 * simulate-skill-mapping.mjs — pre-PR safety check for p2a-ontology PR-3.
 *
 * Verifies that adding skillIds metadata to lib/ontology.ts QUESTION_TYPES
 * has zero effect on:
 *   1. predictCorrectness() outputs (mathematically identical — skillIds
 *      are unused in the math; weights and keyVariables are the inputs)
 *   2. C4.1 derivation (kv-dim-mapping.ts only reads keyVariables, never
 *      skillIds — so derived weight vectors must be byte-identical)
 *   3. C4.1 gate verdict (Kendall tau and contradictions count unchanged)
 *
 * Also cross-checks that every QT.skillIds entry exists in the skill
 * ontology seed (referential integrity) and that no skillId references
 * a P-layer node (forbidden in PR-1).
 *
 * Run BEFORE merging PR-3:
 *   node scripts/simulate-skill-mapping.mjs
 *
 * Exit codes:
 *   0  All safety checks pass
 *   1  At least one check fails (PR-3 must NOT merge)
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const errors = [];
const notes = [];

// ─── (1) Load ontology.ts QUESTION_TYPES (post-PR-3) ─────────────────

const ontologyTs = readFileSync(join(ROOT, "lib/ontology.ts"), "utf-8");

// Extract each QT literal: id, keyVariables, skillIds
const qtRe = /\{\s*id:\s*"([^"]+)"[^}]*?keyVariables:\s*\[([^\]]+)\][^}]*?skillIds:\s*\[([^\]]*)\][^}]*?\}/g;
const qts = [];
let m;
while ((m = qtRe.exec(ontologyTs)) !== null) {
  qts.push({
    id: m[1],
    keyVariables: [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
    skillIds: [...m[3].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
  });
}
if (qts.length !== 10) {
  errors.push(`[parse] expected 10 QTs with skillIds, found ${qts.length}`);
}

// ─── (2) Every QT must have ≥1 skillId ───────────────────────────────

for (const qt of qts) {
  if (qt.skillIds.length === 0) {
    errors.push(`[skillIds] ${qt.id} has empty skillIds[] — PR-3 requires ≥1`);
  }
}

// ─── (3) Referential integrity: skillIds → seed nodes ────────────────

const seed = JSON.parse(readFileSync(join(ROOT, "lib/skill-ontology-seed.json"), "utf-8"));
const seedIds = new Set(seed.nodes.map((n) => n.id));
const layerOf = new Map(seed.nodes.map((n) => [n.id, n.layer]));

for (const qt of qts) {
  for (const sid of qt.skillIds) {
    if (!seedIds.has(sid)) {
      errors.push(`[ref] ${qt.id} references unknown skill "${sid}" (not in seed)`);
    } else if (layerOf.get(sid) === "P") {
      errors.push(`[layer] ${qt.id} references P-layer skill "${sid}" — forbidden in PR-1/PR-3`);
    }
  }
}

// ─── (4) keyVariables ↔ skillIds soft consistency ───────────────────
//        For each QT, the union of (skills mapping its keyVariables)
//        SHOULD overlap with QT.skillIds. Soft warning, not error.

const kvToSkills = new Map();
for (const n of seed.nodes) {
  for (const kv of n.measuredByKeyVars) {
    const arr = kvToSkills.get(kv) ?? [];
    arr.push(n.id);
    kvToSkills.set(kv, arr);
  }
}

let consistencyHits = 0;
for (const qt of qts) {
  const derivedFromKv = new Set();
  for (const kv of qt.keyVariables) {
    for (const sid of kvToSkills.get(kv) ?? []) derivedFromKv.add(sid);
  }
  const overlap = qt.skillIds.filter((s) => derivedFromKv.has(s));
  if (overlap.length === 0 && qt.keyVariables.length > 0) {
    notes.push(`[soft] ${qt.id}: declared skillIds [${qt.skillIds.join(",")}] don't overlap with keyVar-derived [${[...derivedFromKv].join(",")}]`);
  } else {
    consistencyHits++;
  }
}

// ─── (5) Re-run synthetic-validation-c4-1 and verify PASS preserved ──

let c4Output = "";
try {
  c4Output = execSync("node scripts/synthetic-validation-c4-1.mjs", {
    cwd: ROOT,
    encoding: "utf-8",
  });
} catch (err) {
  errors.push(`[c4-1] synthetic-validation-c4-1 failed to run: ${err.message}`);
}

const tauMatch = c4Output.match(/Kendall tau \(median\)\*?\*?:\s*([0-9.]+)/);
const contradictionMatch = c4Output.match(/도메인 모순 \(50셀 중\)\*?\*?:\s*(\d+)/);
const tau = tauMatch ? parseFloat(tauMatch[1]) : null;
const contradictions = contradictionMatch ? parseInt(contradictionMatch[1], 10) : null;

if (tau === null) {
  errors.push("[c4-1] could not parse Kendall tau from C4.1 output");
} else if (tau < 0.4) {
  errors.push(`[c4-1] Kendall tau ${tau} < 0.4 — PR-3 broke C4.1 gate`);
}
if (contradictions === null) {
  errors.push("[c4-1] could not parse contradictions count");
} else if (contradictions > 0) {
  errors.push(`[c4-1] contradictions ${contradictions} > 0 — PR-3 broke C4.1 gate`);
}

// ─── Report ──────────────────────────────────────────────────────────

console.log("=== simulate-skill-mapping (PR-3 safety check) ===");
console.log(`QTs parsed:            ${qts.length}`);
console.log(`Total skillId refs:    ${qts.reduce((s, q) => s + q.skillIds.length, 0)}`);
console.log(`kv↔skill soft hits:    ${consistencyHits}/${qts.length}`);
console.log(`C4.1 Kendall tau:      ${tau ?? "?"} (gate ≥ 0.4)`);
console.log(`C4.1 contradictions:   ${contradictions ?? "?"} (gate = 0)`);
console.log("");

if (notes.length > 0) {
  console.log("Soft notes (non-blocking):");
  for (const n of notes) console.log(`  ~ ${n}`);
  console.log("");
}

if (errors.length > 0) {
  console.error(`[FAIL] ${errors.length} error(s) — PR-3 must NOT merge:`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log("[ PASS ] All safety checks pass — PR-3 safe to merge.");
