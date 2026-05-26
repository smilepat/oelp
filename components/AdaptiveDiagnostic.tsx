"use client";

import { useRef, useState } from "react";
import type { DiagnosticInput, VocabDimension } from "@/lib/diagnostic";
import { logEvent } from "@/lib/analytics-events";

/**
 * AdaptiveDiagnostic — vocab-cat-test 백엔드와 multi-step CAT 흐름.
 *
 * Backend: smilepat/vocab-cat-test (FastAPI, IRT 2PL/3PL, 9183 vocab).
 * URL via NEXT_PUBLIC_VOCAB_CAT_TEST_URL (default http://localhost:8000).
 *
 * Flow:
 *   1. /api/v1/test/start { nickname, grade } → first_item + session_id
 *   2. Loop /api/v1/test/{sid}/respond { item_id, is_correct } until complete
 *   3. /api/v1/test/{sid}/results → theta + 5D dimension_scores
 *   4. Map vocab-cat-test dim names (semantic, contextual, ...) → OELP D1-D5
 *   5. Emit DiagnosticInput via onComplete prop
 *
 * Dim mapping mirrors scripts/verify-vocab-cat-test.mjs.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_VOCAB_CAT_TEST_URL ?? "";

const DIM_MAP: Record<string, VocabDimension> = {
  semantic: "D2_Meaning",
  contextual: "D3_Context",
  form: "D1_Form",
  relational: "D4_Network",
  pragmatic: "D5_Usage",
};

type Item = {
  item_id: number;
  word: string;
  stem?: string | null;
  correct_answer?: string | null;
  options?: string[] | null;
  pos?: string;
  cefr?: string;
};

type Progress = {
  items_completed: number;
  total_correct: number;
  accuracy: number;
  current_theta: number | null;
  current_se: number | null;
  is_complete: boolean;
};

type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running"; sessionId: string; item: Item; progress: Progress }
  | { kind: "complete"; sessionId: string }
  | { kind: "error"; message: string };

interface Props {
  onComplete?: (d: DiagnosticInput) => void;
}

const GRADES = [
  "초3-4", "초5-6", "중1", "중2", "중3", "고1", "고2", "고3", "대학", "성인",
] as const;

function mapCefr(c: string): DiagnosticInput["cefr"] {
  const valid: DiagnosticInput["cefr"][] = ["A1", "A2", "B1", "B2", "C1", "C2"];
  return (valid as string[]).includes(c) ? (c as DiagnosticInput["cefr"]) : "B1";
}

function mapLevel(curriculumLevel: string): DiagnosticInput["level"] {
  const m: Record<string, DiagnosticInput["level"]> = {
    "초3-4": 1, "초5-6": 2, "중1": 3, "중2": 3, "중3": 3,
    "고1": 4, "고2": 4, "고3": 5, "대학": 6, "성인": 6,
  };
  return m[curriculumLevel] ?? 4;
}

export function AdaptiveDiagnostic({ onComplete }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [grade, setGrade] = useState<typeof GRADES[number]>("고2");
  const [nickname, setNickname] = useState("");
  // Session-scoped refs for analytics events
  const startedAtRef = useRef<number>(0);
  const itemStartRef = useRef<number>(0);
  const itemCountRef = useRef<number>(0);

  if (!BACKEND_URL) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs dark:border-amber-900 dark:bg-amber-950">
        <p className="font-medium text-amber-900 dark:text-amber-100">
          실제 적응형 진단 — 백엔드 미연결
        </p>
        <p className="text-amber-800 dark:text-amber-200">
          <code>NEXT_PUBLIC_VOCAB_CAT_TEST_URL</code> 환경변수 미설정.
          vocab-cat-test FastAPI 백엔드를 띄운 후 <code>.env.local</code>에 추가:
        </p>
        <pre className="overflow-auto rounded bg-amber-100 p-2 font-mono text-[10px] dark:bg-amber-900">
NEXT_PUBLIC_VOCAB_CAT_TEST_URL=http://localhost:8000
        </pre>
        <p className="text-amber-700 dark:text-amber-300">
          가이드: <a href="https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/vocab-cat-test-integration-resolved.md" target="_blank" rel="noopener noreferrer" className="underline">integration-resolved.md</a>
        </p>
      </section>
    );
  }

  async function start() {
    setState({ kind: "starting" });
    // eslint-disable-next-line react-hooks/purity
    startedAtRef.current = Date.now();
    itemCountRef.current = 0;
    logEvent({ type: "diag.started", properties: { source: "vocab-cat-test" } });
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/test/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim() || "oelp-user",
          grade,
          self_assess: "intermediate",
          exam_experience: "수능",
          question_type: 0,
        }),
      });
      if (!res.ok) throw new Error(`/start → ${res.status}`);
      const body = await res.json();
      // eslint-disable-next-line react-hooks/purity
      itemStartRef.current = Date.now();
      setState({
        kind: "running",
        sessionId: body.session_id,
        item: body.first_item,
        progress: body.progress,
      });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function answer(optionIdx: number) {
    if (state.kind !== "running") return;
    const isCorrect =
      !!state.item.options &&
      !!state.item.correct_answer &&
      state.item.options[optionIdx] === state.item.correct_answer;
    // eslint-disable-next-line react-hooks/purity
    const responseTimeMs = Math.max(0, Date.now() - itemStartRef.current);
    itemCountRef.current += 1;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/v1/test/${state.sessionId}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_id: state.item.item_id,
            is_correct: isCorrect,
            response_time_ms: responseTimeMs,
          }),
        }
      );
      if (!res.ok) throw new Error(`/respond → ${res.status}`);
      const body = await res.json();
      logEvent({
        type: "diag.item_answered",
        properties: {
          itemId: state.item.item_id,
          isCorrect,
          responseTimeMs,
          currentTheta: body.progress.current_theta ?? 0,
          currentSe: body.progress.current_se ?? 0,
        },
      });
      if (body.progress.is_complete || !body.next_item) {
        await fetchResults(state.sessionId);
      } else {
        // eslint-disable-next-line react-hooks/purity
      itemStartRef.current = Date.now();
        setState({
          kind: "running",
          sessionId: state.sessionId,
          item: body.next_item,
          progress: body.progress,
        });
      }
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function fetchResults(sid: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/test/${sid}/results`);
      if (!res.ok) throw new Error(`/results → ${res.status}`);
      const r = await res.json();
      const scores: Partial<Record<VocabDimension, number>> = {};
      for (const d of r.dimension_scores ?? []) {
        const mapped = DIM_MAP[d.dimension];
        if (mapped && d.score !== null && d.score !== undefined) {
          scores[mapped] = d.score;
        }
      }
      const dims: VocabDimension[] = [
        "D1_Form", "D2_Meaning", "D3_Context", "D4_Network", "D5_Usage",
      ];
      const present = Object.entries(scores)
        .filter(([, v]) => v !== undefined)
        .map(([, v]) => v as number);
      const median = present.length > 0
        ? [...present].sort((a, b) => a - b)[Math.floor(present.length / 2)]
        : 50;
      for (const d of dims) if (!(d in scores)) scores[d] = median;

      const sortedDims = dims.slice().sort(
        (a, b) => (scores[a] ?? 50) - (scores[b] ?? 50)
      );
      const weakDim = sortedDims.slice(0, 2);
      const strongDim = sortedDims.slice(-2);

      const diagnostic: DiagnosticInput = {
        studentName: nickname.trim() || "oelp-user",
        theta: Math.max(-4, Math.min(4, r.theta)),
        level: mapLevel(r.curriculum_level),
        cefr: mapCefr(r.cefr_level),
        dimensionScores: scores,
        weakDim,
        strongDim,
        timestamp: new Date().toISOString(),
        source: "vocab-cat-test",
      };

      onComplete?.(diagnostic);
      logEvent({
        type: "diag.completed",
        properties: {
          theta: diagnostic.theta,
          se: r.se ?? 0,
          cefr: diagnostic.cefr,
          level: diagnostic.level,
          dimensionScores: diagnostic.dimensionScores,
          weakDim: diagnostic.weakDim,
          strongDim: diagnostic.strongDim,
          totalItems: itemCountRef.current,
          // eslint-disable-next-line react-hooks/purity
          durationSec: Math.round((Date.now() - startedAtRef.current) / 1000),
        },
      });
      setState({ kind: "complete", sessionId: sid });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-indigo-200 bg-indigo-50/30 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
          실제 적응형 진단 (vocab-cat-test)
        </p>
        <p className="text-[10px] text-indigo-600 dark:text-indigo-400">
          IRT 2PL/3PL · 15-40 문항 · 자동 종료
        </p>
      </header>

      {state.kind === "idle" && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="text-indigo-700 dark:text-indigo-300">학년</span>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value as typeof GRADES[number])}
                className="rounded border border-indigo-200 bg-white px-2 py-1 text-sm dark:border-indigo-800 dark:bg-zinc-900"
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="text-indigo-700 dark:text-indigo-300">닉네임 (선택)</span>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="oelp-user"
                className="rounded border border-indigo-200 bg-white px-2 py-1 text-sm dark:border-indigo-800 dark:bg-zinc-900"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={start}
            data-testid="adaptive-start"
            className="self-start rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            진단 시작 →
          </button>
          <p className="text-[10px] text-indigo-600 dark:text-indigo-400">
            진단 종료 시 결과가 자동으로 활성 진단으로 설정되어 <code>/queue</code> 가 사용합니다.
          </p>
        </div>
      )}

      {state.kind === "starting" && (
        <p className="text-sm text-indigo-700 dark:text-indigo-300">세션 생성 중…</p>
      )}

      {state.kind === "running" && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-between text-xs text-indigo-700 dark:text-indigo-300">
            <span>
              {state.progress.items_completed + 1}번째 문항 · 정답률{" "}
              {(state.progress.accuracy * 100).toFixed(0)}%
            </span>
            <span>
              θ {state.progress.current_theta?.toFixed(2) ?? "?"} · SE{" "}
              {state.progress.current_se?.toFixed(2) ?? "?"}
            </span>
          </div>
          <div className="rounded-md border border-indigo-200 bg-white p-3 dark:border-indigo-800 dark:bg-zinc-900">
            <p className="text-xs uppercase text-indigo-500">{state.item.pos ?? ""} · {state.item.cefr ?? ""}</p>
            <p className="text-base font-semibold">{state.item.word}</p>
            {state.item.stem && (
              <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {state.item.stem}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {(state.item.options ?? []).map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => answer(i)}
                className="rounded-md border border-indigo-200 bg-white px-3 py-2 text-left text-sm hover:bg-indigo-50 dark:border-indigo-800 dark:bg-zinc-900 dark:hover:bg-indigo-950"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.kind === "complete" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            ✓ 진단 완료 — 결과가 활성 진단으로 설정됨. <code>/queue</code> 로 이동.
          </p>
          <button
            type="button"
            onClick={() => setState({ kind: "idle" })}
            className="self-start text-xs text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-400"
          >
            다시 진단
          </button>
        </div>
      )}

      {state.kind === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-rose-700 dark:text-rose-300">
            오류: {state.message}
          </p>
          <p className="text-xs text-rose-600 dark:text-rose-400">
            백엔드가 정상 동작 중인지 확인:{" "}
            <code>{BACKEND_URL}/health</code>
          </p>
          <button
            type="button"
            onClick={() => setState({ kind: "idle" })}
            className="self-start text-xs text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-400"
          >
            처음으로
          </button>
        </div>
      )}
    </section>
  );
}
