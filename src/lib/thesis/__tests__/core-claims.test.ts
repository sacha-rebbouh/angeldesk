import { describe, expect, it } from "vitest";

import {
  assertValidStructuredClaims,
  repairStructuredClaims,
  renderStructuredClaims,
  ThesisCoreStructuredSchema,
  normalizeLoadBearingAssumptions,
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

  it("accepts recoverable model omissions before the repair layer runs", () => {
    const parsed = ThesisCoreStructuredSchema.safeParse({
      reformulatedClaims: [{ kind: "unknown", text: "Thèse indisponible." }],
      problemClaims: [
        {
          kind: "judgment",
          text: "Le problème est réel mais encore insuffisamment étayé.",
          supportingFactKeys: [],
        },
      ],
      solutionClaims: [
        {
          kind: "judgment",
          text: "La solution semble adaptée au segment visé.",
        },
      ],
      whyNowClaims: [{ kind: "unknown", text: "Le timing reste à vérifier." }],
      moatClaims: [],
      pathToExitClaims: [],
      loadBearing: [
        {
          statement: "La croissance commerciale peut rester efficace.",
          status: "declared",
          impact: "Le modèle perd son levier principal.",
          validationPath: "Demander les cohortes commerciales.",
        },
      ],
      alerts: [],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.problemClaims[0]).toMatchObject({
      kind: "judgment",
      supportingFactKeys: [],
    });
    expect(parsed.data.solutionClaims[0]).toMatchObject({
      kind: "judgment",
      supportingFactKeys: [],
    });
    expect(normalizeLoadBearingAssumptions(parsed.data.loadBearing)[0]?.id).toBe("lb-1");
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

  it("does not treat B2B, B2C, or B2B2C as numeric assertions", () => {
    expect(() =>
      assertValidStructuredClaims(
        {
          reformulated: [
            {
              kind: "judgment",
              text: "La société combine une distribution B2B et des usages B2B2C / B2BtoC.",
              supportingFactKeys: [],
            },
          ],
        },
        buildThesisFactScope([])
      )
    ).not.toThrow();
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

  it("removes residual numeric markers from unknown claims during repair", () => {
    const repaired = repairStructuredClaims(
      {
        reformulated: [],
        problem: [
          {
            kind: "unknown",
            text: "ROI x16, croissance 98%, ticket €500k et expansion 2026 restent à vérifier.",
          },
        ],
        solution: [],
        whyNow: [],
        moat: [],
        pathToExit: [],
      },
      buildThesisFactScope([])
    );

    expect(repaired.problem[0]).toMatchObject({
      kind: "unknown",
      text: "ROI, croissance, ticket et expansion restent à vérifier.",
    });
    expect(() => assertValidStructuredClaims(repaired, buildThesisFactScope([]))).not.toThrow();
  });

  it("falls back when direct_fact framing remains numeric after stripping", () => {
    const scope = buildThesisFactScope([
      makeFact({
        factKey: "market.geography_primary",
        category: "MARKET",
        currentValue: "France",
        currentDisplayValue: "France",
      }),
    ]);

    const repaired = repairStructuredClaims(
      {
        reformulated: [
          {
            kind: "direct_fact",
            factKey: "market.geography_primary",
            framing: "3.0 x",
          },
        ],
        problem: [],
        solution: [],
        whyNow: [],
        moat: [],
        pathToExit: [],
      },
      scope
    );

    expect(repaired.reformulated[0]).toMatchObject({
      kind: "direct_fact",
      factKey: "market.geography_primary",
      framing: "Selon les faits validés:",
    });
    expect(() => assertValidStructuredClaims(repaired, scope)).not.toThrow();
  });

  it("downgrades direct_fact references missing from the scoped facts to unknown", () => {
    const scope = buildThesisFactScope([
      makeFact({
        factKey: "market.geography_primary",
        category: "MARKET",
        currentValue: "France",
        currentDisplayValue: "France",
      }),
    ]);

    const repaired = repairStructuredClaims(
      {
        reformulated: [
          {
            kind: "direct_fact",
            factKey: "financial.amount_raising",
            framing: "L'operation recherche 500k EUR.",
          },
        ],
        problem: [],
        solution: [],
        whyNow: [],
        moat: [],
        pathToExit: [],
      },
      scope
    );

    expect(repaired.reformulated[0]).toEqual({
      kind: "unknown",
      text: "L'operation recherche.",
    });
    expect(() => assertValidStructuredClaims(repaired, scope)).not.toThrow();
  });

  it("downgrades unavailable derived_metric claims to unknown before validation", () => {
    const scope = buildThesisFactScope([
      makeFact({
        factKey: "financial.revenue",
        category: "FINANCIAL",
        currentValue: 1_000_000,
        currentDisplayValue: "1M EUR",
        currentUnit: "EUR",
      }),
    ]);

    const repaired = repairStructuredClaims(
      {
        reformulated: [
          {
            kind: "derived_metric",
            metricKey: "ebitda_margin",
            framing: "La societe affiche 12% de marge EBITDA.",
          },
        ],
        problem: [],
        solution: [],
        whyNow: [],
        moat: [],
        pathToExit: [],
      },
      scope
    );

    expect(repaired.reformulated[0]).toEqual({
      kind: "unknown",
      text: "Information insuffisamment documentée.",
    });
    expect(() => assertValidStructuredClaims(repaired, scope)).not.toThrow();
  });

  it("strips numeric assertions from direct facts inferred from judgment claims", () => {
    const scope = buildThesisFactScope([
      makeFact({
        factKey: "company.name",
        category: "OTHER",
        currentValue: "Avekapeti",
        currentDisplayValue: "Avekapeti",
      }),
    ]);

    const repaired = repairStructuredClaims(
      {
        reformulated: [
          {
            kind: "judgment",
            text: "Avekapeti vise un leadership avec 3 marchés prioritaires.",
            supportingFactKeys: ["company.name"],
          },
        ],
        problem: [],
        solution: [],
        whyNow: [],
        moat: [],
        pathToExit: [],
      },
      scope
    );

    expect(repaired.reformulated[0]).toMatchObject({
      kind: "direct_fact",
      factKey: "company.name",
      framing: "vise un leadership avec marchés prioritaires.",
    });
    expect(() => assertValidStructuredClaims(repaired, scope)).not.toThrow();
  });
});
