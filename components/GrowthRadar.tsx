"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartConfiguration,
} from "chart.js";
import type { VocabDimension } from "@/lib/diagnostic";

Chart.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const DIMS: VocabDimension[] = [
  "D1_Form",
  "D2_Meaning",
  "D3_Context",
  "D4_Network",
  "D5_Usage",
];

interface Props {
  before: Partial<Record<VocabDimension, number>>;
  after: Partial<Record<VocabDimension, number>>;
}

/**
 * 5축 레이더 차트 — 진단 vs 학습 후 비교.
 * Ported from smilepat/vocab-learn-pat/src/components/GrowthRadar.tsx
 */
export function GrowthRadar({ before, after }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<"radar"> | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const config: ChartConfiguration<"radar"> = {
      type: "radar",
      data: {
        labels: DIMS.map((d) => d.replace("_", " ")),
        datasets: [
          {
            label: "진단 (Before)",
            data: DIMS.map((d) => before[d] ?? 0),
            backgroundColor: "rgba(59, 130, 246, 0.18)",
            borderColor: "rgba(59, 130, 246, 0.9)",
            borderWidth: 2,
            pointRadius: 3,
          },
          {
            label: "학습 후 (After)",
            data: DIMS.map((d) => after[d] ?? 0),
            backgroundColor: "rgba(139, 92, 246, 0.22)",
            borderColor: "rgba(139, 92, 246, 0.9)",
            borderWidth: 2,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { stepSize: 20, color: "#94a3b8", backdropColor: "transparent" },
            angleLines: { color: "rgba(120,120,120,0.2)" },
            grid: { color: "rgba(120,120,120,0.16)" },
            pointLabels: { color: "#52525b", font: { size: 12 } },
          },
        },
        plugins: {
          legend: { labels: { color: "#52525b" } },
        },
      },
    };

    chartRef.current = new Chart(canvasRef.current, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [before, after]);

  return (
    <div style={{ position: "relative", height: 340 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
