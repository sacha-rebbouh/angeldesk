/**
 * Phase C slice C1d-3 — Tier 2 + services direct completeJSON callers guard.
 *
 * Couvre les 5 callers directs `completeJSON` migrés vers le helper
 * partagé `assertCompletionNotTruncated` (cf. C1d-1) :
 *   - `src/agents/tier2/ai-expert.ts`
 *   - `src/agents/tier2/saas-expert.ts`
 *   - `src/services/term-sheet-extractor/index.ts`
 *   - `src/services/excel/analyst.ts` (2 sites : call principal + retry)
 *   - `src/services/negotiation/strategist.ts`
 *
 * Règle Codex : fail-closed strict partout (aucun `allowPartialOnTruncation`).
 *
 * Tests :
 *   1. Source guard global — pour chacun des 5 fichiers : import du
 *      helper + appel après chaque `completeJSON` + absence de
 *      `allowPartialOnTruncation`.
 *   2. Test fonctionnel Tier 2 (`saas-expert.run`) — mock
 *      `completeJSON` qui retourne `_wasTruncated: true` → throw.
 *   3. Test fonctionnel service (`term-sheet-extractor`) — mock
 *      `completeJSON` qui retourne `_wasTruncated: true` → throw.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Mocks router (completeJSON + setAgentContext + ensureLLMContext)
// ---------------------------------------------------------------------------

const { completeJSONMock, setAgentContextMock, ensureLLMContextMock } =
  vi.hoisted(() => ({
    completeJSONMock: vi.fn(),
    setAgentContextMock: vi.fn(),
    ensureLLMContextMock: vi.fn(),
  }));

vi.mock("@/services/openrouter/router", () => ({
  completeJSON: completeJSONMock,
  setAgentContext: setAgentContextMock,
  ensureLLMContext: ensureLLMContextMock,
}));

// ---------------------------------------------------------------------------
// 1. Source guard global (5 fichiers)
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

const C1D3_CALLERS: Array<{
  path: string;
  /** Nombre d'appels `completeJSON(` attendus dans le fichier. */
  expectedCalls: number;
  /** Scope `caller:` attendu(s) dans les options du helper. */
  expectedScopes: string[];
}> = [
  {
    path: "src/agents/tier2/ai-expert.ts",
    expectedCalls: 1,
    expectedScopes: ["ai-expert"],
  },
  {
    path: "src/agents/tier2/saas-expert.ts",
    expectedCalls: 1,
    expectedScopes: ["saas-expert"],
  },
  {
    path: "src/services/term-sheet-extractor/index.ts",
    expectedCalls: 1,
    expectedScopes: ["term-sheet-extractor"],
  },
  {
    path: "src/services/excel/analyst.ts",
    expectedCalls: 2, // call principal + retry path
    expectedScopes: ["excel-analyst", "excel-analyst.retry"],
  },
  {
    path: "src/services/negotiation/strategist.ts",
    expectedCalls: 1,
    expectedScopes: ["negotiation-strategist"],
  },
];

describe("Phase C C1d-3 — Source guards Tier 2 + services", () => {
  for (const caller of C1D3_CALLERS) {
    describe(caller.path, () => {
      const source = loadFile(caller.path);

      it("importe `assertCompletionNotTruncated` depuis le helper partagé", () => {
        expect(
          /import\s*\{[^}]*assertCompletionNotTruncated[^}]*\}\s*from\s*["']@\/services\/openrouter\/truncation-guard["']/.test(
            source,
          ),
        ).toBe(true);
      });

      it(`appelle \`assertCompletionNotTruncated\` au moins ${caller.expectedCalls} fois (1 par call \`completeJSON\`)`, () => {
        const matches = source.match(/assertCompletionNotTruncated\s*\(/g) ?? [];
        expect(matches.length).toBeGreaterThanOrEqual(caller.expectedCalls);
      });

      it("contient les scopes `caller:` attendus pour le diagnostic prod", () => {
        for (const scope of caller.expectedScopes) {
          expect(source).toContain(`caller: "${scope}"`);
        }
      });

      it("aucun `allowPartialOnTruncation` (fail-closed strict)", () => {
        expect(/allowPartialOnTruncation/.test(source)).toBe(false);
      });

      it("le helper est invoqué APRÈS le premier `completeJSON<` (call, pas import)", () => {
        // Heuristique structurelle : on cherche le premier APPEL
        // `assertCompletionNotTruncated(` (avec paren ouvrante — ce qui
        // exclut l'import `{ assertCompletionNotTruncated }`). Cet appel
        // doit apparaître APRÈS le premier `completeJSON<`. Cela garantit
        // que le helper protège bien le call site (et n'est pas juste
        // importé symboliquement).
        const completeIdx = source.indexOf("completeJSON<");
        const assertCallIdx = source.indexOf("assertCompletionNotTruncated(");
        expect(completeIdx).toBeGreaterThan(-1);
        expect(assertCallIdx).toBeGreaterThan(completeIdx);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Test fonctionnel Tier 2 — saasExpert.run throw sur troncature
// ---------------------------------------------------------------------------

describe("Phase C C1d-3 — saasExpert.run fail-closed on _wasTruncated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throw avec message truncation quand `completeJSON` retourne `_wasTruncated: true`", async () => {
    // saas-expert consomme `getStandardsOnlyInjection` (sync) + context.canonicalDeal.
    // On lui fournit un context minimal et on s'assure que le LLM mock
    // est invoqué — le helper truncation doit throw avant la suite.
    completeJSONMock.mockResolvedValueOnce({
      data: { partial: true, _wasTruncated: true },
      cost: 0.01,
      model: "anthropic/claude-sonnet-4.5",
      raw: "{}",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const { saasExpert } = await import("@/agents/tier2/saas-expert");

    const minimalContext = {
      canonicalDeal: {
        id: "deal_test",
        companyName: "TestCo",
        stage: "SEED",
        sector: "SaaS",
      },
      previousResults: {},
    } as never;

    const result = await saasExpert.run(minimalContext);

    // L'agent catche en interne (try/catch) et propage `success: false`
    // avec l'erreur dans `result.error`. C'est le comportement attendu
    // d'un agent BaseAgent-style : pas un throw direct, mais un échec
    // tracé.
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/truncated/i);
    expect(result.error).toMatch(/saas-expert/);
  });
});

// ---------------------------------------------------------------------------
// 3. Test fonctionnel service — extractTermsFromDocument throw sur troncature
// ---------------------------------------------------------------------------

describe("Phase C C1d-3 — extractTermsFromDocument fail-closed on _wasTruncated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throw quand `completeJSON` retourne `_wasTruncated: true`", async () => {
    completeJSONMock.mockResolvedValueOnce({
      data: {
        valuationPre: 5_000_000,
        amountRaised: 1_000_000,
        _wasTruncated: true,
      },
      cost: 0.01,
      model: "anthropic/claude-haiku-4.5",
      raw: "{}",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const { extractTermsFromDocument } = await import(
      "@/services/term-sheet-extractor"
    );

    await expect(
      extractTermsFromDocument({
        documentText: "Sample term sheet content",
        documentName: "test-term-sheet.pdf",
      }),
    ).rejects.toThrow(/LLM JSON response was truncated and auto-repaired/i);
  });

  it("Le message d'erreur inclut le caller `term-sheet-extractor`", async () => {
    completeJSONMock.mockResolvedValueOnce({
      data: { _wasTruncated: true },
      cost: 0.01,
      model: "test",
      raw: "{}",
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const { extractTermsFromDocument } = await import(
      "@/services/term-sheet-extractor"
    );

    await expect(
      extractTermsFromDocument({
        documentText: "x",
        documentName: "y",
      }),
    ).rejects.toThrow(/\[term-sheet-extractor\]/);
  });

  it("Comportement normal préservé quand la réponse n'est PAS tronquée", async () => {
    completeJSONMock.mockResolvedValueOnce({
      data: {
        valuationPre: 5_000_000,
        amountRaised: 1_000_000,
        dilutionPct: 20,
        instrumentType: "EQUITY_PREFERRED",
        liquidationPref: "1x_non_participating",
        antiDilution: "weighted_average_broad",
        proRataRights: true,
        informationRights: true,
        boardSeat: "observer",
        founderVesting: true,
        vestingDurationMonths: 48,
        vestingCliffMonths: 12,
        esopPct: 10,
        dragAlong: true,
        tagAlong: true,
        ratchet: false,
        payToPlay: false,
        milestoneTranches: false,
        nonCompete: true,
        customConditions: [],
        confidence: {},
      },
      cost: 0.01,
      model: "test",
      raw: "{}",
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const { extractTermsFromDocument } = await import(
      "@/services/term-sheet-extractor"
    );

    const result = await extractTermsFromDocument({
      documentText: "Sample",
      documentName: "test.pdf",
    });
    expect(result.valuationPre).toBe(5_000_000);
  });
});
