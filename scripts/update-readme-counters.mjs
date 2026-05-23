#!/usr/bin/env node
/**
 * Auto-update README counters (T2.1 — long-term stability roadmap).
 *
 * Single source of truth for "X Vitest tests · Y routes · Z lib modules".
 * Eliminates manual drift — every PR runs --check, every weekly release
 * runs --write.
 *
 * Exports counting functions for tests/readme-freshness.test.ts to verify
 * README is in sync (--check mode) without writing.
 *
 * Usage:
 *   node scripts/update-readme-counters.mjs            # write mode
 *   node scripts/update-readme-counters.mjs --check    # exit 1 if stale
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── Counting primitives ─────────────────────────────────────────────

export function countTests() {
  const dir = join(ROOT, "tests");
  let files = 0;
  let tests = 0;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".test.ts")) continue;
    files++;
    const src = readFileSync(join(dir, entry), "utf-8");
    // Match `test(` or `test.skip(` etc. but not `test.each` (which generates many tests at runtime)
    const matches = src.match(/\btest(?:\.\w+)?\s*\(/g) ?? [];
    tests += matches.length;
  }
  return { files, tests };
}

export function countRoutes() {
  // Filesystem-based: app/page.tsx (root) + each app/<dir>/page.tsx.
  // Next.js adds /_not-found automatically — +1.
  const appDir = join(ROOT, "app");
  let routes = 0;
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      try {
        statSync(join(appDir, entry.name, "page.tsx"));
        routes++;
      } catch {
        // no page.tsx
      }
    } else if (entry.name === "page.tsx") {
      routes++;
    }
  }
  return routes + 1; // +1 for Next.js auto-injected /_not-found
}

export function countLibModules() {
  const dir = join(ROOT, "lib");
  let count = 0;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".ts")) continue;
    if (entry.endsWith(".d.ts")) continue;
    count++;
  }
  return count;
}

export function countScripts() {
  const dir = join(ROOT, "scripts");
  let count = 0;
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith(".mjs")) count++;
  }
  return count;
}

// ─── Updater ─────────────────────────────────────────────────────────

const README_PATH = join(ROOT, "README.md");

function buildExpectedBadge(counts) {
  return `${counts.tests} Vitest tests · ${counts.routes} routes · ${counts.libModules} lib modules · 4-layer safety net`;
}

function buildExpectedTestsRef(counts) {
  return `lint + ${counts.tests} tests + C4.1 + build`;
}

function buildExpectedTestSummary(counts) {
  return `Vitest 4.1.7 (${counts.testFiles} test files, ${counts.tests} tests)`;
}

// Three placeholders to keep in sync. Each is a literal regex; the matched
// substring is replaced with the freshly counted value.
const REPLACEMENTS = [
  {
    name: "header-badge",
    pattern: /(\d+ Vitest tests · \d+ routes · \d+ lib modules · 4-layer safety net)/,
    build: buildExpectedBadge,
  },
  {
    name: "ci-line",
    pattern: /(lint \+ \d+ tests \+ C4\.1 \+ build)/,
    build: buildExpectedTestsRef,
  },
  {
    name: "pr-check-bullet",
    pattern: /(lint \+ \d+ tests \+ C4\.1 \+ build 자동 게이트)/,
    build: (c) => `lint + ${c.tests} tests + C4.1 + build 자동 게이트`,
  },
  {
    name: "stack-test-summary",
    pattern: /(Vitest 4\.1\.7 \(\d+ test files, \d+ tests\))/,
    build: buildExpectedTestSummary,
  },
  {
    name: "lib-section-heading",
    pattern: /(## 3\. 라이브러리 모듈 \(\d+\))/,
    build: (c) => `## 3. 라이브러리 모듈 (${c.libModules})`,
  },
  {
    name: "scripts-section-heading",
    pattern: /(## 4\. Scripts \(\d+\))/,
    build: (c) => `## 4. Scripts (${c.scripts})`,
  },
  {
    name: "safety-net-vitest-line",
    pattern: /(Vitest \d+ 단위 테스트)/,
    build: (c) => `Vitest ${c.tests} 단위 테스트`,
  },
];

function snapshotCounts() {
  const { files: testFiles, tests } = countTests();
  return {
    tests,
    testFiles,
    routes: countRoutes(),
    libModules: countLibModules(),
    scripts: countScripts(),
  };
}

function applyReplacements(content, counts) {
  const drift = [];
  let updated = content;
  for (const r of REPLACEMENTS) {
    const m = updated.match(r.pattern);
    const expected = r.build(counts);
    if (!m) {
      drift.push({ name: r.name, reason: "pattern-not-found" });
      continue;
    }
    if (m[1] !== expected) {
      drift.push({ name: r.name, current: m[1], expected });
      updated = updated.replace(r.pattern, expected);
    }
  }
  return { updated, drift };
}

// ─── Main (CLI) ──────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("update-readme-counters.mjs")) {
  const checkOnly = process.argv.includes("--check");
  const counts = snapshotCounts();
  const original = readFileSync(README_PATH, "utf-8");
  const { updated, drift } = applyReplacements(original, counts);

  console.log(`Counts: ${JSON.stringify(counts)}`);

  if (drift.length === 0) {
    console.log("README counters in sync.");
    process.exit(0);
  }

  if (checkOnly) {
    console.error("README counters out of date:");
    for (const d of drift) {
      if (d.reason) console.error(`  - ${d.name}: ${d.reason}`);
      else console.error(`  - ${d.name}: "${d.current}" → "${d.expected}"`);
    }
    console.error(`\nRun: node scripts/update-readme-counters.mjs`);
    process.exit(1);
  }

  writeFileSync(README_PATH, updated);
  console.log(`Updated ${drift.length} placeholder(s) in README.md`);
}
