#!/usr/bin/env node
/**
 * Unit tests for lib/recommendation-store.ts.
 *
 * Mocks localStorage in Node (Map-based). Tests storage round-trip,
 * fingerprint drift detection, reseed blending, and session persistence.
 *
 * Inline-mirrors lib/recommendation-store.ts logic (TS loader avoidance).
 * Keep in sync with the real file.
 */

import { strict as assert } from "node:assert";

// ─── localStorage mock ───────────────────────────────────────────────

const _store = new Map();
globalThis.localStorage = {
  getItem(k) { return _store.has(k) ? _store.get(k) : null; },
  setItem(k, v) { _store.set(k, String(v)); },
  removeItem(k) { _store.delete(k); },
  clear() { _store.clear(); },
  get length() { return _store.size; },
  key(i) { return Array.from(_store.keys())[i] ?? null; },
};

// ─── Inline mirror: QUESTION_TYPES (subset for test) + recommendation logic ──

const QUESTION_TYPES = [
  { id: "TYPE-목적", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.1, D5_Usage: 0.25 } },
  { id: "TYPE-심경", weights: { D1_Form: 0.05, D2_Meaning: 0.35, D3_Context: 0.4, D4_Network: 0.1, D5_Usage: 0.1 } },
  { id: "TYPE-주장", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.2 } },
  { id: "TYPE-요지", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.5, D4_Network: 0.25, D5_Usage: 0.1 } },
  { id: "TYPE-주제", weights: { D1_Form: 0.05, D2_Meaning: 0.25, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.05 } },
  { id: "TYPE-제목", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.35, D4_Network: 0.4, D5_Usage: 0.1 } },
  { id: "TYPE-빈칸추론", weights: { D1_Form: 0.05, D2_Meaning: 0.2, D3_Context: 0.45, D4_Network: 0.2, D5_Usage: 0.1 } },
  { id: "TYPE-흐름무관", weights: { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.55, D4_Network: 0.1, D5_Usage: 0.15 } },
  { id: "TYPE-순서배열", weights: { D1_Form: 0.05, D2_Meaning: 0.1, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.3 } },
  { id: "TYPE-문장삽입", weights: { D1_Form: 0.05, D2_Meaning: 0.15, D3_Context: 0.45, D4_Network: 0.1, D5_Usage: 0.25 } },
];

const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];

function predictCorrectness(scores, qt) {
  let sum = 0;
  for (const d of DIMS) sum += qt.weights[d] * ((scores[d] ?? 0) / 100);
  return sum;
}

function priorFromDiagnostic(qt, scores, strength = 5) {
  const p = predictCorrectness(scores, qt);
  return { qtId: qt.id, alpha: 1 + p * strength, beta: 1 + (1 - p) * strength, samples: 0 };
}

function initialPosteriors(scores) {
  const m = {};
  for (const qt of QUESTION_TYPES) m[qt.id] = priorFromDiagnostic(qt, scores);
  return m;
}

// ─── Inline mirror: store functions ──────────────────────────────────

const STORAGE_KEY_PREFIX = "oelp.posteriors";
const SCHEMA_VERSION = 1;
const DEFAULT_USER_ID = "default";

function storageKey(userId) { return `${STORAGE_KEY_PREFIX}.${userId}`; }

function diagnosticFingerprint(scores) {
  return DIMS.map((d) => {
    const s = scores[d] ?? 0;
    return `${d}=${Math.round(s / 5) * 5}`;
  }).join("|");
}

function loadPosteriors(scores, userId = DEFAULT_USER_ID) {
  let env = null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) env = JSON.parse(raw);
  } catch {}
  if (!env || env.schemaVersion !== SCHEMA_VERSION) return initialPosteriors(scores);
  if (env.diagnosticFingerprint !== diagnosticFingerprint(scores)) {
    return reseedPosteriors(env.posteriors, scores);
  }
  const out = {};
  for (const qt of QUESTION_TYPES) {
    out[qt.id] = env.posteriors[qt.id] ?? priorFromDiagnostic(qt, scores);
  }
  return out;
}

function savePosteriors(posteriors, scores, userId = DEFAULT_USER_ID) {
  const env = {
    schemaVersion: SCHEMA_VERSION,
    userId,
    updatedAt: new Date().toISOString(),
    diagnosticFingerprint: diagnosticFingerprint(scores),
    posteriors,
  };
  localStorage.setItem(storageKey(userId), JSON.stringify(env));
}

function clearPosteriors(userId = DEFAULT_USER_ID) {
  localStorage.removeItem(storageKey(userId));
}

function reseedPosteriors(oldP, newScores, blendOld = 0.7) {
  const blendNew = 1 - blendOld;
  const out = {};
  for (const qt of QUESTION_TYPES) {
    const old = oldP[qt.id];
    const np = priorFromDiagnostic(qt, newScores);
    if (!old) { out[qt.id] = np; continue; }
    const oldMean = old.alpha / (old.alpha + old.beta);
    const newMean = np.alpha / (np.alpha + np.beta);
    const blendedMean = blendOld * oldMean + blendNew * newMean;
    const oldStr = old.alpha + old.beta;
    const newStr = oldStr * blendOld + (np.alpha + np.beta) * blendNew;
    out[qt.id] = {
      qtId: qt.id,
      alpha: blendedMean * newStr,
      beta: (1 - blendedMean) * newStr,
      samples: Math.floor(old.samples * blendOld),
    };
  }
  return out;
}

function persistSessionResponses(responses, scores, userId = DEFAULT_USER_ID) {
  const cur = loadPosteriors(scores, userId);
  const next = { ...cur };
  for (const r of responses) {
    const c = next[r.qtId];
    if (!c) continue;
    next[r.qtId] = {
      qtId: r.qtId,
      alpha: c.alpha + (r.isCorrect ? 1 : 0),
      beta: c.beta + (r.isCorrect ? 0 : 1),
      samples: c.samples + 1,
    };
  }
  savePosteriors(next, scores, userId);
  return next;
}

// ─── Test fixtures ──────────────────────────────────────────────────

const DEMO_SCORES = { D1_Form: 78, D2_Meaning: 82, D3_Context: 45, D4_Network: 60, D5_Usage: 71 };
const DRIFTED_SCORES = { D1_Form: 78, D2_Meaning: 82, D3_Context: 70, D4_Network: 60, D5_Usage: 71 }; // D3 jumped 45→70

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
    console.log(`✗ ${name}\n   ${e.message}`);
  }
}

function resetStorage() { localStorage.clear(); }

// ─── Tests ──────────────────────────────────────────────────────────

test("T1: First load (empty storage) returns initial priors", () => {
  resetStorage();
  const p = loadPosteriors(DEMO_SCORES);
  assert.equal(Object.keys(p).length, 10);
  assert.equal(p["TYPE-요지"].samples, 0);
});

test("T2: Save → load round-trip preserves posteriors", () => {
  resetStorage();
  const p = loadPosteriors(DEMO_SCORES);
  p["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 10, beta: 5, samples: 13 };
  savePosteriors(p, DEMO_SCORES);
  const loaded = loadPosteriors(DEMO_SCORES);
  assert.deepEqual(loaded["TYPE-요지"], p["TYPE-요지"]);
});

test("T3: diagnosticFingerprint stable across small jitter (±2 within bucket)", () => {
  const fp1 = diagnosticFingerprint(DEMO_SCORES);
  const fp2 = diagnosticFingerprint({ ...DEMO_SCORES, D3_Context: 47 }); // 45 → 47 same bucket
  assert.equal(fp1, fp2);
});

test("T4: diagnosticFingerprint changes when score crosses bucket", () => {
  const fp1 = diagnosticFingerprint(DEMO_SCORES); // D3=45
  const fp2 = diagnosticFingerprint(DRIFTED_SCORES); // D3=70
  assert.notEqual(fp1, fp2);
});

test("T5: Load with drifted diagnostic triggers reseed (not raw load)", () => {
  resetStorage();
  // Pre-populate with accumulated posteriors
  const initial = loadPosteriors(DEMO_SCORES);
  initial["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 50, beta: 50, samples: 95 };
  savePosteriors(initial, DEMO_SCORES);

  // Load with drifted scores
  const reloaded = loadPosteriors(DRIFTED_SCORES);
  // Reseeded posterior should blend — alpha shouldn't be 50 anymore
  assert.notEqual(reloaded["TYPE-요지"].alpha, 50);
  // But samples should be retained (× 0.7)
  assert.ok(reloaded["TYPE-요지"].samples >= 60 && reloaded["TYPE-요지"].samples <= 70, `samples ${reloaded["TYPE-요지"].samples}`);
});

test("T6: Reseed blends old mean with new prior mean", () => {
  const old = {};
  for (const qt of QUESTION_TYPES) old[qt.id] = priorFromDiagnostic(qt, DEMO_SCORES);
  // Force a strong old posterior on 요지 (mean = 0.9)
  old["TYPE-요지"] = { qtId: "TYPE-요지", alpha: 90, beta: 10, samples: 95 };

  const reseeded = reseedPosteriors(old, DRIFTED_SCORES);
  const newMean = reseeded["TYPE-요지"].alpha / (reseeded["TYPE-요지"].alpha + reseeded["TYPE-요지"].beta);
  // Old mean 0.9 + 0.7 weight, new prior mean ~0.55 + 0.3 weight → ~0.795
  assert.ok(newMean > 0.7 && newMean < 0.9, `blended mean ${newMean} should be ~0.795`);
});

test("T7: persistSessionResponses updates and saves", () => {
  resetStorage();
  const responses = [
    { qtId: "TYPE-요지", isCorrect: true },
    { qtId: "TYPE-요지", isCorrect: false },
    { qtId: "TYPE-요지", isCorrect: true },
  ];
  const after = persistSessionResponses(responses, DEMO_SCORES);
  const initial = priorFromDiagnostic({ id: "TYPE-요지", weights: QUESTION_TYPES.find(q => q.id === "TYPE-요지").weights }, DEMO_SCORES);
  assert.equal(after["TYPE-요지"].alpha, initial.alpha + 2);
  assert.equal(after["TYPE-요지"].beta, initial.beta + 1);
  assert.equal(after["TYPE-요지"].samples, 3);

  // Verify persisted
  const reloaded = loadPosteriors(DEMO_SCORES);
  assert.equal(reloaded["TYPE-요지"].alpha, after["TYPE-요지"].alpha);
});

test("T8: clearPosteriors wipes state", () => {
  resetStorage();
  savePosteriors(initialPosteriors(DEMO_SCORES), DEMO_SCORES);
  assert.ok(localStorage.getItem("oelp.posteriors.default") !== null);
  clearPosteriors();
  assert.equal(localStorage.getItem("oelp.posteriors.default"), null);
});

test("T9: Corrupted JSON falls back to initial priors", () => {
  resetStorage();
  localStorage.setItem("oelp.posteriors.default", "{invalid json");
  const p = loadPosteriors(DEMO_SCORES);
  assert.equal(Object.keys(p).length, 10);
  assert.equal(p["TYPE-요지"].samples, 0);
});

test("T10: Schema version mismatch triggers fresh prior", () => {
  resetStorage();
  const old = {
    schemaVersion: 99,  // future version
    userId: "default",
    updatedAt: new Date().toISOString(),
    diagnosticFingerprint: diagnosticFingerprint(DEMO_SCORES),
    posteriors: { "TYPE-요지": { qtId: "TYPE-요지", alpha: 99, beta: 1, samples: 99 } },
  };
  localStorage.setItem("oelp.posteriors.default", JSON.stringify(old));
  const p = loadPosteriors(DEMO_SCORES);
  // Should NOT preserve the alpha=99 (mismatch → fresh)
  assert.notEqual(p["TYPE-요지"].alpha, 99);
});

test("T11: Multi-user — independent storage keys", () => {
  resetStorage();
  const responsesA = [{ qtId: "TYPE-요지", isCorrect: true }];
  const responsesB = [{ qtId: "TYPE-요지", isCorrect: false }];
  persistSessionResponses(responsesA, DEMO_SCORES, "userA");
  persistSessionResponses(responsesB, DEMO_SCORES, "userB");
  const a = loadPosteriors(DEMO_SCORES, "userA");
  const b = loadPosteriors(DEMO_SCORES, "userB");
  // A: +1 alpha. B: +1 beta. Means differ.
  const meanA = a["TYPE-요지"].alpha / (a["TYPE-요지"].alpha + a["TYPE-요지"].beta);
  const meanB = b["TYPE-요지"].alpha / (b["TYPE-요지"].alpha + b["TYPE-요지"].beta);
  assert.ok(meanA > meanB, `userA mean ${meanA} should exceed userB mean ${meanB}`);
});

// ─── Summary ──────────────────────────────────────────────────────

const passed = results.filter((r) => r.pass).length;
const total = results.length;
console.log(`\n${passed} / ${total} tests passed`);
if (passed < total) process.exit(1);
