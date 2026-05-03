import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/openrouter/client", () => ({
  openrouter: {},
}));

vi.mock("@/services/openrouter/router", () => ({
  completeJSON: vi.fn(),
  setAnalysisContext: vi.fn(),
  runWithLLMContext: vi.fn(),
}));

import { factExtractorAgent } from "../fact-extractor";

describe("FactExtractorAgent semantic guards", () => {
  it("rejects semantically invalid traction and currency-mismatched financial facts", () => {
    const result = (factExtractorAgent as unknown as {
      normalizeResponse: (
        data: {
          facts: Array<Record<string, unknown>>;
          contradictions: unknown[];
          extractionNotes: string[];
        },
        input: {
          documents: Array<{ id: string; type: "PITCH_DECK"; name: string; content: string }>;
          existingFacts: unknown[];
          founderResponses?: unknown[];
        },
        startTime: number
      ) => { facts: Array<{ factKey: string }>; metadata: { ignoredDetails: Array<{ factKey: string; reason: string }> } };
    }).normalizeResponse(
      {
        facts: [
          {
            factKey: "competition.competitor_count",
            category: "COMPETITION",
            value: 3,
            displayValue: "3",
            sourceDocumentId: "doc_1",
            sourceConfidence: 95,
            extractedText: "[Source] 3 competitors identified",
            reliability: "DECLARED",
            reliabilityReasoning: "Explicitly mentioned",
            isProjection: false,
          },
          {
            factKey: "traction.customers_count",
            category: "TRACTION",
            value: 4000,
            displayValue: "4,000 units",
            unit: "number",
            sourceDocumentId: "doc_1",
            sourceConfidence: 95,
            extractedText: "[Source] 4,000 sqm Storage Units",
            reliability: "DECLARED",
            reliabilityReasoning: "Explicitly mentioned",
            isProjection: false,
          },
          {
            factKey: "financial.revenue",
            category: "FINANCIAL",
            value: 241379,
            displayValue: "2.8M NOK",
            unit: "EUR",
            sourceDocumentId: "doc_1",
            sourceConfidence: 95,
            extractedText: "[Source] €2.8m Revenue (2026)",
            reliability: "PROJECTED",
            reliabilityReasoning: "Forward looking figure",
            isProjection: true,
          },
        ],
        contradictions: [],
        extractionNotes: [],
      },
      {
        documents: [
          {
            id: "doc_1",
            type: "PITCH_DECK",
            name: "deck.pdf",
            content: "content",
          },
        ],
        existingFacts: [],
      },
      Date.now()
    );

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.factKey).toBe("competition.competitors_count");
    expect(result.metadata.ignoredDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factKey: "traction.customers_count" }),
        expect.objectContaining({ factKey: "financial.revenue" }),
      ])
    );
  });
});
