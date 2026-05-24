#!/usr/bin/env node
/**
 * simulate-option-a-prime — 본인이 옵션 A' PR 작성 전 미리 검증하는 도구.
 *
 * v10 finding: 옵션 A1 단독 (weight만 boost)은 C4.1 게이트가 거부.
 * 정식 옵션 A'는 keyVariables 추가 + weight 변경 동시. 본 도구는
 * 4 파일 변경을 in-memory로 시뮬하고 C4.1을 mock 실행해서 PASS/FAIL
 * 예측. 본인은 결과 확인 후 진짜 PR 시작.
 *
 * 실 파일은 절대 수정 안 함 — git 안전.
 *
 * 출력:
 *   - 옵션 A' 적용 후 예상 derived weights (TYPE-제목)
 *   - C4.1 게이트 예측 결과 (tau + contradictions)
 *   - dogfood-9 매트릭스 변동 예상 (D2-D5 영향)
 *
 * Run:
 *   node scripts/simulate-option-a-prime.mjs           # 기본 옵션 A' 시나리오
 *   node scripts/simulate-option-a-prime.mjs --verbose # 4 파일 diff 미리보기
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
function parseArgs(argv) {
  const out = {};
  for (const a of argv) if (a.startsWith("--")) out[a.slice(2)] = true;
  return out;
}
const verbose = args.verbose;

// ─── 옵션 A' 변경 사항 정의 ─────────────────────────────────────────

const PROPOSED_NEW_KV = {
  morphological_complexity: ["D1_Form", "D2_Meaning"],
  orthographic_irregularity: ["D1_Form"],
  word_length_distribution: ["D1_Form", "D5_Usage"],
};

const PROPOSED_TYPE_제목_KV_ADDITIONS = [
  "morphological_complexity",
  "orthographic_irregularity",
];

const PROPOSED_TYPE_제목_WEIGHT = {
  D1_Form: 0.20,
  D2_Meaning: 0.08,
  D3_Context: 0.29,
  D4_Network: 0.34,
  D5_Usage: 0.09,
};

// ─── 현 상태 로드 ────────────────────────────────────────────────────

const kvMappingSrc = readFileSync(join(ROOT, "lib", "kv-dim-mapping.ts"), "utf-8");
const currentKvMapping = {};
const mappingRe = /^\s+(\w+):\s*\[([^\]]+)\],?\s*$/gm;
let m;
while ((m = mappingRe.exec(kvMappingSrc)) !== null) {
  const key = m[1];
  const dims = m[2].split(",").map((s) => s.trim().replace(/['"]/g, ""));
  if (dims.every((d) => /^D\d_/.test(d))) currentKvMapping[key] = dims;
}

const weights = JSON.parse(readFileSync(join(ROOT, "lib", "ontology-weights.json"), "utf-8"));
const ontologySrc = readFileSync(join(ROOT, "lib", "ontology.ts"), "utf-8");

// Extract TYPE-제목 keyVariables (regex match — fragile but works)
const titleKvMatch = ontologySrc.match(/id: "TYPE-제목"[\s\S]+?keyVariables: \[([\s\S]+?)\]/);
let titleKvCurrent = [];
if (titleKvMatch) {
  titleKvCurrent = titleKvMatch[1]
    .split(",")
    .map((s) => s.trim().replace(/['"]/g, ""))
    .filter((s) => s.length > 0);
}

const titleKey = Object.keys(weights.weights).find((k) => k.endsWith("제목"));
const titleWeightCurrent = weights.weights[titleKey];

// ─── 예상 변경 후 상태 시뮬 ─────────────────────────────────────────

const proposedKvMapping = { ...currentKvMapping, ...PROPOSED_NEW_KV };
const proposedTitleKv = [...titleKvCurrent, ...PROPOSED_TYPE_제목_KV_ADDITIONS];

// ─── derived weight 계산 (kv-dim-mapping logic mirror) ─────────────

function deriveWeights(keyVariables, kvMapping) {
  const DIMS = ["D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage"];
  const acc = Object.fromEntries(DIMS.map((d) => [d, 0]));
  for (const kv of keyVariables) {
    const dims = kvMapping[kv] ?? [];
    const share = dims.length > 0 ? 1 / dims.length : 0;
    for (const d of dims) acc[d] += share;
  }
  const sum = Object.values(acc).reduce((a, b) => a + b, 0);
  if (sum === 0) return acc;
  for (const d of DIMS) acc[d] = +(acc[d] / sum).toFixed(3);
  return acc;
}

const titleDerivedBefore = deriveWeights(titleKvCurrent, currentKvMapping);
const titleDerivedAfter = deriveWeights(proposedTitleKv, proposedKvMapping);

// ─── C4.1 게이트 예측 ────────────────────────────────────────────────

function checkContradictions(declared, derived) {
  const issues = [];
  for (const d of Object.keys(declared)) {
    if (declared[d] >= 0.15 && derived[d] === 0) {
      issues.push({ dim: d, declared: declared[d], derived: derived[d], type: "declared without evidence" });
    }
    if (derived[d] >= 0.20 && declared[d] < 0.05) {
      issues.push({ dim: d, declared: declared[d], derived: derived[d], type: "evidence without declaration" });
    }
  }
  return issues;
}

const contradictionsBefore = checkContradictions(titleWeightCurrent, titleDerivedBefore);
const contradictionsAfter = checkContradictions(PROPOSED_TYPE_제목_WEIGHT, titleDerivedAfter);

// ─── Kendall tau (간이 — declared vs derived rank 비교) ─────────────

function kendallTau(declared, derived) {
  const DIMS = Object.keys(declared);
  const pairs = DIMS.map((d) => ({ d, decl: declared[d], deri: derived[d] }));
  let concordant = 0, discordant = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const a = pairs[i], b = pairs[j];
      const declSign = Math.sign(a.decl - b.decl);
      const deriSign = Math.sign(a.deri - b.deri);
      if (declSign * deriSign > 0) concordant++;
      else if (declSign * deriSign < 0) discordant++;
    }
  }
  const total = concordant + discordant;
  return total === 0 ? 0 : (concordant - discordant) / total;
}

const tauBefore = kendallTau(titleWeightCurrent, titleDerivedBefore);
const tauAfter = kendallTau(PROPOSED_TYPE_제목_WEIGHT, titleDerivedAfter);

// ─── Output ────────────────────────────────────────────────────────────

const passBefore = contradictionsBefore.length === 0 && tauBefore >= 0.4;
const passAfter = contradictionsAfter.length === 0 && tauAfter >= 0.4;

console.log(JSON.stringify({
  optionAPrimePrePR: {
    proposedChanges: {
      "lib/kv-dim-mapping.ts": {
        addedKv: Object.keys(PROPOSED_NEW_KV).map((kv) => ({
          name: kv,
          dims: PROPOSED_NEW_KV[kv],
        })),
        newKvCount: Object.keys(currentKvMapping).length + Object.keys(PROPOSED_NEW_KV).length,
      },
      "lib/ontology.ts": {
        targetQt: "TYPE-제목",
        addedKv: PROPOSED_TYPE_제목_KV_ADDITIONS,
        before: titleKvCurrent,
        after: proposedTitleKv,
      },
      "lib/ontology-weights.json": {
        targetQt: titleKey,
        before: titleWeightCurrent,
        after: PROPOSED_TYPE_제목_WEIGHT,
      },
      "myprojects/docs/01-plan/dimension-mapping.md": "§3 keyVariables 표 + §2 가중치 표 갱신 (수동)",
    },
    typeTitleAnalysis: {
      derivedBefore: titleDerivedBefore,
      derivedAfter: titleDerivedAfter,
      declaredBefore: titleWeightCurrent,
      declaredAfter: PROPOSED_TYPE_제목_WEIGHT,
    },
    c4_1_gateBefore: {
      tau: +tauBefore.toFixed(3),
      contradictions: contradictionsBefore,
      verdict: passBefore ? "PASS" : "FAIL",
    },
    c4_1_gateAfter: {
      tau: +tauAfter.toFixed(3),
      contradictions: contradictionsAfter,
      verdict: passAfter ? "PASS" : "FAIL",
    },
    recommendation: passAfter
      ? "✅ 옵션 A' PR safe — 본인이 4 파일 변경 진행하면 C4.1 게이트 통과 예상"
      : "❌ 옵션 A' 변경에 추가 조정 필요 — keyVariables 또는 weight 재검토",
  },
}, null, 2));

if (verbose) {
  console.error("\n=== 4 파일 diff 미리보기 ===\n");
  console.error("1. lib/kv-dim-mapping.ts (3 신규 entries):");
  for (const [kv, dims] of Object.entries(PROPOSED_NEW_KV)) {
    console.error(`   + ${kv}: [${dims.join(", ")}],`);
  }
  console.error("\n2. lib/ontology.ts (TYPE-제목 keyVariables):");
  console.error(`   - ${JSON.stringify(titleKvCurrent)}`);
  console.error(`   + ${JSON.stringify(proposedTitleKv)}`);
  console.error("\n3. lib/ontology-weights.json (TYPE-제목 weights):");
  console.error(`   - ${JSON.stringify(titleWeightCurrent)}`);
  console.error(`   + ${JSON.stringify(PROPOSED_TYPE_제목_WEIGHT)}`);
  console.error("\n4. dimension-mapping.md §3 — 수동 작성 (본 도구 범위 외)");
}

if (!passAfter) process.exit(1);
