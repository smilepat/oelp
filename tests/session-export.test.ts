/**
 * @vitest-environment jsdom
 *
 * Vitest — session-export (A7 coverage push, was 25%).
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  exportSessionsForCalibration,
  downloadCalibrationJSON,
  downloadFullSessionsJSON,
} from "@/lib/session-export";
import type { SessionRecord } from "@/lib/session-store";

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: "s-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:30:00.000Z",
    targetQuestionType: "TYPE-요지",
    algorithm: "rule-v1",
    confidence: "low",
    total: 3,
    correct: 2,
    responses: [
      {
        qtId: "TYPE-요지",
        dimensionScores: { D1_Form: 70, D2_Meaning: 80, D3_Context: 50, D4_Network: 60, D5_Usage: 65 },
        isCorrect: true,
      },
      {
        qtId: "TYPE-요지",
        dimensionScores: { D1_Form: 70, D2_Meaning: 80, D3_Context: 50, D4_Network: 60, D5_Usage: 65 },
        isCorrect: false,
      },
      {
        qtId: "TYPE-요지",
        dimensionScores: { D1_Form: 70, D2_Meaning: 80, D3_Context: 50, D4_Network: 60, D5_Usage: 65 },
        isCorrect: true,
      },
    ],
    ...overrides,
  };
}

describe("session-export (A7)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("T1: exportSessionsForCalibration flattens per-response rows", () => {
    const sessions = [makeSession({ sessionId: "a" }), makeSession({ sessionId: "b" })];
    const out = exportSessionsForCalibration(sessions);
    expect(out).toHaveLength(6); // 3 responses × 2 sessions
    expect(out[0]).toEqual({
      qtId: "TYPE-요지",
      dimensionScores: sessions[0].responses[0].dimensionScores,
      isCorrect: true,
    });
  });

  test("T2: empty sessions → empty array", () => {
    expect(exportSessionsForCalibration([])).toEqual([]);
  });

  test("T3: session with no responses contributes 0 rows", () => {
    const empty = makeSession({ responses: [] });
    expect(exportSessionsForCalibration([empty])).toEqual([]);
  });

  test("T4: downloadCalibrationJSON triggers anchor click + revokes object URL", () => {
    const sessions = [makeSession()];

    const created: string[] = [];
    const revoked: string[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:mock-${created.length}`;
      created.push(url);
      return url;
    });
    const revokeObjectURL = vi.fn((url: string) => revoked.push(url));
    // @ts-expect-error — partial mock
    URL.createObjectURL = createObjectURL;
    // @ts-expect-error — partial mock
    URL.revokeObjectURL = revokeObjectURL;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = downloadCalibrationJSON(sessions);
    expect(result).toBeTruthy();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revoked).toEqual(created);
  });

  test("T5: downloadFullSessionsJSON uses 'full' filename pattern", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createObjectURL = vi.fn(() => "blob:full");
    // @ts-expect-error — partial mock
    URL.createObjectURL = createObjectURL;
    // @ts-expect-error — partial mock
    URL.revokeObjectURL = vi.fn();

    // Capture the anchor's download attr by intercepting appendChild
    let capturedDownload: string | null = null;
    const origAppendChild = document.body.appendChild.bind(document.body);
    document.body.appendChild = ((node: Node) => {
      if (node instanceof HTMLAnchorElement) capturedDownload = node.download;
      return origAppendChild(node);
    }) as typeof document.body.appendChild;

    downloadFullSessionsJSON([makeSession()]);
    expect(capturedDownload).toMatch(/oelp-sessions-full-/);

    document.body.appendChild = origAppendChild;
  });

  test("T6: download with custom filename respected", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    // @ts-expect-error — partial mock
    URL.createObjectURL = vi.fn(() => "blob:custom");
    // @ts-expect-error — partial mock
    URL.revokeObjectURL = vi.fn();

    let captured: string | null = null;
    const origAppend = document.body.appendChild.bind(document.body);
    document.body.appendChild = ((node: Node) => {
      if (node instanceof HTMLAnchorElement) captured = node.download;
      return origAppend(node);
    }) as typeof document.body.appendChild;

    downloadCalibrationJSON([makeSession()], "my-custom.json");
    expect(captured).toBe("my-custom.json");

    document.body.appendChild = origAppend;
  });
});
