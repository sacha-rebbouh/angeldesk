import { describe, expect, it } from "vitest";

import { ThesisExtractorOutputSchema } from "../schemas";

function makeValidOutput() {
  return {
    reformulated: "Une thèse claire",
    problem: "Un problème avéré",
    solution: "Une solution crédible",
    whyNow: "Une fenêtre de marché identifiable",
    moat: null,
    pathToExit: null,
    verdict: "favorable" as const,
    confidence: 72,
    loadBearing: [
      {
        id: "lb-1",
        statement: "Le canal d'acquisition direct reste performant",
        status: "declared" as const,
        impact: "Le payback CAC se dégrade sinon",
        validationPath: "Demander les cohortes d'acquisition récentes",
      },
    ],
    alerts: [
      {
        severity: "medium" as const,
        category: "assumption_fragile" as const,
        title: "Hypothèse encore fragile",
        detail: "Le payback CAC n'est pas encore démontré.",
      },
    ],
    ycLens: {
      framework: "yc" as const,
      availability: "evaluated" as const,
      verdict: "favorable" as const,
      confidence: 75,
      question: "PMF?",
      claims: [],
      failures: [],
      strengths: ["Quelques signaux de traction existent"],
      summary: "YC estime qu'un chemin crédible vers le PMF existe.",
    },
    thielLens: {
      framework: "thiel" as const,
      availability: "evaluated" as const,
      verdict: "contrasted" as const,
      confidence: 64,
      question: "Monopole?",
      claims: [],
      failures: ["La défensibilité doit encore être prouvée"],
      strengths: [],
      summary: "La proposition contrarian reste encore partielle.",
    },
    angelDeskLens: {
      framework: "angel-desk" as const,
      availability: "evaluated" as const,
      verdict: "favorable" as const,
      confidence: 68,
      question: "Capital privé?",
      claims: [],
      failures: [],
      strengths: ["Le ticket reste accessible"],
      summary: "Le fit investisseur reste cohérent.",
    },
    sourceDocumentIds: ["doc_1"],
    sourceHash: "hash_1",
  };
}

describe("ThesisExtractorOutputSchema", () => {
  it("accepts a fully valid normalized thesis output", () => {
    expect(ThesisExtractorOutputSchema.safeParse(makeValidOutput()).success).toBe(true);
  });

  it("defaults missing framework availability to evaluated for backward compatibility", () => {
    const parsed = ThesisExtractorOutputSchema.safeParse({
      ...makeValidOutput(),
      ycLens: {
        ...makeValidOutput().ycLens,
        availability: undefined,
      },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.ycLens.availability).toBe("evaluated");
  });

  it("rejects invalid framework availability", () => {
    const invalid = {
      ...makeValidOutput(),
      ycLens: {
        ...makeValidOutput().ycLens,
        availability: "unknown",
      },
    };

    const parsed = ThesisExtractorOutputSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["ycLens", "availability"]);
  });

  it("rejects malformed load-bearing items", () => {
    const parsed = ThesisExtractorOutputSchema.safeParse({
      ...makeValidOutput(),
      loadBearing: [{ id: "lb-1" }],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".").startsWith("loadBearing.0"))).toBe(true);
  });

  it("rejects malformed alerts and out-of-range confidence", () => {
    const parsed = ThesisExtractorOutputSchema.safeParse({
      ...makeValidOutput(),
      confidence: 999,
      alerts: [{ severity: "critical" }],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".") === "confidence")).toBe(true);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".").startsWith("alerts.0"))).toBe(true);
  });

  it("accepts nullish optional claim and alert references", () => {
    const parsed = ThesisExtractorOutputSchema.safeParse({
      ...makeValidOutput(),
      alerts: [
        {
          severity: "medium" as const,
          category: "assumption_fragile" as const,
          title: "Hypothèse encore fragile",
          detail: "Le payback CAC n'est pas encore démontré.",
          linkedAssumptionId: null,
          linkedClaim: null,
        },
      ],
      ycLens: {
        ...makeValidOutput().ycLens,
        claims: [
          {
            claim: "Les clients reviennent naturellement.",
            derivedFrom: "Deck retention slide",
            status: "partial" as const,
            evidence: null,
            concern: null,
          },
        ],
      },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.alerts[0]?.linkedAssumptionId).toBeNull();
    expect(parsed.data?.ycLens.claims[0]?.evidence).toBeNull();
  });
});
