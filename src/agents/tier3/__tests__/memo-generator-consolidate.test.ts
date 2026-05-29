/**
 * Tests `consolidateRedFlags` (privé) du Memo Generator après bascule sur la
 * consolidation canonique partagée (`consolidateRedFlagsFromAgents`).
 *
 * Verrouille deux invariants :
 *  1. Dédup par TOPIC (`inferRedFlagTopic`) — deux red flags "valuation" formulés
 *     différemment par deux agents → 1 seul (l'ancienne dédup par préfixe de titre
 *     en laissait 2).
 *  2. Non-régression d'ingestion : les `findings.structuralRisks` du Devil's
 *     Advocate restent ingérés (pas seulement `data.redFlags`).
 */

import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = "test-stub-key-not-used-runtime";
  }
});

import { memoGenerator } from "../memo-generator";
import type { EnrichedAgentContext } from "../../types";

type RF = { id: string; category: string; severity: string; title: string; source: string };
type ConsolidateFn = (context: EnrichedAgentContext) => RF[];
const consolidateRedFlags = (
  memoGenerator as unknown as { consolidateRedFlags: ConsolidateFn }
).consolidateRedFlags.bind(memoGenerator);

function ctx(previousResults: Record<string, unknown>): EnrichedAgentContext {
  return { previousResults } as unknown as EnrichedAgentContext;
}

describe("memo consolidateRedFlags — dédup par topic + ingestion multi-source", () => {
  it("fusionne deux red flags 'valuation' formulés différemment (2 agents) en 1 seul", () => {
    const result = consolidateRedFlags(
      ctx({
        "financial-auditor": {
          success: true,
          data: {
            redFlags: [
              { severity: "HIGH", title: "Valorisation agressive 30% au-dessus du marché", category: "financials" },
            ],
          },
        },
        "cap-table-auditor": {
          success: true,
          data: {
            redFlags: [
              { severity: "CRITICAL", title: "Valorisation excessive vs comparables", category: "financials" },
            ],
          },
        },
      }),
    );

    const valuationFlags = result.filter((rf) => rf.title.toLowerCase().includes("valorisation"));
    expect(valuationFlags).toHaveLength(1); // dédup par topic (vs 2 avec l'ancien préfixe de titre)
    // domain authority "valuation" = financial-auditor → sa sévérité (HIGH) fait foi (pas le max aveugle CRITICAL)
    expect(valuationFlags[0].severity).toBe("HIGH");
    // les deux agents détecteurs sont tracés dans la source
    expect(valuationFlags[0].source).toContain("financial-auditor");
    expect(valuationFlags[0].source).toContain("cap-table-auditor");
  });

  it("ingère les structuralRisks du Devil's Advocate (non-régression vs data.redFlags seul)", () => {
    const result = consolidateRedFlags(
      ctx({
        "devils-advocate": {
          success: true,
          data: {
            findings: {
              structuralRisks: [
                { severity: "CRITICAL", description: "Dépendance vitale à un fournisseur unique" },
              ],
            },
          },
        },
      }),
    );

    const daRisk = result.find((rf) => rf.title.includes("fournisseur unique"));
    expect(daRisk).toBeDefined();
    expect(daRisk?.severity).toBe("CRITICAL");
  });
});
