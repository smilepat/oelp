"use client";

import { useEffect, useState } from "react";
import { GrowthRadar } from "@/components/GrowthRadar";
import {
  DEMO_DIAGNOSTIC,
  decodeResultParam,
  isDiagnosticInput,
  type DiagnosticInput,
} from "@/lib/diagnostic";
import {
  setActiveDiagnostic,
  clearActiveDiagnostic,
  getActiveDiagnosticInfo,
} from "@/lib/active-diagnostic";
import { DIAGNOSTIC_PRESETS, type DiagnosticPreset } from "@/lib/diagnostic-presets";
import { AdaptiveDiagnostic } from "@/components/AdaptiveDiagnostic";
import { logEvent } from "@/lib/analytics-events";

export default function DiagnosePage() {
  const [result, setResult] = useState<DiagnosticInput | null>(null);
  const [active, setActive] = useState<{ name: string; setAt: string | null } | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  // One-shot URL + localStorage hydration. Lint rule disabled per-line:
  // URL params + localStorage are browser-only, can't lift state up.
  useEffect(() => {
    const url = new URL(window.location.href);
    const encoded = url.searchParams.get("result");
    if (encoded) {
      const decoded = decodeResultParam(encoded);
      if (decoded) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setResult(decoded);
        setActiveDiagnostic(decoded);
      }
    }
    const info = getActiveDiagnosticInfo();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive({ name: info.diagnostic.studentName, setAt: info.setAt });
  }, []);

  function loadDemo() {
    setResult(DEMO_DIAGNOSTIC);
    setActiveDiagnostic(DEMO_DIAGNOSTIC);
    setActive({ name: DEMO_DIAGNOSTIC.studentName, setAt: new Date().toISOString() });
    logEvent({ type: "diag.started", properties: { source: "preset", presetId: undefined } });
  }

  function loadPreset(preset: DiagnosticPreset) {
    setResult(preset.diagnostic);
    setActiveDiagnostic(preset.diagnostic);
    setActive({ name: preset.diagnostic.studentName, setAt: new Date().toISOString() });
    logEvent({
      type: "diag.started",
      properties: { source: "preset", presetId: preset.id },
    });
  }

  function clearActive() {
    clearActiveDiagnostic();
    setActive(null);
    setResult(null);
  }

  function handlePaste() {
    setPasteError(null);
    if (!pasteText.trim()) {
      setPasteError("JSON 또는 base64 결과를 붙여넣어 주세요.");
      return;
    }
    // Try base64 first (URL-safe)
    const decoded = decodeResultParam(pasteText.trim());
    if (decoded) {
      setResult(decoded);
      setActiveDiagnostic(decoded);
      setActive({ name: decoded.studentName, setAt: new Date().toISOString() });
      setPasteText("");
      logEvent({ type: "diag.started", properties: { source: "paste-import" } });
      return;
    }
    // Try raw JSON
    try {
      const parsed = JSON.parse(pasteText);
      if (isDiagnosticInput(parsed)) {
        setResult(parsed);
        setActiveDiagnostic(parsed);
        setActive({ name: parsed.studentName, setAt: new Date().toISOString() });
        setPasteText("");
        logEvent({ type: "diag.started", properties: { source: "paste-import" } });
        return;
      }
      setPasteError("DiagnosticInput 스키마와 일치하지 않습니다.");
    } catch {
      setPasteError("유효한 JSON 또는 base64 형식이 아닙니다.");
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          F1 · Diagnose
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          진단 (Adaptive CAT)
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          vocab-cat-test (FastAPI, IRT 2PL/3PL) 백엔드 임베드 예정. URL{" "}
          <code>?result=...</code> 또는 paste로 level-test-pat 결과 import 가능.
        </p>
      </header>

      {active && (
        <section className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
            <span className="font-medium text-emerald-900 dark:text-emerald-100">
              활성 진단: {active.name}
            </span>
            <span className="text-xs text-emerald-700 dark:text-emerald-300">
              ({active.setAt ? new Date(active.setAt).toLocaleString() : "default"}) ·{" "}
              <code>/queue</code> 가 이 진단 사용 중
            </span>
          </div>
          <button
            type="button"
            onClick={clearActive}
            className="self-start text-xs text-emerald-700 underline hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100 sm:self-auto"
          >
            기본값으로 되돌리기
          </button>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="text-xs uppercase tracking-wider text-zinc-500">
            Varied diagnostic presets · 원클릭 활성화
          </p>
          <p className="text-[10px] text-zinc-500">
            calibration rank-1 X 회피 — α/β/γ/δ 중 다른 것을 골라 여러 세션 진행
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DIAGNOSTIC_PRESETS.map((preset) => {
            const isActive = active?.name === preset.diagnostic.studentName;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`preset-${preset.id}`}
                onClick={() => loadPreset(preset)}
                className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950"
                    : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                }`}
              >
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {preset.label}
                </span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={loadDemo}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            데모 진단 로드 (constant)
          </button>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            미리보기 초기화
          </button>
        </div>
      </section>

      <AdaptiveDiagnostic
        onComplete={(d) => {
          setResult(d);
          setActiveDiagnostic(d);
          setActive({ name: d.studentName, setAt: new Date().toISOString() });
        }}
      />

      <section className="flex flex-col gap-2 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          커스텀 진단 import (P-1.5b)
        </p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          level-test-pat 결과 base64 또는 DiagnosticInput JSON 붙여넣기. 적용 시 /queue 가 이 진단을 사용 →
          calibration 시 dimensionScores 다양화 (rank-1 X 문제 해결).
        </p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={4}
          placeholder='{"studentName":"...","theta":0.5,"level":4,"cefr":"B2","dimensionScores":{"D1_Form":75,...},"weakDim":["D3_Context"],"strongDim":["D2_Meaning"],"timestamp":"..."} 또는 URL-safe base64'
          className="rounded-md border border-zinc-200 bg-transparent px-3 py-2 font-mono text-xs dark:border-zinc-800"
        />
        {pasteError && (
          <p className="text-xs text-red-600 dark:text-red-400">{pasteError}</p>
        )}
        <button
          type="button"
          onClick={handlePaste}
          className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
        >
          Import + 활성화
        </button>
      </section>

      {result ? (
        <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium text-zinc-950 dark:text-zinc-50">
              {result.studentName}
            </h2>
            <p className="text-xs text-zinc-500">
              Level {result.level} · CEFR {result.cefr} · θ {result.theta.toFixed(2)}
            </p>
          </div>
          <GrowthRadar before={result.dimensionScores} after={result.dimensionScores} />
          <div className="flex flex-col gap-1 text-xs text-zinc-500">
            <p>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Weak:</span>{" "}
              {result.weakDim.join(", ")}
            </p>
            <p>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Strong:</span>{" "}
              {result.strongDim.join(", ")}
            </p>
          </div>
        </section>
      ) : (
        <p className="text-sm text-zinc-500">
          진단 결과 미리보기가 없습니다. 위 버튼 또는 paste box 사용.
        </p>
      )}
    </main>
  );
}
