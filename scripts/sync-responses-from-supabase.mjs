#!/usr/bin/env node
/**
 * P-1 W6 — Sync responses from Supabase events table to local JSON.
 *
 * Fetches `events.queue.item_answered` rows from Supabase, converts to the
 * shape expected by calibrate.mjs, writes to --out path.
 *
 * Required env (workflow secrets):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  (server-side fetch — bypasses RLS)
 *
 * Without these, writes empty array (degraded mode for CI on forks).
 *
 * Schema (analytics-events.md §3.8):
 *   {
 *     event_type: 'queue.item_answered',
 *     user_id: uuid,
 *     properties: {
 *       queue_id: uuid,
 *       item_id: string,
 *       is_correct: boolean,
 *       ...
 *     }
 *   }
 *
 * We need to enrich with `qtId` and `dimensionScores` — these come from the
 * `queue.started` event (joined by queue_id) and `diag.completed` event
 * (joined by user_id, most recent). For W6 scaffold this joins via 2 queries.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

const outPath = args.out || "data/responses.json";
const outAbs = join(ROOT, outPath);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!existsSync(join(ROOT, "data"))) mkdirSync(join(ROOT, "data"));

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.warn("Warning: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.");
    console.warn("Writing empty responses array (degraded mode).");
    writeFileSync(outAbs, "[]");
    console.log(`Wrote 0 responses to ${outPath}`);
    return;
  }

  // Lazy import to avoid hard dependency on @supabase/supabase-js for plain CI runs
  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Fetching queue.item_answered events...");
  const { data: itemEvents, error: itemErr } = await supa
    .from("events")
    .select("user_id, occurred_at, properties")
    .eq("event_type", "queue.item_answered")
    .order("occurred_at", { ascending: true });
  if (itemErr) {
    console.error("Supabase fetch failed:", itemErr.message);
    process.exit(1);
  }

  console.log(`Fetched ${itemEvents?.length ?? 0} item_answered events.`);

  // Bucket queue.started events by queue_id for qtId lookup
  const { data: startedEvents, error: startedErr } = await supa
    .from("events")
    .select("properties")
    .eq("event_type", "queue.started");
  if (startedErr) {
    console.error("Supabase fetch (queue.started) failed:", startedErr.message);
    process.exit(1);
  }
  const qtByQueueId = new Map();
  for (const ev of startedEvents ?? []) {
    if (ev.properties?.queue_id && ev.properties?.target_question_type) {
      qtByQueueId.set(ev.properties.queue_id, ev.properties.target_question_type);
    }
  }

  // Latest diag.completed per user — provides dimensionScores
  const { data: diagEvents, error: diagErr } = await supa
    .from("events")
    .select("user_id, occurred_at, properties")
    .eq("event_type", "diag.completed")
    .order("occurred_at", { ascending: false });
  if (diagErr) {
    console.error("Supabase fetch (diag.completed) failed:", diagErr.message);
    process.exit(1);
  }
  const scoresByUser = new Map();
  for (const ev of diagEvents ?? []) {
    if (!scoresByUser.has(ev.user_id) && ev.properties?.dimension_scores) {
      scoresByUser.set(ev.user_id, ev.properties.dimension_scores);
    }
  }

  // Compose responses
  const responses = [];
  for (const ev of itemEvents ?? []) {
    const props = ev.properties ?? {};
    const qtId = qtByQueueId.get(props.queue_id);
    const scores = scoresByUser.get(ev.user_id);
    if (!qtId || !scores) continue;
    responses.push({
      qtId,
      dimensionScores: scores,
      isCorrect: !!props.is_correct,
    });
  }

  writeFileSync(outAbs, JSON.stringify(responses, null, 2));
  console.log(`Wrote ${responses.length} valid responses to ${outPath}`);
}

main().catch((e) => {
  console.error("sync-responses-from-supabase failed:", e);
  process.exit(1);
});
