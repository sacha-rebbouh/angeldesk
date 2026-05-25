/**
 * Phase C slice C1d-4 — Live direct completeJSON callers truncation guard.
 *
 * Couvre les 6 callers Live qui bypassent BaseAgent et appellent
 * `completeJSON` directement, migrés vers le helper partagé
 * `assertCompletionNotTruncated` (cf. C1d-1). Tous fail-closed strict
 * (aucun `allowPartialOnTruncation`).
 *
 * Stratégies de dégradation respectées (décision Codex C1d-4) :
 *   - **Live temps réel** (coaching-engine, auto-dismiss, utterance-router) :
 *     le throw est attrapé par le `catch` existant qui retourne le
 *     fallback (`NO_RESPONSE`, `[]`, `strategy_reveal`) — pas de
 *     consommation de JSON partiel.
 *   - **Live post-call** (transcript-condenser, post-call-generator,
 *     post-call-reanalyzer) : le throw propage jusqu'au caller (Vercel
 *     `after()` ou route stop) qui logge et skip — pas de re-analyse
 *     ni de rapport sur input incomplet.
 *
 * Tests :
 *   1. Source guard global — 6 fichiers : import + appel après chaque
 *      `completeJSON` + absence de `allowPartialOnTruncation`.
 *   2. Test fonctionnel chemin **fallback** (`classifyWithLLM` de
 *      utterance-router) : troncature → fallback `strategy_reveal`,
 *      pas de propagation d'erreur.
 *   3. Test fonctionnel chemin **post-call critique** (`generateDeltaReport`
 *      de post-call-reanalyzer) : troncature → throw, pas de
 *      `DeltaReport` partiel retourné.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Mocks router (completeJSON + runWithLLMContext)
// ---------------------------------------------------------------------------

const { completeJSONMock, runWithLLMContextMock } = vi.hoisted(() => ({
  completeJSONMock: vi.fn(),
  // Passthrough : exécute le callback directement, comme en runtime.
  runWithLLMContextMock: vi.fn((_ctx: unknown, fn: () => Promise<unknown>) =>
    fn(),
  ),
}));

vi.mock("@/services/openrouter/router", () => ({
  completeJSON: completeJSONMock,
  runWithLLMContext: runWithLLMContextMock,
}));

// Mock prisma (utilisé par post-call-reanalyzer pour la session lookup
// + sessionSummary pour generateDeltaReport).
vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveSession: {
      findUnique: vi.fn().mockResolvedValue({
        id: "session_1",
        dealId: "deal_1",
        documentId: "doc_1",
        startedAt: new Date("2026-05-25T10:00:00Z"),
        createdAt: new Date("2026-05-25T09:55:00Z"),
      }),
    },
    analysis: {
      findFirst: vi.fn().mockResolvedValue({
        id: "analysis_1",
        summary: "Baseline",
        corpusSnapshotId: null,
        documentIds: [],
      }),
    },
    sessionSummary: {
      findUnique: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        executiveSummary: "Test executive summary",
        newInformation: [],
        contradictions: [],
        questionsAsked: [],
        remainingQuestions: [],
      }),
    },
  },
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/services/corpus", () => ({
  getCorpusSnapshotDocumentIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/live/sanitize", () => ({
  sanitizeTranscriptText: (s: string) => s,
}));

// ---------------------------------------------------------------------------
// 1. Source guard global (6 fichiers)
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

const C1D4_LIVE_CALLERS: Array<{
  path: string;
  expectedCalls: number;
  expectedScopes: string[];
}> = [
  {
    path: "src/lib/live/coaching-engine.ts",
    expectedCalls: 1,
    expectedScopes: ["coaching-engine"],
  },
  {
    path: "src/lib/live/auto-dismiss.ts",
    expectedCalls: 1,
    expectedScopes: ["auto-dismiss"],
  },
  {
    path: "src/lib/live/utterance-router.ts",
    expectedCalls: 1,
    expectedScopes: ["utterance-router"],
  },
  {
    path: "src/lib/live/transcript-condenser.ts",
    expectedCalls: 1,
    expectedScopes: ["transcript-condenser"],
  },
  {
    path: "src/lib/live/post-call-generator.ts",
    expectedCalls: 1,
    expectedScopes: ["post-call-report"],
  },
  {
    path: "src/lib/live/post-call-reanalyzer.ts",
    expectedCalls: 1,
    expectedScopes: ["post-call-delta"],
  },
];

describe("Phase C C1d-4 — Source guards Live callers", () => {
  for (const caller of C1D4_LIVE_CALLERS) {
    describe(caller.path, () => {
      const source = loadFile(caller.path);

      it("importe `assertCompletionNotTruncated` depuis le helper partagé", () => {
        expect(
          /import\s*\{[^}]*assertCompletionNotTruncated[^}]*\}\s*from\s*["']@\/services\/openrouter\/truncation-guard["']/.test(
            source,
          ),
        ).toBe(true);
      });

      it(`appelle \`assertCompletionNotTruncated\` au moins ${caller.expectedCalls} fois`, () => {
        const matches = source.match(/assertCompletionNotTruncated\s*\(/g) ?? [];
        expect(matches.length).toBeGreaterThanOrEqual(caller.expectedCalls);
      });

      it("contient le(s) scope(s) `caller:` attendu(s) pour le diagnostic prod", () => {
        for (const scope of caller.expectedScopes) {
          expect(source).toContain(`caller: "${scope}"`);
        }
      });

      it("aucun `allowPartialOnTruncation` (fail-closed strict per arbitrage Codex)", () => {
        expect(/allowPartialOnTruncation/.test(source)).toBe(false);
      });

      it("le helper est invoqué APRÈS le premier `completeJSON<` (call, pas import)", () => {
        const completeIdx = source.indexOf("completeJSON<");
        const assertCallIdx = source.indexOf("assertCompletionNotTruncated(");
        expect(completeIdx).toBeGreaterThan(-1);
        expect(assertCallIdx).toBeGreaterThan(completeIdx);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Test fonctionnel — Live fallback : utterance-router → `strategy_reveal`
// ---------------------------------------------------------------------------

describe("Phase C C1d-4 — Live fallback path (utterance-router.classifyUtterance)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Troncature → fallback `strategy_reveal` (pas d'erreur propagée, pas de JSON partiel consommé)", async () => {
    completeJSONMock.mockResolvedValueOnce({
      data: {
        classification: "financial_claim",
        confidence: 0.9,
        _wasTruncated: true, // injecté par le router suite à auto-réparation
      },
      cost: 0.001,
      model: "anthropic/claude-haiku-4.5",
      raw: "{}",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const { classifyUtterance } = await import("@/lib/live/utterance-router");

    // Utterance sans pattern (pas filler, pas keyword) → tombe sur LLM
    // fallback `classifyWithLLM` qui matchera notre mock.
    const result = await classifyUtterance(
      "Quelque chose de très spécifique mais sans pattern.",
      "founder",
    );

    // Le throw du helper est attrapé par le `catch` du `classifyWithLLM`
    // (ligne 196) qui retourne le fallback safe `strategy_reveal` avec
    // confidence 0.5. JAMAIS de consommation du JSON partiel.
    expect(result.classification).toBe("strategy_reveal");
    expect(result.confidence).toBe(0.5);
  });

  it("Comportement normal préservé quand la réponse n'est PAS tronquée", async () => {
    completeJSONMock.mockResolvedValueOnce({
      data: {
        classification: "financial_claim",
        confidence: 0.95,
      },
      cost: 0.001,
      model: "test",
      raw: "{}",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const { classifyUtterance } = await import("@/lib/live/utterance-router");

    const result = await classifyUtterance(
      "Quelque chose de très spécifique sans pattern keyword.",
      "founder",
    );

    expect(result.classification).toBe("financial_claim");
    expect(result.confidence).toBe(0.95);
  });
});

// ---------------------------------------------------------------------------
// 3. Test fonctionnel — Live post-call critique : generateDeltaReport throw
// ---------------------------------------------------------------------------

describe("Phase C C1d-4 — Live post-call critique (generateDeltaReport)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Troncature → throw avec scope `post-call-delta` (pas de DeltaReport partiel)", async () => {
    completeJSONMock.mockResolvedValueOnce({
      data: {
        impactedAgents: ["financial-auditor"],
        deltaPoints: [],
        _wasTruncated: true,
      },
      cost: 0.01,
      model: "anthropic/claude-sonnet-4.5",
      raw: "{}",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const { generateDeltaReport } = await import(
      "@/lib/live/post-call-reanalyzer"
    );

    await expect(
      generateDeltaReport("session_1", "deal_1"),
    ).rejects.toThrow(/\[post-call-delta\]/);
  });

  it("Message d'erreur inclut `truncated and auto-repaired`", async () => {
    completeJSONMock.mockResolvedValueOnce({
      data: { _wasTruncated: true },
      cost: 0.01,
      model: "test",
      raw: "{}",
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const { generateDeltaReport } = await import(
      "@/lib/live/post-call-reanalyzer"
    );

    await expect(
      generateDeltaReport("session_1", "deal_1"),
    ).rejects.toThrow(/truncated and auto-repaired/i);
  });
});
