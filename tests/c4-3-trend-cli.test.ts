/**
 * @vitest-environment node
 *
 * Vitest — c4-3-trend-cli.mjs contract test.
 *
 * CLI는 lib/trend-analysis.ts 로직을 JS로 재구현 (ESM-CJS interop 회피).
 * 본 test는 두 구현이 동일 결과를 출력하는지 sentinel 보호 + CLI
 * input/output 구조 안정성 보장.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "c4-3-trend-cli.mjs");
const TEMP_DIR = join(tmpdir(), "oelp-c4-3-test");
const TEMP_FILE = join(TEMP_DIR, "snapshots.json");
const TEMP_SESSIONS = join(TEMP_DIR, "sessions.json");

const SAMPLE_SNAPSHOTS = [
  { at: "2026-01-01T00:00:00Z", learnerId: "l1", source: "session", dimensionScores: { D1_Form: 60, D2_Meaning: 50, D3_Context: 55 } },
  { at: "2026-01-08T00:00:00Z", learnerId: "l1", source: "session", dimensionScores: { D1_Form: 60, D2_Meaning: 58, D3_Context: 60 } },
  { at: "2026-01-15T00:00:00Z", learnerId: "l1", source: "session", dimensionScores: { D1_Form: 60, D2_Meaning: 65, D3_Context: 65 } },
  { at: "2026-01-22T00:00:00Z", learnerId: "l1", source: "session", dimensionScores: { D1_Form: 60, D2_Meaning: 72, D3_Context: 70 } },
  { at: "2026-01-29T00:00:00Z", learnerId: "l1", source: "session", dimensionScores: { D1_Form: 60, D2_Meaning: 78, D3_Context: 75 } },
];

const SAMPLE_SESSIONS = [
  {
    sessionId: "s1",
    endedAt: "2026-01-01T00:00:00Z",
    responses: [{ dimensionScores: { D1_Form: 60, D2_Meaning: 50, D3_Context: 55 } }],
  },
  {
    sessionId: "s2",
    endedAt: "2026-01-15T00:00:00Z",
    responses: [{ dimensionScores: { D1_Form: 60, D2_Meaning: 65, D3_Context: 65 } }],
  },
  {
    sessionId: "s3",
    endedAt: "2026-01-29T00:00:00Z",
    responses: [{ dimensionScores: { D1_Form: 60, D2_Meaning: 78, D3_Context: 75 } }],
  },
];

beforeAll(() => {
  if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });
  writeFileSync(TEMP_FILE, JSON.stringify(SAMPLE_SNAPSHOTS));
  writeFileSync(TEMP_SESSIONS, JSON.stringify(SAMPLE_SESSIONS));
});

afterAll(() => {
  if (existsSync(TEMP_FILE)) unlinkSync(TEMP_FILE);
  if (existsSync(TEMP_SESSIONS)) unlinkSync(TEMP_SESSIONS);
});

function runCli(extraArgs: string[]): { stdout: string; status: number } {
  const r = spawnSync("node", [SCRIPT, ...extraArgs], { encoding: "utf-8" });
  return { stdout: r.stdout, status: r.status ?? -1 };
}

interface CliResult {
  snapshotsAnalyzed: number;
  numWindows: number;
  learnerId: string;
  slopes: Record<string, number | null>;
  varianceDirection: Record<string, "decreasing" | "increasing" | "flat" | "insufficient">;
  windows: Array<{ from: string; to: string; count: number; mean: Record<string, number | null> }>;
}

describe("c4-3-trend-cli.mjs", () => {
  test("T1: snapshots input → 정상 결과 + exit 0", () => {
    const { stdout, status } = runCli(["--input", TEMP_FILE, "--windows", "4"]);
    expect(status).toBe(0);
    const r: CliResult = JSON.parse(stdout);
    expect(r.snapshotsAnalyzed).toBe(5);
    expect(r.numWindows).toBe(4);
    expect(r.learnerId).toBe("l1");
    expect(r.windows.length).toBe(4);
  });

  test("T2: D2_Meaning slope > 0 (정상 학습)", () => {
    const { stdout } = runCli(["--input", TEMP_FILE, "--windows", "4"]);
    const r: CliResult = JSON.parse(stdout);
    expect(r.slopes.D2_Meaning).not.toBeNull();
    expect((r.slopes.D2_Meaning as number)).toBeGreaterThan(0);
  });

  test("T3: D1_Form slope === 0 (v10 finding 일치)", () => {
    const { stdout } = runCli(["--input", TEMP_FILE, "--windows", "4"]);
    const r: CliResult = JSON.parse(stdout);
    expect(r.slopes.D1_Form).toBe(0);
  });

  test("T4: --from-sessions input 지원", () => {
    const { stdout, status } = runCli(["--from-sessions", TEMP_SESSIONS, "--windows", "3"]);
    expect(status).toBe(0);
    const r: CliResult = JSON.parse(stdout);
    expect(r.snapshotsAnalyzed).toBe(3);
    expect(r.windows.length).toBe(3);
  });

  test("T5: missing input → exit 1", () => {
    const { status } = runCli([]);
    expect(status).toBe(1);
  });

  test("T6: non-existent file → exit 1", () => {
    const { status } = runCli(["--input", "/non/existent/file.json"]);
    expect(status).toBe(1);
  });

  test("T7: < 2 snapshots → exit 2 (insufficient data)", () => {
    const tooFew = join(TEMP_DIR, "too-few.json");
    writeFileSync(tooFew, JSON.stringify([SAMPLE_SNAPSHOTS[0]]));
    const { status } = runCli(["--input", tooFew]);
    expect(status).toBe(2);
    unlinkSync(tooFew);
  });

  test("T8: window count param 적용", () => {
    const { stdout: w4 } = runCli(["--input", TEMP_FILE, "--windows", "4"]);
    const { stdout: w2 } = runCli(["--input", TEMP_FILE, "--windows", "2"]);
    const r4: CliResult = JSON.parse(w4);
    const r2: CliResult = JSON.parse(w2);
    expect(r4.windows.length).toBe(4);
    expect(r2.windows.length).toBe(2);
  });
});
