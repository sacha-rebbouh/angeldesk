import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  encryptText,
  encryptJsonField,
  isEncryptedJsonField,
  safeDecrypt,
  safeDecryptJsonField,
} from "@/lib/encryption";
import { encryptExtractionPagePayload, getBlockingPageNumbersFromStoredPages } from "../extraction-runs";

// Phase 3 non-regression test bed. The invariant is:
//   1. Anything we WRITE via `encryptExtractionPagePayload` must be physically
//      encrypted in the DB column (no raw corpus material survives).
//   2. Anything we READ via `safeDecryptJsonField` / `safeDecrypt` must round-
//      trip to the original payload — regardless of whether the row was
//      written with the new envelope or carries a legacy plaintext value.
//   3. Downstream logic that consumes `page.artifact` (blocking decisions,
//      audit dialog, agent context) must produce IDENTICAL output for legacy
//      vs encrypted rows.

const TEST_KEY = "b".repeat(64);

beforeAll(() => {
  vi.stubEnv("DOCUMENT_ENCRYPTION_KEY", TEST_KEY);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const REALISTIC_ARTIFACT = {
  version: "document-page-artifact-v2",
  pageNumber: 3,
  text:
    "Pithos — Series A pitch.\n" +
    "ARR €1.2M, MoM growth 18%, burn €120k/mois, runway 14 months.",
  visualBlocks: [
    { type: "table", title: "Financials Q1", description: "Q1 P&L", confidence: "high" },
    { type: "chart", title: "Growth curve", description: "MoM growth chart", confidence: "medium" },
  ],
  tables: [
    {
      title: "P&L",
      markdown: "| Revenue | 1.2M |\n| EBITDA | -200k |",
      rows: [["Revenue", "1.2M"], ["EBITDA", "-200k"]],
      confidence: "high",
    },
  ],
  charts: [
    {
      title: "Growth",
      description: "Monthly recurring revenue trending up 18% MoM",
      chartType: "line",
      series: ["MRR"],
      values: [{ label: "Q1", value: "+12%" }, { label: "Q2", value: "+18%" }],
      confidence: "medium",
    },
  ],
  unreadableRegions: [],
  numericClaims: [
    { label: "ARR", value: "1.2M", unit: "€", sourceText: "ARR €1.2M", confidence: "high" },
    { label: "MoM growth", value: "18", unit: "%", sourceText: "MoM growth 18%", confidence: "high" },
    { label: "Burn", value: "120k", unit: "€", sourceText: "burn €120k/mois", confidence: "high" },
    { label: "Runway", value: "14", unit: "months", sourceText: "runway 14 months", confidence: "medium" },
  ],
  confidence: "high",
  needsHumanReview: false,
  ocrMode: "high_fidelity",
  sourceHash: "abc123",
};

const REALISTIC_TEXT_PREVIEW = REALISTIC_ARTIFACT.text.slice(0, 300);

describe("Phase 3 — encryptExtractionPagePayload writes an opaque envelope", () => {
  it("ciphertext does NOT contain any raw corpus substring", () => {
    const stored = encryptExtractionPagePayload({
      artifact: REALISTIC_ARTIFACT,
      textPreview: REALISTIC_TEXT_PREVIEW,
    });

    expect(isEncryptedJsonField(stored.artifact)).toBe(true);
    const ciphertextBlob = JSON.stringify(stored.artifact) + (stored.textPreview ?? "");

    // The audit gate: no raw corpus material may survive in the persisted
    // form. We probe a handful of strings that would identify a leak.
    for (const needle of [
      "ARR €1.2M",
      "Pithos",
      "1.2M",
      "P&L",
      "MoM growth 18%",
      "Runway",
      "Monthly recurring revenue",
    ]) {
      expect(ciphertextBlob).not.toContain(needle);
    }
  });

  it("encrypts textPreview when present and leaves it null otherwise", () => {
    const withPreview = encryptExtractionPagePayload({
      artifact: REALISTIC_ARTIFACT,
      textPreview: REALISTIC_TEXT_PREVIEW,
    });
    expect(withPreview.textPreview).not.toBe(REALISTIC_TEXT_PREVIEW);
    expect(safeDecrypt(withPreview.textPreview!)).toBe(REALISTIC_TEXT_PREVIEW);

    const withoutPreview = encryptExtractionPagePayload({
      artifact: REALISTIC_ARTIFACT,
      textPreview: null,
    });
    expect(withoutPreview.textPreview).toBeNull();
  });
});

describe("Phase 3 — safeDecryptJsonField round-trips encrypted rows", () => {
  it("decrypts artifact written by encryptExtractionPagePayload back to the exact payload", () => {
    const stored = encryptExtractionPagePayload({
      artifact: REALISTIC_ARTIFACT,
      textPreview: REALISTIC_TEXT_PREVIEW,
    });

    const readback = safeDecryptJsonField(stored.artifact);
    expect(readback).toEqual(REALISTIC_ARTIFACT);
  });

  it("decrypts textPreview written via the wrapper back to the original string", () => {
    const stored = encryptExtractionPagePayload({
      artifact: REALISTIC_ARTIFACT,
      textPreview: REALISTIC_TEXT_PREVIEW,
    });
    expect(stored.textPreview).not.toBeNull();
    expect(safeDecrypt(stored.textPreview!)).toBe(REALISTIC_TEXT_PREVIEW);
  });
});

describe("Phase 3 — LEGACY plaintext rows keep working without a migration", () => {
  it("safeDecryptJsonField returns a legacy plaintext artifact verbatim", () => {
    // A row written before Phase 3 — artifact is the plain DocumentPageArtifact
    // object, not an envelope. The reader must treat it as already-plaintext.
    expect(isEncryptedJsonField(REALISTIC_ARTIFACT)).toBe(false);
    expect(safeDecryptJsonField(REALISTIC_ARTIFACT)).toBe(REALISTIC_ARTIFACT);
  });

  it("safeDecrypt returns a legacy plaintext textPreview verbatim", () => {
    expect(safeDecrypt(REALISTIC_TEXT_PREVIEW)).toBe(REALISTIC_TEXT_PREVIEW);
  });

  it("encrypted-then-decrypted = legacy-as-is for the SAME logical payload", () => {
    const fromEnvelope = safeDecryptJsonField(
      encryptJsonField(REALISTIC_ARTIFACT)
    );
    const fromLegacy = safeDecryptJsonField(REALISTIC_ARTIFACT);
    expect(fromEnvelope).toEqual(fromLegacy);
  });
});

describe("Phase 3 — blocking decision is identical for legacy and encrypted rows", () => {
  // The blocking logic is the highest-leverage downstream consumer of
  // `artifact.semanticAssessment`. If decryption is wrong here, the audit
  // dialog will surface different "needs review" pages depending on whether
  // a row was migrated or not — an unacceptable behavior regression.

  const semanticAssessment = {
    semanticSufficiency: "insufficient",
    shouldBlockIfStructureMissing: true,
    canDegradeToWarning: false,
    analyticalValueScore: 80,
  };
  const artifactWithBlockingSignal = {
    ...REALISTIC_ARTIFACT,
    semanticAssessment,
  };

  function buildPageRow(artifactValue: unknown) {
    return {
      pageNumber: 3,
      status: "READY_WITH_WARNINGS" as const,
      charCount: 1200,
      qualityScore: 70,
      hasTables: true,
      hasCharts: true,
      hasFinancialKeywords: true,
      hasMarketKeywords: false,
      hasTeamKeywords: false,
      errorMessage: null,
      artifact: artifactValue,
      ocrProcessed: true,
    };
  }

  it("returns the same blocking page numbers whether artifact is encrypted or plaintext", () => {
    const encryptedRow = buildPageRow(encryptJsonField(artifactWithBlockingSignal));
    const legacyRow = buildPageRow(artifactWithBlockingSignal);

    const fromEncrypted = getBlockingPageNumbersFromStoredPages([encryptedRow]);
    const fromLegacy = getBlockingPageNumbersFromStoredPages([legacyRow]);

    expect(fromEncrypted).toEqual(fromLegacy);
  });

  it("an artifact without a blocking semantic signal is NOT blocked, in both formats", () => {
    const benign = { ...REALISTIC_ARTIFACT };
    const encryptedRow = buildPageRow(encryptJsonField(benign));
    const legacyRow = buildPageRow(benign);

    expect(getBlockingPageNumbersFromStoredPages([encryptedRow])).toEqual([]);
    expect(getBlockingPageNumbersFromStoredPages([legacyRow])).toEqual([]);
  });
});

describe("Phase 3 — claims structurés survive the round-trip with exact equality", () => {
  it("preserves tables / charts / numericClaims byte-for-byte", () => {
    const stored = encryptExtractionPagePayload({
      artifact: REALISTIC_ARTIFACT,
      textPreview: REALISTIC_TEXT_PREVIEW,
    });
    const readback = safeDecryptJsonField<typeof REALISTIC_ARTIFACT>(stored.artifact)!;

    expect(readback.tables).toEqual(REALISTIC_ARTIFACT.tables);
    expect(readback.charts).toEqual(REALISTIC_ARTIFACT.charts);
    expect(readback.numericClaims).toEqual(REALISTIC_ARTIFACT.numericClaims);
    expect(readback.visualBlocks).toEqual(REALISTIC_ARTIFACT.visualBlocks);
  });
});

describe("Phase 3 — Phase 1 extraction-reuse keeps working: envelope copies are safely decrypted", () => {
  // The reuse path clones `artifact` and `textPreview` from a source row to
  // a target row WITHOUT re-encrypting (it just propagates the stored
  // value). We assert that this stays correct: copying an envelope produces
  // a target row that decrypts to the same payload.

  it("artifact envelope cloned into a new row decrypts to the original payload", () => {
    const sourceEnvelope = encryptJsonField(REALISTIC_ARTIFACT);
    // Simulate the Phase 1 reuse cloneJsonForPrisma:
    const clonedEnvelope = JSON.parse(JSON.stringify(sourceEnvelope));
    expect(safeDecryptJsonField(clonedEnvelope)).toEqual(REALISTIC_ARTIFACT);
  });

  it("textPreview ciphertext cloned (string copy) decrypts to the original string", () => {
    const sourceCiphertext = encryptText(REALISTIC_TEXT_PREVIEW);
    // String values are copied as-is in the reuse path (no transformation).
    const cloned = String(sourceCiphertext);
    expect(safeDecrypt(cloned)).toBe(REALISTIC_TEXT_PREVIEW);
  });
});
