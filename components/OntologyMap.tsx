"use client";

import { useEffect, useMemo, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { buildOntologyElements } from "@/lib/ontology";
import type { VocabDimension } from "@/lib/diagnostic";

type SkillLayerId = "V" | "S" | "D" | "R" | "A";

interface Props {
  /** Optional 5D scores (0-100) — colors QuestionType nodes by predicted weakness. */
  scores?: Partial<Record<VocabDimension, number>>;
  height?: number;
  onNodeClick?: (id: string) => void;
  /** PR-3.5: overlay the P→V→S→D→R→A skill ontology nodes + edges. Default false. */
  includeSkills?: boolean;
  /** When includeSkills, restrict to these layers. Default = all 5. */
  skillLayers?: SkillLayerId[];
  /** PR-3.6: highlight these node ids with the `causal-path` class. */
  causalPathIds?: string[];
}

// PR-3.5 skill layer accent colors (chosen for color-blind friendliness)
const SKILL_LAYER_COLORS: Record<SkillLayerId, string> = {
  V: "#fde68a", // amber-200 — vocabulary
  S: "#bae6fd", // sky-200 — sentence
  D: "#c7d2fe", // indigo-200 — discourse
  R: "#fbcfe8", // pink-200 — reasoning
  A: "#bbf7d0", // green-200 — academic
};

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
export function OntologyMap({
  scores,
  height = 560,
  onNodeClick,
  includeSkills = false,
  skillLayers,
  causalPathIds,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const elements = useMemo<ElementDefinition[]>(
    () =>
      buildOntologyElements(scores, {
        includeSkills,
        skillLayers,
      }) as unknown as ElementDefinition[],
    [scores, includeSkills, skillLayers]
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
        // PR-3.5: skill ontology overlay styles
        {
          selector: "node.skill",
          style: {
            shape: "round-rectangle",
            width: 80,
            height: 32,
            "border-width": 1,
            "border-color": "#52525b",
            "font-size": 10,
            color: "#18181b",
          },
        },
        { selector: "node.skill-V", style: { "background-color": SKILL_LAYER_COLORS.V } },
        { selector: "node.skill-S", style: { "background-color": SKILL_LAYER_COLORS.S } },
        { selector: "node.skill-D", style: { "background-color": SKILL_LAYER_COLORS.D } },
        { selector: "node.skill-R", style: { "background-color": SKILL_LAYER_COLORS.R } },
        { selector: "node.skill-A", style: { "background-color": SKILL_LAYER_COLORS.A } },
        // PR-3.5: 3 edge types from roadmap image legend
        {
          selector: "edge.edge-core",
          style: {
            width: 2,
            "line-color": "#52525b",
            "line-style": "solid",
            "target-arrow-color": "#52525b",
          },
        },
        {
          selector: "edge.edge-support",
          style: {
            width: 1.5,
            "line-color": "#a1a1aa",
            "line-style": "dashed",
            "target-arrow-color": "#a1a1aa",
          },
        },
        {
          selector: "edge.edge-indirect",
          style: {
            width: 1,
            "line-color": "#d4d4d8",
            "line-style": "dotted",
            "target-arrow-color": "#d4d4d8",
            "target-arrow-shape": "none",
          },
        },
        {
          selector: "edge.edge-qt-skill",
          style: {
            width: 1,
            "line-color": "#fbbf24",
            "line-opacity": 0.55,
            "target-arrow-color": "#fbbf24",
            "target-arrow-shape": "vee",
          },
        },
        // PR-3.6: causal-path highlight
        {
          selector: "node.causal-path",
          style: {
            "border-color": "#7c3aed",
            "border-width": 3,
            "background-blacken": -0.05,
          },
        },
        {
          selector: "edge.causal-path",
          style: {
            "line-color": "#7c3aed",
            "target-arrow-color": "#7c3aed",
            width: 2.5,
            "z-index": 999,
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

    // PR-3.6: apply causal-path class to highlighted nodes + connecting edges
    if (causalPathIds && causalPathIds.length > 0) {
      const idSet = new Set(causalPathIds);
      cyRef.current.nodes().forEach((n) => {
        if (idSet.has(n.id())) n.addClass("causal-path");
      });
      cyRef.current.edges().forEach((e) => {
        if (idSet.has(e.source().id()) && idSet.has(e.target().id())) {
          e.addClass("causal-path");
        }
      });
    }

    // Expose cy instance in dev mode for debugging/testing
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      (window as unknown as { __oelpCy?: Core }).__oelpCy = cyRef.current;
    }

    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [elements, onNodeClick, causalPathIds]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height }}
      className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
    />
  );
}
