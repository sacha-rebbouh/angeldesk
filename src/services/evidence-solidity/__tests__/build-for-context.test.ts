/**
 * Phase A slice A6 round 2 — Tests `buildEvidenceSolidityForContext`.
 *
 * Couvre :
 * 1. Contexte sans ledger MAIS avec contradictions critiques → contradictory
 *    (anti-régression round 2 Codex : les contradictions sont autonomes).
 * 2. Contexte sans ledger ET sans contradictions exploitables → null
 *    (préserve la backward compat tests transform Tier 3).
 * 3. Contexte avec ledger + coverage insufficient → insufficient.
 * 4. Contexte avec selfContradictionsOverride (CD self-flow) → contradictory.
 * 5. Override ignoré si pas de contradictions exploitables → tombe sur ledger
 *    si présent.
 */
import { describe, it, expect } from "vitest";
import { buildEvidenceSolidityForContext } from "../index";
import type { EnrichedAgentContext } from "@/agents/types";

function makeContext(overrides: Partial<EnrichedAgentContext> = {}): EnrichedAgentContext {
  return {
    previousResults: {},
    baPreferences: {},
    ...overrides,
  } as unknown as EnrichedAgentContext;
}

function makeContradictionDetectorResult(criticalCount: number, highCount: number) {
  const contradictions = [
    ...Array.from({ length: criticalCount }, (_, i) => ({ id: `c-crit-${i}`, severity: "CRITICAL" as const })),
    ...Array.from({ length: highCount }, (_, i) => ({ id: `c-high-${i}`, severity: "HIGH" as const })),
  ];
  return {
    agentName: "contradiction-detector",
    success: true as const,
    executionTimeMs: 100,
    cost: 0.01,
    data: { findings: { contradictions } },
  };
}

describe("Phase A A6 round 2 — buildEvidenceSolidityForContext", () => {
  describe("Anti-régression round 2 Codex : contradictions autonomes (ledger absent)", () => {
    it("Contexte SANS ledger + 2 contradictions CRITICAL → contradictory", () => {
      const context = makeContext({
        previousResults: {
          "contradiction-detector": makeContradictionDetectorResult(2, 0),
        },
      });
      const result = buildEvidenceSolidityForContext(context);
      expect(result.value).toBe("contradictory");
      expect(result.rationale).toBeTruthy();
      expect(result.rationale).toContain("2 contradictions CRITICAL");
    });

    it("Contexte SANS ledger + 1 CRITICAL + 2 HIGH → contradictory", () => {
      const context = makeContext({
        previousResults: {
          "contradiction-detector": makeContradictionDetectorResult(1, 2),
        },
      });
      const result = buildEvidenceSolidityForContext(context);
      expect(result.value).toBe("contradictory");
    });

    it("Contexte SANS ledger + 1 CRITICAL seule → null (pas contradictory)", () => {
      const context = makeContext({
        previousResults: {
          "contradiction-detector": makeContradictionDetectorResult(1, 1),
        },
      });
      const result = buildEvidenceSolidityForContext(context);
      expect(result.value).toBeNull();
    });
  });

  describe("Préservation backward compat : ledger absent + pas de contradictions → null", () => {
    it("Contexte minimal (pas de ledger, pas de previousResults) → null", () => {
      const context = makeContext();
      const result = buildEvidenceSolidityForContext(context);
      expect(result.value).toBeNull();
      expect(result.rationale).toBeNull();
    });

    it("Contexte avec contradiction-detector vide + pas de ledger → null", () => {
      const context = makeContext({
        previousResults: {
          "contradiction-detector": makeContradictionDetectorResult(0, 0),
        },
      });
      const result = buildEvidenceSolidityForContext(context);
      expect(result.value).toBeNull();
    });
  });

  describe("Avec ledger présent : règles compute appliquées", () => {
    it("Ledger avec coverage 0 facts/0 artifacts → insufficient", () => {
      const context = makeContext({
        evidenceLedger: {
          generatedAt: new Date().toISOString(),
          coverage: {
            factCount: 0,
            documentArtifactCount: 0,
            visualArtifactCount: 0,
            numericClaimCount: 0,
            extractionWarningCount: 0,
            externalSourceIssueCount: 0,
            lowReliabilityFactCount: 0,
          },
          items: [],
          warnings: [],
        },
      } as unknown as Partial<EnrichedAgentContext>);
      const result = buildEvidenceSolidityForContext(context);
      expect(result.value).toBe("insufficient");
      expect(result.rationale).toContain("Aucun fact extrait");
    });

    it("Ledger avec tous les facts en low reliability → insufficient", () => {
      const context = makeContext({
        evidenceLedger: {
          generatedAt: new Date().toISOString(),
          coverage: {
            factCount: 5,
            documentArtifactCount: 2,
            visualArtifactCount: 0,
            numericClaimCount: 0,
            extractionWarningCount: 0,
            externalSourceIssueCount: 0,
            lowReliabilityFactCount: 5, // tous low
          },
          items: [],
          warnings: [],
        },
      } as unknown as Partial<EnrichedAgentContext>);
      const result = buildEvidenceSolidityForContext(context);
      expect(result.value).toBe("insufficient");
      expect(result.rationale).toContain("Tous les facts disponibles (5)");
    });

    it("Ledger avec coverage saine → null (pas qualifiable en A6)", () => {
      const context = makeContext({
        evidenceLedger: {
          generatedAt: new Date().toISOString(),
          coverage: {
            factCount: 10,
            documentArtifactCount: 5,
            visualArtifactCount: 0,
            numericClaimCount: 0,
            extractionWarningCount: 1,
            externalSourceIssueCount: 0,
            lowReliabilityFactCount: 2,
          },
          items: [],
          warnings: [],
        },
      } as unknown as Partial<EnrichedAgentContext>);
      const result = buildEvidenceSolidityForContext(context);
      expect(result.value).toBeNull();
    });

    it("Ledger sain + contradictions critiques → contradictory (prend précédence)", () => {
      const context = makeContext({
        previousResults: {
          "contradiction-detector": makeContradictionDetectorResult(3, 0),
        },
        evidenceLedger: {
          generatedAt: new Date().toISOString(),
          coverage: {
            factCount: 10,
            documentArtifactCount: 5,
            visualArtifactCount: 0,
            numericClaimCount: 0,
            extractionWarningCount: 0,
            externalSourceIssueCount: 0,
            lowReliabilityFactCount: 0,
          },
          items: [],
          warnings: [],
        },
      } as unknown as Partial<EnrichedAgentContext>);
      const result = buildEvidenceSolidityForContext(context);
      expect(result.value).toBe("contradictory");
    });
  });

  describe("selfContradictionsOverride (CD self-flow)", () => {
    it("Override fourni avec 2 CRITICAL + ledger absent → contradictory (sans lire previousResults)", () => {
      const context = makeContext({
        // previousResults vide intentionnellement : CD utilise override
        previousResults: {},
      });
      const result = buildEvidenceSolidityForContext(context, {
        selfContradictionsOverride: { critical: 2, high: 0 },
      });
      expect(result.value).toBe("contradictory");
    });

    it("Override fourni avec 0 CRITICAL + 5 HIGH → null (pas contradictory en A6, le pivot est CRITICAL)", () => {
      const context = makeContext();
      const result = buildEvidenceSolidityForContext(context, {
        selfContradictionsOverride: { critical: 0, high: 5 },
      });
      expect(result.value).toBeNull();
    });

    it("Override 1 CRITICAL + 2 HIGH → contradictory", () => {
      const context = makeContext();
      const result = buildEvidenceSolidityForContext(context, {
        selfContradictionsOverride: { critical: 1, high: 2 },
      });
      expect(result.value).toBe("contradictory");
    });

    it("Override override les counts de previousResults (CD ne se lit pas lui-même)", () => {
      // previousResults["contradiction-detector"] avec 0 contradictions,
      // mais override avec 3 → contradictory (override prend précédence).
      const context = makeContext({
        previousResults: {
          "contradiction-detector": makeContradictionDetectorResult(0, 0),
        },
      });
      const result = buildEvidenceSolidityForContext(context, {
        selfContradictionsOverride: { critical: 3, high: 0 },
      });
      expect(result.value).toBe("contradictory");
    });
  });
});
