#!/usr/bin/env node
/**
 * mock-vocab-cat-test — minimal HTTP server emulating vocab-cat-test FastAPI.
 *
 * Purpose: dogfooding /diagnose AdaptiveDiagnostic flow when real backend
 * (smilepat/vocab-cat-test) is not running locally. Stub endpoints satisfy
 * the contract that components/AdaptiveDiagnostic.tsx + scripts/
 * verify-vocab-cat-test.mjs expect:
 *
 *   GET  /health
 *   POST /api/v1/test/start
 *   POST /api/v1/test/{sid}/respond
 *   GET  /api/v1/test/{sid}/results
 *
 * The mock uses a seeded RNG to produce reproducible theta trajectories,
 * so two consecutive runs with the same seed yield identical results.
 * SE shrinks proportional to items_completed (Fisher-style decay).
 *
 * Limits: no real IRT — theta moves stochastically toward grade-mapped
 * baseline. NOT suitable for calibration validation. For C4.1 dogfooding
 * use real backend. For UI development / dogfooding without infra → this.
 *
 * Run:
 *   node scripts/mock-vocab-cat-test.mjs                    # default port 8000
 *   node scripts/mock-vocab-cat-test.mjs --port 8001 --seed 42
 *
 * Then in oelp:
 *   NEXT_PUBLIC_VOCAB_CAT_TEST_URL=http://localhost:8000 npm run dev
 */

import { createServer } from "node:http";
import { URL } from "node:url";

const args = parseArgs(process.argv.slice(2));
const PORT = args.port ? parseInt(args.port, 10) : 8000;
const SEED = args.seed ? parseInt(args.seed, 10) : 23;
const ITEMS_TOTAL = args.items ? parseInt(args.items, 10) : 15;

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

// Mulberry32 seeded RNG (matches dogfood-*.mjs)
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRADE_THETA = {
  "초3-4": -2.0, "초5-6": -1.2, "중1": -0.8, "중2": -0.4, "중3": 0.0,
  "고1": 0.4,    "고2": 0.8,    "고3": 1.2,  "대학": 1.6, "성인": 1.0,
};

const GRADE_CEFR_CURRICULUM = {
  "초3-4": ["A1", "초등기초"], "초5-6": ["A2", "초등심화"],
  "중1": ["A2", "중1"], "중2": ["B1", "중2"], "중3": ["B1", "중3"],
  "고1": ["B1", "고1"], "고2": ["B2", "고2"], "고3": ["B2", "고3"],
  "대학": ["C1", "대학"], "성인": ["B2", "성인"],
};

const DIM_NAMES = ["semantic", "contextual", "form", "relational", "pragmatic"];

const SAMPLE_WORDS = [
  { word: "abandon", pos: "verb", cefr: "B1" },
  { word: "benefit", pos: "noun", cefr: "B1" },
  { word: "concede", pos: "verb", cefr: "B2" },
  { word: "diligent", pos: "adj", cefr: "B2" },
  { word: "elucidate", pos: "verb", cefr: "C1" },
  { word: "facade", pos: "noun", cefr: "B2" },
  { word: "garish", pos: "adj", cefr: "C1" },
  { word: "harangue", pos: "verb", cefr: "C2" },
  { word: "ignite", pos: "verb", cefr: "B2" },
  { word: "jovial", pos: "adj", cefr: "B2" },
  { word: "kinship", pos: "noun", cefr: "B2" },
  { word: "lament", pos: "verb", cefr: "B2" },
  { word: "magnify", pos: "verb", cefr: "B1" },
  { word: "nuance", pos: "noun", cefr: "C1" },
  { word: "obfuscate", pos: "verb", cefr: "C2" },
  { word: "pragmatic", pos: "adj", cefr: "B2" },
  { word: "quaint", pos: "adj", cefr: "B2" },
  { word: "reticent", pos: "adj", cefr: "C1" },
  { word: "scrutinize", pos: "verb", cefr: "B2" },
  { word: "tangible", pos: "adj", cefr: "B2" },
];

const sessions = new Map();

function buildItem(rng, idx) {
  const base = SAMPLE_WORDS[idx % SAMPLE_WORDS.length];
  const correct = `${base.word}의 정의 (mock)`;
  const distractors = [
    `(mock distractor A)`,
    `(mock distractor B)`,
    `(mock distractor C)`,
  ];
  // Shuffle options deterministically based on idx + rng
  const opts = [correct, ...distractors];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return {
    item_id: 10000 + idx,
    word: base.word,
    stem: `(mock) ${base.word}의 가장 적절한 의미를 고르시오.`,
    options: opts,
    correct_answer: correct,
    pos: base.pos,
    cefr: base.cefr,
  };
}

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (chunk) => (buf += chunk));
    req.on("end", () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    send(res, 204, {});
    return;
  }

  // GET /health
  if (method === "GET" && url.pathname === "/health") {
    send(res, 200, { status: "ok", mock: true, seed: SEED, sessions: sessions.size });
    return;
  }

  // POST /api/v1/test/start
  if (method === "POST" && url.pathname === "/api/v1/test/start") {
    const body = await readJson(req).catch(() => ({}));
    const grade = body.grade ?? "고2";
    const sid = `mock-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const rng = makeRng(SEED + sessions.size);
    const session = {
      sid,
      grade,
      rng,
      items_completed: 0,
      total_correct: 0,
      theta_sum: 0,
      first_item: buildItem(rng, 0),
      responses: [],
      done: false,
    };
    sessions.set(sid, session);
    send(res, 200, {
      session_id: sid,
      first_item: session.first_item,
      progress: {
        items_completed: 0,
        total_correct: 0,
        accuracy: 0,
        current_theta: null,
        current_se: null,
        is_complete: false,
      },
    });
    return;
  }

  // POST /api/v1/test/{sid}/respond
  const respondMatch = url.pathname.match(/^\/api\/v1\/test\/([^/]+)\/respond$/);
  if (method === "POST" && respondMatch) {
    const sid = respondMatch[1];
    const session = sessions.get(sid);
    if (!session) {
      send(res, 404, { detail: "session not found" });
      return;
    }
    const body = await readJson(req).catch(() => ({}));
    session.items_completed += 1;
    if (body.is_correct) session.total_correct += 1;
    session.responses.push(body);

    // Mock theta update: tracks running accuracy with shrinkage toward grade baseline.
    const baseline = GRADE_THETA[session.grade] ?? 0;
    const accuracy = session.total_correct / session.items_completed;
    const naive = (accuracy - 0.5) * 4; // -2..+2 from accuracy
    const shrunk = 0.5 * baseline + 0.5 * naive;
    const theta = shrunk + (session.rng() - 0.5) * 0.2; // small noise
    // Fisher-style SE decay: SE = 1 / sqrt(items + 1)
    const se = 1 / Math.sqrt(session.items_completed + 1);

    const is_complete = session.items_completed >= ITEMS_TOTAL;
    session.last_theta = theta;
    session.last_se = se;

    const progress = {
      items_completed: session.items_completed,
      total_correct: session.total_correct,
      accuracy,
      current_theta: theta,
      current_se: se,
      is_complete,
    };

    if (is_complete) {
      session.done = true;
      send(res, 200, { next_item: null, progress });
    } else {
      const next_item = buildItem(session.rng, session.items_completed);
      send(res, 200, { next_item, progress });
    }
    return;
  }

  // GET /api/v1/test/{sid}/results
  const resultsMatch = url.pathname.match(/^\/api\/v1\/test\/([^/]+)\/results$/);
  if (method === "GET" && resultsMatch) {
    const sid = resultsMatch[1];
    const session = sessions.get(sid);
    if (!session) {
      send(res, 404, { detail: "session not found" });
      return;
    }
    const theta = session.last_theta ?? 0;
    const se = session.last_se ?? 1;
    // 5D dimension scores: derived from theta with per-dim deterministic offsets.
    const dimension_scores = DIM_NAMES.map((dim, i) => {
      const offset = ((i + 1) * 7 % 11 - 5) * 0.04; // -0.2..+0.24
      const dimTheta = theta + offset;
      // Map theta (-4..+4) to score 0..100 via sigmoid-ish curve
      const score = Math.round(100 / (1 + Math.exp(-dimTheta)));
      return { dimension: dim, score };
    });
    const [cefr_level, curriculum_level] = GRADE_CEFR_CURRICULUM[session.grade] ?? ["B1", "고1"];
    send(res, 200, {
      session_id: sid,
      theta,
      se,
      cefr_level,
      curriculum_level,
      dimension_scores,
      items_completed: session.items_completed,
      total_correct: session.total_correct,
    });
    return;
  }

  send(res, 404, { detail: `Not found: ${method} ${url.pathname}` });
});

server.listen(PORT, () => {
  console.log(`[mock-vocab-cat-test] listening on http://localhost:${PORT}`);
  console.log(`  seed=${SEED}  items_total=${ITEMS_TOTAL}`);
  console.log(`  endpoints: GET /health, POST /api/v1/test/start, POST /respond, GET /results`);
  console.log(`  set NEXT_PUBLIC_VOCAB_CAT_TEST_URL=http://localhost:${PORT} in oelp .env.local`);
});
