"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartConfiguration,
} from "chart.js";
import type { VocabDimension } from "@/lib/diagnostic";
import { computeLayerMasteries, type LayerMastery } from "@/lib/skill-mastery";

Chart.register(
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const LAYER_LABELS: Record<string, string> = {
  V: "V · Vocabulary",
  S: "S · Sentence",
  D: "D · Discourse",
  R: "R · Reasoning",
  A: "A · Academic",
};

interface Props {
  scores: Partial<Record<VocabDimension, number>>;
  height?: number;
}

/**
 * 10th OELP surface (PR-6 of p2a-ontology). Renders the learner's
 * per-layer mastery on a 5-axis radar (V/S/D/R/A). Unmeasured layers
 * render at 0 and are flagged in the layer-coverage caption below the chart.
 */
export function SkillMasteryRadar({ scores, height = 320 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const layers: LayerMastery[] = computeLayerMasteries(scores);

  useEffect(() => {
    if (!canvasRef.current) return;
    const labels = layers.map((l) => LAYER_LABELS[l.layer] ?? l.layer);
    const data = layers.map((l) => (typeof l.mastery === "number" ? l.mastery : 0));

    const config: ChartConfiguration<"radar"> = {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: "Skill mastery (0-100)",
            data,
            backgroundColor: "rgba(124, 58, 237, 0.18)",
            borderColor: "rgba(124, 58, 237, 0.9)",
            pointBackgroundColor: "rgba(124, 58, 237, 1)",
            pointRadius: 4,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { stepSize: 25, display: false },
            pointLabels: { font: { size: 11 } },
          },
        },
        plugins: { legend: { display: false } },
      },
    };

    chartRef.current = new Chart(canvasRef.current, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [layers]);

  const allUnmeasured = layers.every((l) => l.mastery === undefined);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          역량 숙련도 (5-layer aggregate)
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          P2A · derived view
        </span>
      </header>
      <div style={{ height }}>
        <canvas
          ref={canvasRef}
          aria-label="P→V→S→D→R→A 5 레이어 숙련도 레이더"
          role="img"
        />
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {allUnmeasured ? (
          <>진단 점수가 없어 모든 레이어가 0으로 표시됩니다.</>
        ) : (
          layers.map((l, i) => (
            <span key={l.layer}>
              {i > 0 && " · "}
              {l.layer} {l.coverage.measured}/{l.coverage.total}
            </span>
          ))
        )}
      </p>
    </div>
  );
}
