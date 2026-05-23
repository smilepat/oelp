/**
 * Vitest — vocab-pool-source provenance (T3.1).
 *
 * Three drift sources this catches:
 *  A. Local CSV mismatch — if data/irt-5D-vocab.csv exists locally, its
 *     SHA-256 MUST match lib/vocab-pool-source.json. If not, vocabulary-pool.ts
 *     is stale → re-run scripts/build-vocab-pool.mjs.
 *  B. Metadata vs generated pool drift — VOCAB_POOL_META in vocabulary-pool.ts
 *     must match generatedCards in vocab-pool-source.json.
 *  C. Schema validation — already handled by schemas.test.ts + validate-schemas.mjs,
 *     but we re-assert here for completeness.
 *
 * CI without CSV: skips check A gracefully (CSV is gitignored).
 * Local with CSV: hard-fails A on mismatch.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { VOCAB_POOL, VOCAB_POOL_META } from "@/lib/vocabulary-pool";

const ROOT = process.cwd();
const META_PATH = join(ROOT, "lib", "vocab-pool-source.json");
const CSV_PATH = join(ROOT, "data", "irt-5D-vocab.csv");

const meta = JSON.parse(readFileSync(META_PATH, "utf-8"));

describe("vocab-pool-source provenance (T3.1)", () => {
  test("Metadata has expected fields", () => {
    expect(meta.schemaVersion).toBe(1);
    expect(meta.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.sourceRows).toBeGreaterThan(1000);
    expect(meta.generatedCards).toBeGreaterThan(100);
  });

  test("VOCAB_POOL_META.totalCards matches metadata.generatedCards", () => {
    expect(VOCAB_POOL_META.totalCards).toBe(meta.generatedCards);
  });

  test("VOCAB_POOL length matches metadata.generatedCards", () => {
    expect(VOCAB_POOL.length).toBe(meta.generatedCards);
  });

  test("If CSV present locally, SHA-256 matches metadata", () => {
    if (!existsSync(CSV_PATH)) {
      console.log("Skipping CSV hash check (CSV not present — expected in CI)");
      return;
    }
    const stat = statSync(CSV_PATH);
    expect(stat.size).toBe(meta.sourceBytes);
    const raw = readFileSync(CSV_PATH);
    const hash = createHash("sha256").update(raw).digest("hex");
    expect(hash, "CSV hash drift — run scripts/build-vocab-pool.mjs").toBe(meta.sourceSha256);
  });

  test("metadata.sourceBytes is at least the row count × min row length", () => {
    // sanity: each row averages ≥ 10 bytes — protects against truncated CSV
    expect(meta.sourceBytes).toBeGreaterThan(meta.sourceRows * 10);
  });
});
