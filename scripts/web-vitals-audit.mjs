#!/usr/bin/env node
/**
 * web-vitals-audit — Production OELP의 Core Web Vitals 측정.
 *
 * bundle-size-audit.mjs는 파일 크기만 측정. 본 script는 production URL에
 * 실 HTTP 요청을 보내 다음 측정:
 *   - TTFB (Time to First Byte): 첫 응답까지 시간
 *   - Response size: 전체 페이지 크기
 *   - Compression: gzip/br 지원 여부
 *   - Status 200 OK
 *
 * Lighthouse 같은 헤드리스 브라우저 측정은 별도 도구 필요 (예: lighthouse
 * npm package, ~50MB dep). 본 script는 가벼운 server-side 측정만.
 *
 * 임계:
 *   - TTFB < 1000ms (보통 Vercel edge 200ms 안팎)
 *   - Page size < 500KB (initial HTML + critical inlined CSS)
 *   - Gzip/br compression 활성
 *
 * Run:
 *   node scripts/web-vitals-audit.mjs                                    # default
 *   node scripts/web-vitals-audit.mjs --base-url https://oelp-phi.vercel.app
 *   node scripts/web-vitals-audit.mjs --ttfb-threshold 800
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

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

const baseUrl = args["base-url"] ?? "https://oelp-phi.vercel.app";
const ttfbThreshold = args["ttfb-threshold"] ? parseInt(args["ttfb-threshold"], 10) : 1000;
const sizeThreshold = args["size-threshold"] ? parseInt(args["size-threshold"], 10) : 500 * 1024;

const ROUTES = ["/", "/diagnose", "/map", "/queue", "/sessions", "/regression-history", "/teacher"];

async function measureRoute(path) {
  const url = `${baseUrl}${path}`;
  const start = Date.now();
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "oelp-web-vitals-audit/1.0",
        "Accept-Encoding": "gzip, deflate, br",
      },
      redirect: "follow",
    });
  } catch (err) {
    return {
      route: path,
      url,
      error: err instanceof Error ? err.message : String(err),
      ok: false,
    };
  }
  const ttfb = Date.now() - start;
  const body = await res.text();
  const sizeBytes = new TextEncoder().encode(body).length;
  const contentEncoding = res.headers.get("content-encoding");
  const cacheControl = res.headers.get("cache-control");

  return {
    route: path,
    url,
    status: res.status,
    ok: res.ok,
    ttfbMs: ttfb,
    sizeKB: +(sizeBytes / 1024).toFixed(1),
    contentEncoding,
    cacheControl,
    ttfbUnderThreshold: ttfb < ttfbThreshold,
    sizeUnderThreshold: sizeBytes < sizeThreshold,
    compressed: contentEncoding === "gzip" || contentEncoding === "br",
  };
}

const results = [];
for (const route of ROUTES) {
  const r = await measureRoute(route);
  results.push(r);
}

const summary = {
  baseUrl,
  ttfbThreshold,
  sizeThresholdKB: sizeThreshold / 1024,
  totalRoutes: ROUTES.length,
  okCount: results.filter((r) => r.ok).length,
  avgTtfbMs: Math.round(
    results.filter((r) => r.ttfbMs !== undefined).reduce((s, r) => s + r.ttfbMs, 0) /
      results.length
  ),
  avgSizeKB: +(
    results.filter((r) => r.sizeKB !== undefined).reduce((s, r) => s + r.sizeKB, 0) /
    results.length
  ).toFixed(1),
  allCompressed: results.every((r) => r.compressed),
  ttfbViolations: results.filter((r) => r.ttfbUnderThreshold === false).length,
  sizeViolations: results.filter((r) => r.sizeUnderThreshold === false).length,
};

if (!existsSync(join(ROOT, "out"))) mkdirSync(join(ROOT, "out"));
const outPath = join(ROOT, "out", `web-vitals-audit-${Date.now()}.json`);
writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));

console.log(JSON.stringify({
  baseUrl,
  summary,
  perRoute: results.map((r) => ({
    route: r.route,
    status: r.status ?? "ERR",
    ttfbMs: r.ttfbMs ?? "—",
    sizeKB: r.sizeKB ?? "—",
    compressed: r.compressed ?? false,
  })),
  verdict:
    summary.okCount === ROUTES.length &&
    summary.ttfbViolations === 0 &&
    summary.sizeViolations === 0 &&
    summary.allCompressed
      ? "SAFE — all routes under thresholds + compressed"
      : "WARN — see violations",
  outputPath: outPath.replace(ROOT + "\\", "").replace(ROOT + "/", ""),
}, null, 2));

if (
  summary.ttfbViolations > 0 ||
  summary.sizeViolations > 0 ||
  summary.okCount < ROUTES.length
) {
  process.exit(1);
}
