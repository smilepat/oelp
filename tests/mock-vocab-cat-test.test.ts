/**
 * @vitest-environment node
 *
 * Vitest — mock-vocab-cat-test.mjs contract test.
 *
 * Spawns the mock server, hits each endpoint, validates response shapes
 * exactly match what components/AdaptiveDiagnostic.tsx + scripts/
 * verify-vocab-cat-test.mjs consume. If the real vocab-cat-test API
 * changes, the mock must update too — this test catches drift.
 *
 * Why integration over unit:
 *   - The mock is a CLI binary (no exports). Integration is the natural
 *     fit and exercises the real spawn/socket path.
 *   - Validates JSON serialization + CORS headers exactly as browser
 *     would receive them.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 18765 + Math.floor(Math.random() * 100); // avoid conflict with dev/CI port 8000
let server: ChildProcess;

beforeAll(async () => {
  server = spawn("node", ["scripts/mock-vocab-cat-test.mjs", "--port", String(PORT), "--items", "3"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Wait for "listening" line
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("mock server start timeout")), 3000);
    server.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
  // Small additional settle delay
  await sleep(50);
}, 10_000);

afterAll(() => {
  if (server && !server.killed) server.kill("SIGTERM");
});

const base = () => `http://localhost:${PORT}`;

describe("mock-vocab-cat-test API contract", () => {
  test("GET /health → 200 with status ok + mock flag", async () => {
    const res = await fetch(`${base()}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.mock).toBe(true);
    expect(typeof body.seed).toBe("number");
  });

  test("POST /api/v1/test/start → session_id + first_item with all required fields", async () => {
    const res = await fetch(`${base()}/api/v1/test/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade: "고2", nickname: "contract-test" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_id).toBeTruthy();
    expect(typeof body.session_id).toBe("string");
    expect(body.first_item).toBeDefined();
    // AdaptiveDiagnostic reads: item_id, word, stem, correct_answer, options, pos, cefr
    expect(typeof body.first_item.item_id).toBe("number");
    expect(typeof body.first_item.word).toBe("string");
    expect(typeof body.first_item.stem).toBe("string");
    expect(typeof body.first_item.correct_answer).toBe("string");
    expect(Array.isArray(body.first_item.options)).toBe(true);
    expect(body.first_item.options.length).toBeGreaterThanOrEqual(2);
    expect(body.first_item.options).toContain(body.first_item.correct_answer);
    expect(body.progress.is_complete).toBe(false);
  });

  test("POST /respond → next_item until completion, then null", async () => {
    // Start a fresh session
    const startRes = await fetch(`${base()}/api/v1/test/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade: "고1" }),
    });
    const { session_id } = await startRes.json();

    // Mock was started with --items 3 → expect completion at the 3rd respond
    const trajectories: Array<{ items_completed: number; current_theta: number; current_se: number; is_complete: boolean }> = [];
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${base()}/api/v1/test/${session_id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: 10000 + i, is_correct: i % 2 === 0, response_time_ms: 4000 }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      trajectories.push(body.progress);
      if (body.progress.is_complete) {
        expect(body.next_item).toBeNull();
        break;
      } else {
        expect(body.next_item).toBeTruthy();
      }
    }
    // SE should monotonically decrease (Fisher decay)
    for (let i = 1; i < trajectories.length; i++) {
      expect(trajectories[i].current_se).toBeLessThan(trajectories[i - 1].current_se);
    }
    // Final should be complete
    expect(trajectories[trajectories.length - 1].is_complete).toBe(true);
  });

  test("GET /results → theta + 5D dimension_scores matching DIM_MAP", async () => {
    // Fresh session, complete it, then fetch results
    const startRes = await fetch(`${base()}/api/v1/test/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade: "고3" }),
    });
    const { session_id } = await startRes.json();
    for (let i = 0; i < 3; i++) {
      await fetch(`${base()}/api/v1/test/${session_id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: 10000 + i, is_correct: true, response_time_ms: 4000 }),
      });
    }
    const res = await fetch(`${base()}/api/v1/test/${session_id}/results`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.theta).toBe("number");
    expect(typeof body.se).toBe("number");
    expect(typeof body.cefr_level).toBe("string");
    expect(typeof body.curriculum_level).toBe("string");
    expect(Array.isArray(body.dimension_scores)).toBe(true);
    expect(body.dimension_scores.length).toBe(5);
    // AdaptiveDiagnostic DIM_MAP: semantic, contextual, form, relational, pragmatic
    const dims = body.dimension_scores.map((d: { dimension: string }) => d.dimension);
    expect(dims).toEqual(
      expect.arrayContaining(["semantic", "contextual", "form", "relational", "pragmatic"])
    );
    for (const d of body.dimension_scores) {
      expect(typeof d.score).toBe("number");
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
    }
  });

  test("GET /results on unknown session → 404", async () => {
    const res = await fetch(`${base()}/api/v1/test/nonexistent-sid/results`);
    expect(res.status).toBe(404);
  });

  test("CORS headers present (Allow-Origin)", async () => {
    const res = await fetch(`${base()}/health`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("OPTIONS preflight → 204", async () => {
    const res = await fetch(`${base()}/health`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });
});
