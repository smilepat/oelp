/**
 * @vitest-environment node
 *
 * Vitest — simulate-option-a-prime.mjs contract + safety test.
 *
 * Validates that:
 *   - Script output structure remains stable (본인 PR script 의존)
 *   - 현 production state에서 simulate가 PASS verdict 출력 (옵션 A' safe sentinel)
 *   - 본인이 4 파일 변경 후 실 C4.1 게이트 결과와 시뮬 verdict 일치 보장
 *
 * 옵션 A' PR 후 simulator가 무의미해지면 (D1 derived ≠ 0) T2 assertion이
 * flip → reminder로 script + 본 test 정리.
 */
import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "simulate-option-a-prime.mjs");

interface SimResult {
  optionAPrimePrePR: {
    proposedChanges: {
      "lib/kv-dim-mapping.ts": { newKvCount: number; addedKv: Array<{ name: string; dims: string[] }> };
      "lib/ontology.ts": { targetQt: string; addedKv: string[]; before: string[]; after: string[] };
      "lib/ontology-weights.json": { targetQt: string; before: Record<string, number>; after: Record<string, number> };
    };
    typeTitleAnalysis: {
      derivedBefore: Record<string, number>;
      derivedAfter: Record<string, number>;
      declaredBefore: Record<string, number>;
      declaredAfter: Record<string, number>;
    };
    c4_1_gateBefore: { tau: number; contradictions: unknown[]; verdict: "PASS" | "FAIL" };
    c4_1_gateAfter: { tau: number; contradictions: unknown[]; verdict: "PASS" | "FAIL" };
    recommendation: string;
  };
}

function runScript(args: string[] = []): { stdout: string; status: number } {
  const r = spawnSync("node", [SCRIPT, ...args], { encoding: "utf-8" });
  return { stdout: r.stdout, status: r.status ?? -1 };
}

describe("simulate-option-a-prime.mjs", () => {
  test("T1: output structure stable + script exits 0 on PASS verdict", () => {
    const { stdout, status } = runScript();
    expect(status).toBe(0);
    const r: SimResult = JSON.parse(stdout);
    expect(r.optionAPrimePrePR).toBeDefined();
    expect(r.optionAPrimePrePR.c4_1_gateBefore.verdict).toBeDefined();
    expect(r.optionAPrimePrePR.c4_1_gateAfter.verdict).toBeDefined();
  });

  test("T2: current production state — simulated option A' → PASS (sentinel)", () => {
    // 본인이 옵션 A' PR 진행 전까지 PASS 유지. 만약 production weight 또는
    // keyVariables 변경 후 verdict가 FAIL로 flip하면 simulator 또는 옵션 정의
    // 자체 재검토 필요. 본 test가 reminder.
    const { stdout } = runScript();
    const r: SimResult = JSON.parse(stdout);
    expect(r.optionAPrimePrePR.c4_1_gateAfter.verdict).toBe("PASS");
    expect(r.optionAPrimePrePR.c4_1_gateAfter.contradictions).toEqual([]);
  });

  test("T3: D1_Form derived weight changes 0 → >0 after option A' (proves intent)", () => {
    const { stdout } = runScript();
    const r: SimResult = JSON.parse(stdout);
    expect(r.optionAPrimePrePR.typeTitleAnalysis.derivedBefore.D1_Form).toBe(0);
    expect(r.optionAPrimePrePR.typeTitleAnalysis.derivedAfter.D1_Form).toBeGreaterThan(0);
  });

  test("T4: declared D1_Form 0.05 → 0.20 (option A1 weight portion)", () => {
    const { stdout } = runScript();
    const r: SimResult = JSON.parse(stdout);
    expect(r.optionAPrimePrePR.typeTitleAnalysis.declaredBefore.D1_Form).toBe(0.05);
    expect(r.optionAPrimePrePR.typeTitleAnalysis.declaredAfter.D1_Form).toBe(0.20);
  });

  test("T5: tau ≥ 0.4 (C4.1 threshold) before and after", () => {
    const { stdout } = runScript();
    const r: SimResult = JSON.parse(stdout);
    expect(r.optionAPrimePrePR.c4_1_gateBefore.tau).toBeGreaterThanOrEqual(0.4);
    expect(r.optionAPrimePrePR.c4_1_gateAfter.tau).toBeGreaterThanOrEqual(0.4);
  });

  test("T6: 3 new keyVariables proposed for D1_Form coverage", () => {
    const { stdout } = runScript();
    const r: SimResult = JSON.parse(stdout);
    const addedKv = r.optionAPrimePrePR.proposedChanges["lib/kv-dim-mapping.ts"].addedKv;
    expect(addedKv.length).toBe(3);
    // 최소 한 개는 D1_Form 매핑 포함
    const hasD1Mapping = addedKv.some((kv) => kv.dims.includes("D1_Form"));
    expect(hasD1Mapping).toBe(true);
    // 모든 신규 kv는 D1_Form 포함 (이 PR의 목적)
    for (const kv of addedKv) {
      expect(kv.dims).toContain("D1_Form");
    }
  });

  test("T7: TYPE-제목 keyVariables 배열에 2개 추가 (before + 2 = after)", () => {
    const { stdout } = runScript();
    const r: SimResult = JSON.parse(stdout);
    const ontologyChange = r.optionAPrimePrePR.proposedChanges["lib/ontology.ts"];
    expect(ontologyChange.after.length).toBe(ontologyChange.before.length + 2);
    expect(ontologyChange.addedKv.length).toBe(2);
  });
});
