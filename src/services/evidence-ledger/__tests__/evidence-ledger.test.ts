import { describe, expect, it } from "vitest";

import {
  buildEvidenceLedgerFromContext,
  formatEvidenceLedgerForPrompt,
} from "../index";
import type { EnrichedAgentContext } from "@/agents/types";

describe("evidence ledger", () => {
  it("summarizes facts, document artifacts, extraction warnings and source health", () => {
    const context = {
      dealId: "deal_1",
      deal: { id: "deal_1", name: "Pithos" },
      factStore: [
        {
          dealId: "deal_1",
          factKey: "financial.arr",
          category: "FINANCIAL",
          currentValue: 1200000,
          currentDisplayValue: "1.2M EUR",
          currentSource: "PITCH_DECK",
          currentConfidence: 82,
          isDisputed: false,
          eventHistory: [],
          firstSeenAt: new Date(),
          lastUpdatedAt: new Date(),
          reliability: {
            reliability: "DECLARED",
            reasoning: "Deck claim",
            isProjection: false,
          },
        },
      ],
      documents: [
        {
          id: "doc_1",
          name: "Deck.pdf",
          type: "PITCH_DECK",
          extractionRuns: [
            {
              id: "run_1",
              status: "READY_WITH_WARNINGS",
              readyForAnalysis: true,
              pages: [
                {
                  pageNumber: 15,
                  status: "NEEDS_REVIEW",
                  method: "HYBRID",
                  charCount: 1000,
                  wordCount: 140,
                  qualityScore: 45,
                  hasTables: true,
                  hasCharts: true,
                  hasFinancialKeywords: true,
                  hasTeamKeywords: false,
                  hasMarketKeywords: true,
                  artifact: {
                    version: "document-page-artifact-v1",
                    pageNumber: 15,
                    text: "Revenue chart",
                    visualBlocks: [{ type: "chart", description: "Chart", confidence: "medium" }],
                    tables: [],
                    charts: [],
                    numericClaims: [],
                    unreadableRegions: [{ reason: "chart values missing", severity: "medium" }],
                    confidence: "medium",
                    needsHumanReview: true,
                  },
                },
              ],
            },
          ],
        },
      ],
      contextEngine: {
        sourceHealth: {
          totalConfigured: 2,
          successful: 1,
          failed: [{ name: "Perplexity", severity: "high", error: "timeout" }],
          unconfiguredCritical: [],
        },
      },
    } as unknown as EnrichedAgentContext;

    const ledger = buildEvidenceLedgerFromContext(context);
    const prompt = formatEvidenceLedgerForPrompt(ledger);

    expect(ledger.coverage.factCount).toBe(1);
    expect(ledger.coverage.documentArtifactCount).toBe(1);
    expect(ledger.coverage.visualArtifactCount).toBe(1);
    expect(ledger.coverage.extractionWarningCount).toBe(1);
    expect(ledger.coverage.externalSourceIssueCount).toBe(1);
    expect(prompt).toContain("EVIDENCE LEDGER");
    expect(prompt).toContain("financial.arr");
    expect(prompt).toContain("chart values missing");
    expect(prompt).toContain("Perplexity");
  });
});
