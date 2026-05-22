"use client";

import { useMemo, useState } from "react";
import { getActiveDiagnostic } from "@/lib/active-diagnostic";
import { buildQueueV2, dimensionsInQueue, type VocabCard } from "@/lib/queue";
import {
  applyResponses,
  countAdvancements,
  loadSRMap,
  type SRState,
} from "@/lib/leitner";
import {
  loadPosteriors,
  persistSessionResponses,
} from "@/lib/recommendation-store";
import { posteriorConfidence, type BetaPosterior } from "@/lib/recommendation";
import {
  saveSession,
  type SessionEvaluation,
  type SessionRecord,
} from "@/lib/session-store";

interface Response {
  itemId: string;
  /** QuestionType id from queue plan (for posterior update) */
  qtId: string;
  correct: boolean;
  at: string;
}

export default function QueuePage() {
  const diagnostic = useMemo(() => getActiveDiagnostic(), []);
  const plan = useMemo(() => {
    const posteriors = loadPosteriors(diagnostic.dimensionScores);
    return buildQueueV2(diagnostic, posteriors);
  }, [diagnostic]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [responses, setResponses] = useState<Response[]>([]);
  const [done, setDone] = useState(false);
  const [sessionStart] = useState<string>(() => new Date().toISOString());
  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(null);
  const [evalSaved, setEvalSaved] = useState(false);
  const [summary, setSummary] = useState<{
    correct: number;
    total: number;
    advancements: number;
    boxAfter: Record<string, number>;
    posterior?: BetaPosterior;
  } | null>(null);

  const totalCards = plan.cards.length;
  const card: VocabCard | undefined = plan.cards[currentIdx];

  function chooseOption(idx: number) {
    if (revealed) return;
    setSelectedIdx(idx);
  }

  function submit() {
    if (selectedIdx == null || !card) return;
    const correct = selectedIdx === card.answerIdx;
    setResponses((prev) => [
      ...prev,
      {
        itemId: card.itemId,
        qtId: plan.targetQuestionType.id,
        correct,
        at: new Date().toISOString(),
      },
    ]);
    setRevealed(true);
  }

  function next() {
    if (currentIdx + 1 >= totalCards) {
      finalize();
    } else {
      setCurrentIdx((i) => i + 1);
      setSelectedIdx(null);
      setRevealed(false);
    }
  }

  function finalize() {
    const beforeMap: Record<string, SRState> = loadSRMap();
    applyResponses(
      responses.map((r) => ({ itemId: r.itemId, correct: r.correct, at: r.at }))
    );
    const correct = responses.filter((r) => r.correct).length;
    const advancements = countAdvancements(responses, beforeMap);
    const afterMap = loadSRMap();
    const boxAfter: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const r of responses) {
      const s = afterMap[r.itemId];
      if (s) boxAfter[String(s.box)]++;
    }

    // Persist Beta posteriors for Phase 2 P-1 Thompson sampling.
    const postMap = persistSessionResponses(
      responses.map((r) => ({ qtId: r.qtId, isCorrect: r.correct })),
      diagnostic.dimensionScores
    );
    const posterior = postMap[plan.targetQuestionType.id];

    // Phase 1.5: assemble session record (NOT yet saved — wait for user action).
    const endedAt = new Date().toISOString();
    const durationSec = Math.round(
      (new Date(endedAt).getTime() - new Date(sessionStart).getTime()) / 1000
    );
    const record: SessionRecord = {
      sessionId: `s-${Date.now()}`,
      startedAt: sessionStart,
      endedAt,
      durationSec,
      targetQuestionType: plan.targetQuestionType.id,
      algorithm: plan.algorithm,
      confidence: plan.confidence,
      alternateQuestionType: plan.alternateQuestionType.id,
      correct,
      total: responses.length,
      advancements,
      boxAfter,
      posteriorAfter: posterior,
      responses: responses.map((r) => ({
        itemId: r.itemId,
        qtId: r.qtId,
        isCorrect: r.correct,
        dimensionScores: diagnostic.dimensionScores,
        at: r.at,
      })),
    };
    setSessionRecord(record);
    setSummary({ correct, total: responses.length, advancements, boxAfter, posterior });
    setDone(true);
  }

  function saveWithEvaluation(evaluation: SessionEvaluation | undefined) {
    if (!sessionRecord || evalSaved) return;
    const record: SessionRecord = evaluation
      ? { ...sessionRecord, evaluation }
      : sessionRecord;
    saveSession(record);
    setSessionRecord(record);
    setEvalSaved(true);
  }

  function restart() {
    // Full reload — gets fresh sessionStart + new plan (Thompson sampling) +
    // ensures stored session is reflected if user navigates to /sessions.
    if (typeof window !== "undefined") window.location.reload();
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          F3 · Learning Queue
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          학습 큐 — {plan.targetQuestionType.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
              plan.algorithm === "thompson-v2"
                ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
            ].join(" ")}
          >
            {plan.algorithm}
          </span>
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
              plan.confidence === "high"
                ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                : plan.confidence === "mid"
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
            ].join(" ")}
          >
            confidence: {plan.confidence}
          </span>
          <span className="text-xs text-zinc-500">
            대안: {plan.alternateQuestionType.name}
          </span>
        </div>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          약점 추정 정답률: {(plan.predictedCorrectness * 100).toFixed(0)}% · 차원:{" "}
          {plan.targetDimensions.join(", ")} · 총 {totalCards}문항 · Leitner 5-Box SR
        </p>
        <p className="text-xs text-zinc-500">
          ※ 어휘 풀: vocabulary-db (484 unique lemmas, 486 cards). 룰엔진: PRD §B-4.
        </p>
      </header>

      {!done && card && (
        <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {currentIdx + 1} / {totalCards}
            </span>
            <span>
              {card.dimension.replace("_", " ")} · b={card.difficulty.toFixed(2)} ·{" "}
              {card.cefr}
            </span>
          </div>
          <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
            {card.questionText}
          </h2>
          <ol className="flex flex-col gap-2">
            {card.options.map((opt, i) => {
              const isSelected = selectedIdx === i;
              const isAnswer = i === card.answerIdx;
              const showResult = revealed;
              const cls = [
                "rounded-md border px-4 py-2 text-left text-sm transition-colors",
                showResult && isAnswer
                  ? "border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100"
                  : showResult && isSelected
                    ? "border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
                    : isSelected
                      ? "border-zinc-900 dark:border-zinc-100"
                      : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600",
              ].join(" ");
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => chooseOption(i)}
                    className={cls + " w-full"}
                    disabled={revealed}
                  >
                    <span className="mr-2 font-mono text-zinc-500">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    {opt}
                  </button>
                </li>
              );
            })}
          </ol>

          {revealed && (
            <p className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {card.rationaleKo}
            </p>
          )}

          <div className="flex justify-end gap-2">
            {!revealed ? (
              <button
                type="button"
                onClick={submit}
                disabled={selectedIdx == null}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-zinc-50 transition-colors hover:bg-zinc-700 disabled:opacity-30 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
              >
                제출
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
              >
                {currentIdx + 1 >= totalCards ? "결과 보기" : "다음"}
              </button>
            )}
          </div>
        </section>
      )}

      {done && summary && (
        <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            세션 완료
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="정답" value={`${summary.correct} / ${summary.total}`} />
            <Stat
              label="정답률"
              value={`${((summary.correct / summary.total) * 100).toFixed(0)}%`}
            />
            <Stat
              label="Box 승격"
              value={`${summary.advancements} / ${summary.total}`}
              hint="KR3.2 (≥6/10 통과)"
            />
            <Stat
              label="차원"
              value={dimensionsInQueue(plan.cards).join(", ")}
            />
          </dl>

          {summary.posterior && (
            <div className="flex flex-col gap-1 rounded-md bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900">
              <p className="font-medium text-zinc-700 dark:text-zinc-300">
                Thompson posterior — {plan.targetQuestionType.name}
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">
                α={summary.posterior.alpha.toFixed(1)} · β={summary.posterior.beta.toFixed(1)} ·
                samples={summary.posterior.samples} · confidence={posteriorConfidence(summary.posterior)}
              </p>
              <p className="text-zinc-500">
                다음 큐 추천에 즉시 반영됨 (localStorage 영속화).
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              세션 종료 후 Box 분포 (이번 큐 항목만)
            </p>
            <div className="flex gap-2">
              {(["1", "2", "3", "4", "5"] as const).map((b) => (
                <div
                  key={b}
                  className="flex flex-1 flex-col items-center rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <p className="text-xs text-zinc-500">Box {b}</p>
                  <p className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                    {summary.boxAfter[b] ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <EvaluationForm
            onSave={saveWithEvaluation}
            saved={evalSaved}
            onRestart={restart}
          />
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{value}</p>
      {hint && <p className="text-[10px] text-zinc-400">{hint}</p>}
    </div>
  );
}

interface EvalFormProps {
  onSave: (evaluation: SessionEvaluation | undefined) => void;
  saved: boolean;
  onRestart: () => void;
}

function EvaluationForm({ onSave, saved, onRestart }: EvalFormProps) {
  const [c12, setC12] = useState<number>(0);
  const [c21, setC21] = useState<number>(0);
  const [c23, setC23] = useState<number>(0);
  const [c33, setC33] = useState<"yes" | "no" | "">("");
  const [overall, setOverall] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");

  function handleSave(withEval: boolean) {
    if (withEval) {
      const evaluation: SessionEvaluation = {
        c1_2_diagnostic_consistency: c12,
        c2_1_map_acceptance: c21,
        c2_3_node_intuition: c23,
        c3_3_continue_intention: c33 || "no",
        overall_satisfaction: overall,
        notes,
      };
      onSave(evaluation);
    } else {
      onSave(undefined);
    }
  }

  const hasAny = c12 > 0 || c21 > 0 || c23 > 0 || c33 !== "" || overall > 0 || notes !== "";

  if (saved) {
    return (
      <div className="flex flex-col gap-3 rounded-md bg-green-50 px-4 py-3 dark:bg-green-950">
        <p className="text-sm text-green-900 dark:text-green-100">
          ✓ 세션 저장 완료. <a className="underline" href="/sessions">/sessions</a>에서 히스토리 확인.
        </p>
        <button
          type="button"
          onClick={onRestart}
          className="self-start rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          새 큐 시작
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs uppercase tracking-wider text-zinc-500">
        세션 평가 (선택 — W8 dogfooding)
      </p>
      <RatingRow label="C1.2 진단 weakDim 직관 일치도" value={c12} onChange={setC12} />
      <RatingRow label="C2.1 Map weakness 도메인 납득도" value={c21} onChange={setC21} />
      <RatingRow label="C2.3 노드 detail 직관성" value={c23} onChange={setC23} />
      <div className="flex items-center gap-2">
        <p className="w-64 text-xs text-zinc-700 dark:text-zinc-300">
          C3.3 다시 할 의향?
        </p>
        <button
          type="button"
          onClick={() => setC33("yes")}
          className={[
            "rounded-md px-3 py-1 text-xs",
            c33 === "yes"
              ? "bg-green-600 text-white"
              : "border border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400",
          ].join(" ")}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => setC33("no")}
          className={[
            "rounded-md px-3 py-1 text-xs",
            c33 === "no"
              ? "bg-red-600 text-white"
              : "border border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400",
          ].join(" ")}
        >
          No
        </button>
      </div>
      <RatingRow label="종합 만족도" value={overall} onChange={setOverall} />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="메모 (선택)"
        className="rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-800"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleSave(hasAny)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
        >
          {hasAny ? "평가와 함께 저장" : "평가 없이 저장"}
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          저장하지 않고 새 큐 시작
        </button>
      </div>
    </div>
  );
}

interface RatingRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function RatingRow({ label, value, onChange }: RatingRowProps) {
  return (
    <div className="flex items-center gap-2">
      <p className="w-64 text-xs text-zinc-700 dark:text-zinc-300">{label}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={[
              "h-7 w-7 rounded-md text-xs",
              value === n
                ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900",
            ].join(" ")}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
