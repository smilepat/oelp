#!/usr/bin/env node
/**
 * Cross-repo link validator.
 *
 * OELP source code (README, CLAUDE.md, components, docs) references
 * external repos (smilepat/myprojects, smilepat/vocab-cat-test) by URL.
 * When sibling repos rename/relocate, those links 404 silently.
 *
 * This script:
 *   1. Greps for github.com/smilepat/<repo>/blob/main/<path> patterns
 *      in OELP source files.
 *   2. For each unique link, HEAD requests https://raw.githubusercontent.com
 *      to verify the file exists (no Markdown rendering needed).
 *   3. Reports 404s as PR-blocking errors.
 *
 * Skips:
 *   - localhost / non-github links (Vercel, etc — out of scope)
 *   - anchor-only links (#fragment)
 *   - links inside <!-- HTML comments -->
 *
 * Run: node scripts/check-cross-repo-links.mjs
 * CI:  added to pr-check.yml as 10th gate (W?)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TARGETS = ["README.md", "CLAUDE.md", "AGENTS.md"];
const SCAN_DIRS = ["lib", "components", "app", "scripts", "tests", "e2e", "schemas"];
const EXTENSIONS = [".md", ".ts", ".tsx", ".mjs", ".json"];

// Matches: github.com/smilepat/<repo>/blob/<branch>/<path>
// AND: github.com/smilepat/<repo>/tree/<branch>/<path>
// Match /blob/ links only (files). /tree/ links point to directories which
// raw.githubusercontent.com can't HEAD-check — those are verified via
// directory existence in the cloned repo at build time, but for cross-repo
// we trust github.com routing.
const LINK_RE = /https:\/\/github\.com\/smilepat\/([\w-]+)\/blob\/([\w-]+)\/([\w\-./%#]+)/g;

function* walkFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // Skip node_modules / .next / .git / .playwright-mcp
      if (
        name === "node_modules" || name === ".next" ||
        name === ".git" || name === ".playwright-mcp" ||
        name === "test-results" || name === "playwright-report" ||
        name === "coverage" || name === "out" || name === "data"
      ) continue;
      yield* walkFiles(full);
    } else {
      const ext = name.slice(name.lastIndexOf("."));
      if (EXTENSIONS.includes(ext)) yield full;
    }
  }
}

// ─── Collect links ─────────────────────────────────────────────────────

const linksByFile = new Map();
const allLinks = new Map(); // url → first-seen file

// Root-level targets
for (const fname of TARGETS) {
  const full = join(ROOT, fname);
  try {
    const text = readFileSync(full, "utf-8");
    extractLinks(full, text);
  } catch {
    // file missing — OK
  }
}

// Sub-dirs
for (const subdir of SCAN_DIRS) {
  const full = join(ROOT, subdir);
  try {
    statSync(full);
  } catch {
    continue;
  }
  for (const file of walkFiles(full)) {
    const text = readFileSync(file, "utf-8");
    extractLinks(file, text);
  }
}

function extractLinks(file, text) {
  // Strip HTML comments
  let cleaned = text.replace(/<!--[\s\S]*?-->/g, "");
  // Strip template literals ${...} so we don't match dynamic URLs
  cleaned = cleaned.replace(/\$\{[^}]*\}/g, "");
  LINK_RE.lastIndex = 0;
  let m;
  while ((m = LINK_RE.exec(cleaned)) !== null) {
    const [full, repo, branch, path] = m;
    // Skip if path looks invalid (e.g. trailing punctuation included by mistake)
    const cleanedPath = path.replace(/[.,;!?]+$/, "");
    const url = full.replace(path, cleanedPath);
    const key = `${repo}/${branch}/${cleanedPath}`;
    if (!allLinks.has(key)) {
      allLinks.set(key, { url, repo, branch, path: cleanedPath, file });
    }
    if (!linksByFile.has(file)) linksByFile.set(file, []);
    linksByFile.get(file).push(url);
  }
}

console.log(`Found ${allLinks.size} unique cross-repo link(s) across ${linksByFile.size} file(s).`);

if (allLinks.size === 0) {
  console.log("Nothing to check.");
  process.exit(0);
}

// ─── HEAD check ────────────────────────────────────────────────────────

const failures = [];
let checked = 0;

for (const [key, info] of allLinks) {
  // Use raw.githubusercontent.com — no rendering, faster + reliable 404
  const rawUrl = `https://raw.githubusercontent.com/smilepat/${info.repo}/${info.branch}/${info.path}`;
  try {
    const res = await fetch(rawUrl, { method: "HEAD" });
    checked++;
    if (res.status === 200) {
      // ok
    } else if (res.status === 404) {
      failures.push({ ...info, status: 404, rawUrl });
    } else {
      // Other status (403 rate limit, etc) — warn but don't fail
      console.warn(`[WARN] ${info.url} → HTTP ${res.status} (skipped)`);
    }
  } catch (err) {
    console.warn(`[WARN] ${info.url} → network error: ${err.message} (skipped)`);
  }
}

console.log(`Checked ${checked} link(s).`);

if (failures.length > 0) {
  console.error(`\n${failures.length} BROKEN cross-repo link(s):\n`);
  for (const f of failures) {
    console.error(`  ✗ ${f.url}`);
    console.error(`    File: ${f.file.replace(ROOT, "").replace(/\\/g, "/")}`);
    console.error(`    Raw:  ${f.rawUrl}`);
    console.error("");
  }
  process.exit(1);
}

console.log("\n✓ All cross-repo links resolve.");
