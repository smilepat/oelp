#!/usr/bin/env node
/**
 * Generate fake responses for testing calibrate.mjs end-to-end.
 *
 * Writes data/fake-responses.json with N responses across multiple QTs.
 * Uses TRUE weights that diverge from the current v2 weights to simulate
 * dimension drift discovery.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const D2_D5 = ["D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

// True weights — differ slightly from current v2 (simulates real-world drift)
const TRUE_WEIGHTS = {
  "TYPE-요지": { D1_Form: 0.05, D2_Meaning: 0.08, D3_Context: 0.55, D4_Network: 0.22, D5_Usage: 0.1 },
  "TYPE-순서배열": { D1_Form: 0.05, D2_Meaning: 0.08, D3_Context: 0.42, D4_Network: 0.08, D5_Usage: 0.37 },
  "TYPE-빈칸추론": { D1_Form: 0.05, D2_Meaning: 0.18, D3_Context: 0.48, D4_Network: 0.22, D5_Usage: 0.07 },
};

function genFor(qtId, n) {
  const out = [];
  const truW = TRUE_WEIGHTS[qtId];
  for (let i = 0; i < n; i++) {
    const scores = {};
    for (const d of D2_D5) scores[d] = 20 + Math.random() * 70;
    scores.D1_Form = 20 + Math.random() * 70;
    let p = 0;
    for (const d of D2_D5) p += truW[d] * (scores[d] / 100);
    p += truW.D1_Form * (scores.D1_Form / 100);
    // Add small noise
    p += (Math.random() - 0.5) * 0.1;
    p = Math.max(0, Math.min(1, p));
    out.push({ qtId, dimensionScores: scores, isCorrect: Math.random() < p });
  }
  return out;
}

const responses = [
  ...genFor("TYPE-요지", 100),
  ...genFor("TYPE-순서배열", 80),
  ...genFor("TYPE-빈칸추론", 50),
  // TYPE-목적: only 10 responses (below threshold)
  ...genFor("TYPE-요지", 0).slice(0, 10),
];

if (!existsSync(join(ROOT, "data"))) mkdirSync(join(ROOT, "data"));
const outPath = join(ROOT, "data", "fake-responses.json");
writeFileSync(outPath, JSON.stringify(responses, null, 2));
console.log(`Wrote ${responses.length} responses to data/fake-responses.json`);
console.log("True weights (differ from v2 prior):");
for (const [qt, w] of Object.entries(TRUE_WEIGHTS)) {
  console.log(`  ${qt}: D2=${(w.D2_Meaning * 100).toFixed(0)}% D3=${(w.D3_Context * 100).toFixed(0)}% D4=${(w.D4_Network * 100).toFixed(0)}% D5=${(w.D5_Usage * 100).toFixed(0)}%`);
}
