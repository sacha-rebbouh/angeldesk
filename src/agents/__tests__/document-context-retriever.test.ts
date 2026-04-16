import { describe, expect, it } from "vitest";

import {
  formatRetrievedDocumentWindows,
  splitDocumentWindows,
} from "../document-context-retriever";

const baseDoc = {
  id: "doc_1",
  name: "Norway deck.pdf",
  type: "PITCH_DECK",
  uploadedAt: new Date("2026-01-01"),
};

describe("document-context-retriever", () => {
  it("splits PDF page markers and retrieves agent-relevant windows under budget", () => {
    const extractedText = [
      "[Page 1 - Native PDF text]\nCover page",
      "[Page 2 - Native PDF text]\nTeam founder CEO CTO LinkedIn headcount",
      "[Page 15 - Supreme OCR]\nOperating margin chart revenue ARR NRI growth table | 2024 | 2025 | 9.9%",
      "[Page 57 - Supreme OCR retry]\nCap table valuation dilution SAFE pro rata liquidation preference",
    ].join("\n\n");

    const windows = splitDocumentWindows(extractedText);
    expect(windows).toHaveLength(4);

    const financial = formatRetrievedDocumentWindows(
      { ...baseDoc, extractedText },
      "financial-auditor",
      { maxChars: 260, maxWindows: 2 }
    );

    expect(financial.totalWindows).toBe(4);
    expect(financial.text).toContain("Page 15");
    expect(financial.text).toContain("revenue ARR");
    expect(financial.text).toContain("RETRIEVAL:");
    expect(financial.text.length).toBeLessThan(520);
  });

  it("keeps slide and sheet structures available for specialized agents", () => {
    const extractedText = [
      "--- Slide 1 ---\nProduct roadmap and customer workflow",
      "--- Slide 2 ---\n[Aucun texte natif extrait]",
      "=== FEUILLE: Summary ===\nR1: Metric | 2024 | 2025\nR2: Revenue | 100 | 220 [C2=A2+B2]",
    ].join("\n\n");

    expect(splitDocumentWindows(extractedText)).toHaveLength(3);

    const product = formatRetrievedDocumentWindows(
      { ...baseDoc, type: "PRODUCT_DEMO", extractedText },
      "product-analyst",
      { maxChars: 800, maxWindows: 5 }
    );

    expect(product.totalWindows).toBe(1);
    expect(product.text).toContain("Slide 1");
    expect(product.text).toContain("FEUILLE: Summary");
    expect(product.omittedWindows).toBe(0);
  });

  it("prefers strict extraction artifacts over flat text when available", () => {
    const retrieved = formatRetrievedDocumentWindows(
      {
        ...baseDoc,
        extractedText: "Flat text without the chart values.",
        extractionRuns: [{
          id: "run_1",
          status: "READY_WITH_WARNINGS",
          readyForAnalysis: true,
          corpusTextHash: "hash_1",
          pages: [{
            pageNumber: 15,
            status: "READY_WITH_WARNINGS",
            method: "HYBRID",
            charCount: 1200,
            wordCount: 140,
            qualityScore: 82,
            hasTables: true,
            hasCharts: true,
            hasFinancialKeywords: true,
            hasTeamKeywords: false,
            hasMarketKeywords: true,
            textPreview: "visual preview",
            artifact: {
              version: "document-page-artifact-v1",
              pageNumber: 15,
              text: "Operating margins and NRI growth.",
              visualBlocks: [],
              tables: [{
                title: "Operating margins",
                rows: [
                  ["Sector", "Margin"],
                  ["Self-storage", "75%"],
                ],
                confidence: "high",
              }],
              charts: [{
                title: "NRI growth",
                chartType: "bar",
                description: "Top 30 markets growth by year.",
                values: [{ label: "2021", value: "9.9%" }],
                confidence: "high",
              }],
              unreadableRegions: [],
              numericClaims: [{ label: "2021", value: "9.9%", unit: "%", sourceText: "2021 9.9%", confidence: "high" }],
              confidence: "high",
              needsHumanReview: false,
            },
          }],
        }],
      },
      "financial-auditor",
      { maxChars: 1000, maxWindows: 2 }
    );

    expect(retrieved.text).toContain("Artifact page 15");
    expect(retrieved.text).toContain("Operating margins");
    expect(retrieved.text).toContain("Self-storage | 75%");
    expect(retrieved.text).toContain("2021=9.9%");
    expect(retrieved.text).toContain("artefacts");
  });
});
