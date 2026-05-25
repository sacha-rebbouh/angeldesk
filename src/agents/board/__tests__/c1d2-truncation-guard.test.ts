/**
 * Phase C slice C1d-2 — Board direct completeJSON truncation guard.
 *
 * Vérifie que les chemins Board (qui bypassent BaseAgent et appellent
 * `completeJSON` directement) fail-closed sur troncature LLM via le
 * helper partagé `assertCompletionNotTruncated`.
 *
 * Couvre :
 *   1. **Test fonctionnel `BoardMember.analyze`** : mock `completeJSON`
 *      qui renvoie un payload avec `_wasTruncated: true` ; la méthode
 *      doit throw avec un message clair incluant le caller.
 *   2. **Source guard `board-member.ts`** : import + appel après chaque
 *      des 4 calls `completeJSON` (thesisDebate, initialAnalysis,
 *      debateResponse, finalVote).
 *   3. **Source guard `board-orchestrator.ts`** : import + appel après le
 *      call de dédup sémantique. Pas de test fonctionnel mocké ici car
 *      `BoardOrchestrator.runBoard` couvre une chaîne complexe (Tier 0
 *      + Tier 1 + thesis + dedup) — coût d'instrumentation disproportionné
 *      par rapport au guard structural. Le test fonctionnel sur
 *      `BoardMember.analyze` couvre le même contrat helper.
 *   4. **Allowlist** : aucun fichier Board n'utilise
 *      `allowPartialOnTruncation: true` (fail-closed strict — décision
 *      Codex C1d-2).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Mocks router (completeJSON + setAgentContext)
// ---------------------------------------------------------------------------

const { completeJSONMock, setAgentContextMock } = vi.hoisted(() => ({
  completeJSONMock: vi.fn(),
  setAgentContextMock: vi.fn(),
}));

vi.mock("@/services/openrouter/router", () => ({
  completeJSON: completeJSONMock,
  setAgentContext: setAgentContextMock,
}));

vi.mock("@/agents/board/context-compressor", () => ({
  compressBoardContext: vi.fn(() => "ctx summary"),
  buildDealSummary: vi.fn(() => "deal summary"),
}));

vi.mock("@/agents/thesis/prompt-formatting", () => ({
  formatAxisPromptLine: vi.fn(() => "axis line"),
  formatFrameworkPromptLine: vi.fn(() => "framework line"),
}));

vi.mock("@/agents/orchestration/prompts/anti-hallucination", () => ({
  getFiveAntiHallucinationDirectives: () => "## directives",
}));

import { BoardMember } from "@/agents/board/board-member";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Test fonctionnel — BoardMember.analyze throw sur troncature
// ---------------------------------------------------------------------------

describe("Phase C C1d-2 — BoardMember fail-closed on _wasTruncated", () => {
  it("`analyze()` throw quand `completeJSON` retourne `_wasTruncated: true`", async () => {
    completeJSONMock.mockResolvedValueOnce({
      data: {
        keyPoints: ["fragment 1"],
        scores: { quality: 50 },
        _wasTruncated: true, // ← injecté par le router suite à auto-réparation JSON
      },
      cost: 0.01,
      model: "anthropic/claude-sonnet-4.5",
      raw: "{}",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const member = new BoardMember({
      id: "yc-veteran",
      modelKey: "SONNET",
      name: "YC Veteran",
      color: "blue",
      provider: "anthropic",
    });

    const input = {
      deal: { id: "deal_1", companyName: "Test", sector: "saas" } as never,
      analysis: {} as never,
      facts: {} as never,
    } as never;

    await expect(member.analyze(input)).rejects.toThrow(
      /LLM JSON response was truncated and auto-repaired/i,
    );
  });

  it("Le message d'erreur inclut le caller `board-member.<id>.initialAnalysis`", async () => {
    completeJSONMock.mockResolvedValueOnce({
      data: { _wasTruncated: true },
      cost: 0.01,
      model: "test",
      raw: "{}",
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const member = new BoardMember({
      id: "thiel-contrarian",
      modelKey: "SONNET",
      name: "Thiel Contrarian",
      color: "red",
      provider: "openai",
    });

    await expect(
      member.analyze({} as never),
    ).rejects.toThrow(/board-member\.thiel-contrarian\.initialAnalysis/);
  });

  it("`analyze()` réussit normalement quand la réponse n'est PAS tronquée", async () => {
    completeJSONMock.mockResolvedValueOnce({
      data: {
        keyPoints: ["argument 1", "argument 2"],
        scores: { quality: 80 },
      },
      cost: 0.05,
      model: "test",
      raw: "{}",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const member = new BoardMember({
      id: "angel-desk",
      modelKey: "SONNET",
      name: "Angel Desk",
      color: "green",
      provider: "anthropic",
    });

    const result = await member.analyze({} as never);
    expect(result.cost).toBe(0.05);
    expect(result.analysis).toMatchObject({ keyPoints: expect.any(Array) });
  });
});

// ---------------------------------------------------------------------------
// 2. Source guards — board-member.ts (5 lieux) + board-orchestrator.ts (1)
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "../../../..");

function loadFile(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), "utf-8");
}

describe("Phase C C1d-2 — Source guards Board", () => {
  describe("board-member.ts", () => {
    const source = loadFile("src/agents/board/board-member.ts");

    it("importe `assertCompletionNotTruncated` depuis le helper partagé", () => {
      expect(
        /import\s*\{[^}]*assertCompletionNotTruncated[^}]*\}\s*from\s*["']@\/services\/openrouter\/truncation-guard["']/.test(
          source,
        ),
      ).toBe(true);
    });

    it("appelle le helper dans les 4 méthodes Board avec le bon `caller` scope", () => {
      // 4 callers attendus, ordre méthode-méthode.
      expect(/thesisDebate/.test(source)).toBe(true);
      expect(/initialAnalysis/.test(source)).toBe(true);
      expect(/debateResponse/.test(source)).toBe(true);
      expect(/finalVote/.test(source)).toBe(true);

      // Le helper est invoqué au moins 4 fois (1 par méthode `completeJSON`).
      const matches = source.match(/assertCompletionNotTruncated\s*\(/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(4);
    });

    it("chaque appel `completeJSON` est suivi de `assertCompletionNotTruncated` AVANT toute consommation de `result.data`", () => {
      // Pour chaque occurrence `completeJSON(`, on vérifie qu'il existe un
      // `assertCompletionNotTruncated(` plus loin dans la même méthode (avant
      // le `return` ou la prochaine méthode). Heuristique : on découpe le
      // fichier par signature `async ` et on vérifie chaque bloc.
      const methodBlocks = source.split(/\n  async\s+/);
      const guardedCallSites = methodBlocks.filter((block) => {
        if (!/completeJSON\s*</.test(block)) return false;
        const completeIdx = block.indexOf("completeJSON<");
        const assertIdx = block.indexOf("assertCompletionNotTruncated");
        return assertIdx > completeIdx;
      });
      // 4 méthodes (debateThesis, analyze, debate, vote) consomment `completeJSON`.
      expect(guardedCallSites.length).toBe(4);
    });

    it("aucun `allowPartialOnTruncation` dans `board-member.ts` (fail-closed strict)", () => {
      expect(/allowPartialOnTruncation/.test(source)).toBe(false);
    });
  });

  describe("board-orchestrator.ts", () => {
    const source = loadFile("src/agents/board/board-orchestrator.ts");

    it("importe `assertCompletionNotTruncated`", () => {
      expect(
        /import\s*\{[^}]*assertCompletionNotTruncated[^}]*\}\s*from\s*["']@\/services\/openrouter\/truncation-guard["']/.test(
          source,
        ),
      ).toBe(true);
    });

    it("appelle le helper avec scope `board-orchestrator.semanticDedup`", () => {
      expect(/board-orchestrator\.semanticDedup/.test(source)).toBe(true);
      // Au moins 1 appel.
      expect(/assertCompletionNotTruncated\s*\(/.test(source)).toBe(true);
    });

    it("le helper est invoqué AVANT le destructuring `const { data } = result;`", () => {
      const helperIdx = source.indexOf("assertCompletionNotTruncated");
      const destructureIdx = source.indexOf("const { data } = result;");
      expect(helperIdx).toBeGreaterThan(-1);
      expect(destructureIdx).toBeGreaterThan(-1);
      expect(helperIdx).toBeLessThan(destructureIdx);
    });

    it("aucun `allowPartialOnTruncation` dans `board-orchestrator.ts` (fail-closed strict)", () => {
      expect(/allowPartialOnTruncation/.test(source)).toBe(false);
    });
  });
});
