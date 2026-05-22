"use client";

import { useEffect, useMemo, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { buildOntologyElements } from "@/lib/ontology";
import type { VocabDimension } from "@/lib/diagnostic";

interface Props {
  /** Optional 5D scores (0-100) — colors QuestionType nodes by predicted weakness. */
  scores?: Partial<Record<VocabDimension, number>>;
  height?: number;
  onNodeClick?: (id: string) => void;
}

// weakness buckets — green (strong) → red (weak)
const WEAKNESS_COLORS = {
  w0: "#22c55e", // green
  w1: "#84cc16", // lime
  w2: "#eab308", // yellow
  w3: "#f97316", // orange
  w4: "#ef4444", // red
} as const;

/**
 * Cytoscape.js wrapper for the OELP microskill graph.
 * Renders 10 QuestionType + 21 keyVariables + 7 DistractorType + cluster parents.
 */
export function OntologyMap({ scores, height = 560, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const elements = useMemo<ElementDefinition[]>(
    () => buildOntologyElements(scores) as unknown as ElementDefinition[],
    [scores]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "font-size": 11,
            color: "#27272a",
            "text-valign": "center",
            "text-halign": "center",
            "text-wrap": "wrap",
            "text-max-width": "120px",
          },
        },
        {
          selector: "node.qt",
          style: {
            shape: "round-rectangle",
            width: 110,
            height: 44,
            "background-color": "#e4e4e7",
            "border-width": 1.5,
            "border-color": "#52525b",
            color: "#0a0a0a",
            "font-weight": "bold",
          },
        },
        { selector: "node.w0", style: { "background-color": WEAKNESS_COLORS.w0 } },
        { selector: "node.w1", style: { "background-color": WEAKNESS_COLORS.w1 } },
        { selector: "node.w2", style: { "background-color": WEAKNESS_COLORS.w2 } },
        { selector: "node.w3", style: { "background-color": WEAKNESS_COLORS.w3 } },
        { selector: "node.w4", style: { "background-color": WEAKNESS_COLORS.w4 } },
        {
          selector: "node.kv",
          style: {
            shape: "ellipse",
            width: 14,
            height: 14,
            "background-color": "#a1a1aa",
            "border-color": "#71717a",
            "border-width": 1,
            "font-size": 9,
            "text-margin-y": -8,
            color: "#52525b",
          },
        },
        {
          selector: "node.dist",
          style: {
            shape: "diamond",
            width: 24,
            height: 24,
            "background-color": "#fbbf24",
            "border-color": "#d97706",
            "border-width": 1,
            color: "#52525b",
            "font-size": 10,
          },
        },
        {
          selector: "node.cluster",
          style: {
            shape: "round-rectangle",
            "background-color": "#f4f4f5",
            "background-opacity": 0.6,
            "border-color": "#d4d4d8",
            "border-width": 1,
            "border-style": "dashed",
            color: "#71717a",
            "font-size": 11,
            "text-valign": "top",
            "text-halign": "center",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": "#d4d4d8",
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "target-arrow-color": "#d4d4d8",
            "arrow-scale": 0.7,
          },
        },
        {
          selector: "node:selected",
          style: { "border-color": "#3b82f6", "border-width": 3 },
        },
      ],
      layout: { name: "cose", animate: false, padding: 24 },
      wheelSensitivity: 0.2,
      minZoom: 0.4,
      maxZoom: 2.5,
    });

    if (onNodeClick) {
      cyRef.current.on("tap", "node", (evt) => {
        onNodeClick(evt.target.id());
      });
    }

    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [elements, onNodeClick]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height }}
      className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
    />
  );
}
