"use client";

import type { SkillClassRow } from "@/lib/teacher-aggregate";
import type { LearnerInput } from "@/lib/teacher-aggregate";

interface Props {
  rows: SkillClassRow[];
  learners: LearnerInput[];
}

// Same 5-bucket palette OntologyMap uses (color-blind friendly)
function colorFor(m: number | null): string {
  if (m === null) return "transparent";
  if (m < 25) return "#ef4444"; // red
  if (m < 45) return "#f97316"; // orange
  if (m < 65) return "#eab308"; // yellow
  if (m < 85) return "#84cc16"; // lime
  return "#22c55e"; // green
}

/**
 * 33-skill × N-learner heatmap rendered as a semantic <table> so screen
 * readers can iterate row-by-row. The accompanying color band is
 * informational; the numeric mastery value is announced.
 */
export function SkillHeatmap({ rows, learners }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="min-w-full text-[10px] text-zinc-700 dark:text-zinc-300">
        <caption className="px-3 py-2 text-left text-xs font-semibold text-zinc-900 dark:text-zinc-50">
          P2A 역량 × 학습자 히트맵 ({rows.length} skills × {learners.length} learners)
        </caption>
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-zinc-50 px-2 py-1 text-left dark:bg-zinc-900">
              skill
            </th>
            {learners.map((l) => (
              <th key={l.id} scope="col" className="px-2 py-1 text-center font-mono">
                {l.label}
              </th>
            ))}
            <th scope="col" className="px-2 py-1 text-center">
              class mean
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.skill.id} className="border-t border-zinc-100 dark:border-zinc-800">
              <th
                scope="row"
                className="sticky left-0 bg-white px-2 py-1 text-left font-mono text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
              >
                <span className="font-semibold">{r.skill.id}</span>{" "}
                <span className="text-zinc-500">{r.skill.name}</span>
              </th>
              {learners.map((l) => {
                const m = r.perLearner[l.id];
                return (
                  <td
                    key={l.id}
                    className="px-2 py-1 text-center"
                    style={{ backgroundColor: colorFor(m) }}
                    aria-label={
                      m === null
                        ? `${l.label} ${r.skill.id} 측정 없음`
                        : `${l.label} ${r.skill.id} 숙련도 ${m.toFixed(0)}`
                    }
                  >
                    {m === null ? "—" : m.toFixed(0)}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-center font-mono tabular-nums">
                {r.classMean === null ? "—" : r.classMean.toFixed(0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
