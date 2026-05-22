/**
 * Diagnostic contract — mirrors smilepat/level-test-pat output and
 * smilepat/vocab-learn-pat/src/types/diagnostic.ts (production consumer).
 *
 * Transport: (1) URL query `?result=<base64(JSON)>`, (2) manual paste,
 * (3) localStorage cache. OELP consumes the same 3 paths.
 *
 * Note on D6_Cloze: level-test-pat exposes D6_Cloze; OELP follows
 * vocab-learn-pat convention and folds it into D3_Context via dimension-mapping.md §3.2.
 */

export type VocabDimension =
  | "D1_Form"
  | "D2_Meaning"
  | "D3_Context"
  | "D4_Network"
  | "D5_Usage";

export interface DiagnosticInput {
  studentName: string;
  /** IRT theta, -4.0 ~ +4.0 */
  theta: number;
  /** 1=초등, 6=유학 */
  level: 1 | 2 | 3 | 4 | 5 | 6;
  cefr: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  /** 차원별 정답률 0~100 */
  dimensionScores: Partial<Record<VocabDimension, number>>;
  weakDim: VocabDimension[];
  strongDim: VocabDimension[];
  timestamp: string;
  source?: string;
}

export function isDiagnosticInput(v: unknown): v is DiagnosticInput {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.studentName === "string" &&
    typeof o.theta === "number" &&
    typeof o.level === "number" &&
    (o.level as number) >= 1 &&
    (o.level as number) <= 6 &&
    typeof o.cefr === "string" &&
    typeof o.dimensionScores === "object" &&
    Array.isArray(o.weakDim) &&
    Array.isArray(o.strongDim) &&
    typeof o.timestamp === "string"
  );
}

/** URL-safe base64 decoded JSON → DiagnosticInput. Returns null on any failure. */
export function decodeResultParam(encoded: string): DiagnosticInput | null {
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? decodeURIComponent(escape(atob(normalized)))
        : Buffer.from(normalized, "base64").toString("utf-8");
    const parsed: unknown = JSON.parse(json);
    return isDiagnosticInput(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const DEMO_DIAGNOSTIC: DiagnosticInput = {
  studentName: "Demo Student",
  theta: 0.3,
  level: 4,
  cefr: "B2",
  dimensionScores: {
    D1_Form: 78,
    D2_Meaning: 82,
    D3_Context: 45,
    D4_Network: 60,
    D5_Usage: 71,
  },
  weakDim: ["D3_Context", "D4_Network"],
  strongDim: ["D2_Meaning", "D1_Form"],
  timestamp: new Date(0).toISOString(),
  source: "demo",
};

// ─── API client stub ──────────────────────────────────────────────
// Real implementation will call vocab-cat-test FastAPI (Cloud Run).
// For now: env-driven base URL, throws if unset.

const VOCAB_CAT_TEST_URL = process.env.NEXT_PUBLIC_VOCAB_CAT_TEST_URL;

export async function fetchDiagnostic(studentName: string): Promise<DiagnosticInput> {
  if (!VOCAB_CAT_TEST_URL) {
    throw new Error(
      "NEXT_PUBLIC_VOCAB_CAT_TEST_URL is not set. See docker-compose.yml or .env.example."
    );
  }
  const res = await fetch(`${VOCAB_CAT_TEST_URL}/api/diagnose`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentName }),
  });
  if (!res.ok) {
    throw new Error(`vocab-cat-test responded ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!isDiagnosticInput(data)) {
    throw new Error("vocab-cat-test response failed DiagnosticInput contract check");
  }
  return data;
}
