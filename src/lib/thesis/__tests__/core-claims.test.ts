import { describe, expect, it } from "vitest";

import {
  assertValidStructuredClaims,
  repairStructuredClaims,
  renderStructuredClaims,
  ThesisCoreStructuredSchema,
  type ThesisCoreClaim,
} from "../core-claims";
import { buildThesisFactScope } from "../fact-scope";
import type { CurrentFact } from "@/services/fact-store/types";

function makeFact(overrides: Partial<CurrentFact> & Pick<CurrentFact, "factKey" | "category" | "currentValue" | "currentDisplayValue">): CurrentFact {
  return {
    dealId: "deal_1",
    factKey: overrides.factKey,
    category: overrides.category,
    currentValue: overrides.currentValue,
    currentDisplayValue: overrides.currentDisplayValue,
    currentUnit: overrides.currentUnit,
    currentExtractedText: overrides.currentExtractedText,
    currentSource: overrides.currentSource ?? "PITCH_DECK",
    currentSourceDocumentId: overrides.currentSourceDocumentId,
    currentConfidence: overrides.currentConfidence ?? 92,
    currentTruthConfidence: overrides.currentTruthConfidence,
    isDisputed: false,
    eventHistory: [],
    firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    lastUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
    reliability: overrides.reliability,
    sourceMetadata: overrides.sourceMetadata,
    validAt: overrides.validAt,
    periodType: overrides.periodType,
    periodLabel: overrides.periodLabel,
  };
}

describe("ThesisCoreStructuredSchema", () => {
  it("unwraps a wrapped thesis payload under thesis", () => {
    const parsed = ThesisCoreStructuredSchema.safeParse({
      thesis: {
        reformulatedClaims: [{ kind: "unknown", text: "Thèse indisponible." }],
        problemClaims: [{ kind: "unknown", text: "Problème indisponible." }],
        solutionClaims: [{ kind: "unknown", text: "Solution indisponible." }],
        whyNowClaims: [{ kind: "unknown", text: "Why-now indisponible." }],
        moatClaims: [],
        pathToExitClaims: [],
        loadBearing: [],
        alerts: [],
      },
    });

    expect(parsed.success).toBe(true);
  });
});

describe("structured core thesis claims", () => {
  it("renders direct_fact and judgment claims from validated scope only", () => {
    const scope = buildThesisFactScope([
      makeFact({
        factKey: "financial.amount_raising",
        category: "FINANCIAL",
        currentValue: 36_000_000,
        currentDisplayValue: "36M EUR",
        currentUnit: "EUR",
        reliability: {
          reliability: "DECLARED",
          reasoning: "deck stated",
          isProjection: false,
        },
      }),
    ]);

    const claims: ThesisCoreClaim[] = [
      {
        kind: "direct_fact",
        factKey: "financial.amount_raising",
        framing: "L'operation recherche un ticket de",
      },
      {
        kind: "judgment",
        text: "La thèse repose sur une opération de prise de contrôle majoritaire.",
        supportingFactKeys: ["financial.amount_raising"],
      },
    ];

    expect(() =>
      assertValidStructuredClaims({ reformulated: claims }, scope)
    ).not.toThrow();
    expect(renderStructuredClaims(claims, scope)).toContain("36M EUR");
    expect(renderStructuredClaims(claims, scope)).toContain("déclaré, non vérifié");
  });

  it("rejects direct_fact framing containing a hard-coded number", () => {
    const scope = buildThesisFactScope([
      makeFact({
        factKey: "financial.amount_raising",
        category: "FINANCIAL",
        currentValue: 36_000_000,
        currentDisplayValue: "36M EUR",
      }),
    ]);

    expect(() =>
      assertValidStructuredClaims(
        {
          reformulated: [
            {
              kind: "direct_fact",
              factKey: "financial.amount_raising",
              framing: "L'operation recherche 36M EUR de ticket",
            },
          ],
        },
        scope
      )
    ).toThrow("direct_fact framing must not contain numeric assertions");
  });

  it("repairs numeric judgment and unknown claims into valid structured claims", () => {
    const scope = buildThesisFactScope([
      makeFact({
        factKey: "market.tam",
        category: "MARKET",
        currentValue: 183_000_000,
        currentDisplayValue: "183M EUR",
        currentUnit: "EUR",
      }),
      makeFact({
        factKey: "team.size",
        category: "TEAM",
        currentValue: 4,
        currentDisplayValue: "4 FTEs",
      }),
    ]);

    const repaired = repairStructuredClaims(
      {
        reformulated: [
          {
            kind: "judgment",
            text: "La société vise une valorisation de sortie de 183M EUR.",
            supportingFactKeys: ["market.tam"],
          },
        ],
        problem: [{ kind: "unknown", text: "Le marché compte 6 acteurs." }],
        solution: [],
        whyNow: [],
        moat: [
          {
            kind: "judgment",
            text: "L'équipe opère déjà avec 4 FTEs.",
            supportingFactKeys: ["team.size"],
          },
        ],
        pathToExit: [],
      },
      scope
    );

    expect(repaired.reformulated[0]).toMatchObject({
      kind: "direct_fact",
      factKey: "market.tam",
    });
    expect(repaired.problem[0]).toMatchObject({
      kind: "unknown",
    });
    expect(repaired.problem[0]).not.toHaveProperty("supportingFactKeys");
    expect(repaired.moat[0]).toMatchObject({
      kind: "direct_fact",
      factKey: "team.size",
    });
    expect(() => assertValidStructuredClaims(repaired, scope)).not.toThrow();
  });
});
