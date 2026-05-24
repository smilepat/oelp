#!/usr/bin/env node
/**
 * bundle-size-audit — Next.js production bundle size 측정 + threshold check.
 *
 * Next.js 16 Turbopack은 build output에 First Load JS 정보를 출력하지 않음.
 * 본 script는 .next/static/chunks 직접 측정해서 대안 제공:
 *   - 총 client bundle size
 *   - 상위 10 chunks
 *   - 임계 초과 시 exit 1
 *
 * 임계: 총 client bundle 3MB 초과 시 fail (현재 ~1.7MB 기준 충분한 마진).
 *
 * Run: node scripts/bundle-size-audit.mjs [--threshold-mb 3]
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    }
  }
  return out;
}

const thresholdMb = args["threshold-mb"] ? parseFloat(args["threshold-mb"]) : 3;
const thresholdBytes = thresholdMb * 1024 * 1024;

const chunksDir = join(ROOT, ".next", "static", "chunks");
if (!existsSync(chunksDir)) {
  console.error(JSON.stringify({
    error: "no .next/static/chunks — run `npm run build` first",
  }));
  process.exit(2);
}

function collectFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full));
    else if (entry.name.endsWith(".js")) {
      files.push({ name: full.replace(chunksDir + "\\", "").replace(chunksDir + "/", ""), size: statSync(full).size });
    }
  }
  return files;
}

const files = collectFiles(chunksDir);
const totalBytes = files.reduce((s, f) => s + f.size, 0);
const totalMb = totalBytes / 1024 / 1024;
const top10 = [...files].sort((a, b) => b.size - a.size).slice(0, 10);

// Per-route page server bundle (small, just sanity check)
const appDir = join(ROOT, ".next", "server", "app");
const routePages = [];
function collectPages(dir, prefix = "") {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectPages(full, `${prefix}/${entry.name}`);
    else if (entry.name === "page.js") {
      routePages.push({
        route: prefix || "/",
        size: statSync(full).size,
      });
    }
  }
}
collectPages(appDir);

const report = {
  totalChunks: files.length,
  totalBytes,
  totalMB: +totalMb.toFixed(2),
  thresholdMB: thresholdMb,
  underThreshold: totalBytes < thresholdBytes,
  top10: top10.map((f) => ({ name: f.name, sizeKB: +(f.size / 1024).toFixed(1) })),
  routePages: routePages
    .sort((a, b) => b.size - a.size)
    .map((r) => ({ route: r.route, sizeBytes: r.size })),
};

console.log(JSON.stringify(report, null, 2));

if (!report.underThreshold) {
  console.error(`::error::Bundle size ${totalMb.toFixed(2)}MB exceeds threshold ${thresholdMb}MB`);
  process.exit(1);
}
