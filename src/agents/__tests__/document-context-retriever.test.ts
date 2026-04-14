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
});
