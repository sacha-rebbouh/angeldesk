/**
 * Phase 3 — Unit tests for the promotion picker (pure function).
 *
 * Hits no DB. For DB-level promotion tests (race conditions, sourceMetadata
 * patching, idempotence), see promote-source-date-integration.test.ts.
 */
import { describe, expect, it } from "vitest";
import type { EvidenceSignal } from "@prisma/client";
import {
  getPromotionKindsForDocType,
  pickBestPromotionCandidate,
} from "../promote-source-date";

type Candidate = Pick<EvidenceSignal, "id" | "kind" | "asOfDate" | "precision" | "createdAt" | "confidence" | "signalScopeKey">;

const baseCandidate = (overrides: Partial<Candidate>): Candidate => ({
  id: "c1",
  kind: "CAP_TABLE_AS_OF",
  asOfDate: new Date("2024-09-18T00:00:00Z"),
  precision: "DAY",
  createdAt: new Date("2026-05-18T00:00:00Z"),
  confidence: "HIGH",
  signalScopeKey: "run:c123",
  ...overrides,
});

describe("getPromotionKindsForDocType", () => {
  it("CAP_TABLE → CAP_TABLE_AS_OF only", () => {
    expect(getPromotionKindsForDocType("CAP_TABLE")).toEqual(["CAP_TABLE_AS_OF"]);
  });
  it("FINANCIAL_STATEMENTS → BALANCE_SHEET_AS_OF only", () => {
    expect(getPromotionKindsForDocType("FINANCIAL_STATEMENTS")).toEqual(["BALANCE_SHEET_AS_OF"]);
  });
  it("PITCH_DECK → DOCUMENT_DATE only", () => {
    expect(getPromotionKindsForDocType("PITCH_DECK")).toEqual(["DOCUMENT_DATE"]);
  });
  it("FINANCIAL_MODEL → DOCUMENT_DATE only", () => {
    expect(getPromotionKindsForDocType("FINANCIAL_MODEL")).toEqual(["DOCUMENT_DATE"]);
  });
  it("OTHER → aucun (not promoted)", () => {
    expect(getPromotionKindsForDocType("OTHER")).toEqual([]);
  });
  it("LEGAL_DOCS / TERM_SHEET / etc. → aucun (not promoted in Phase 3)", () => {
    expect(getPromotionKindsForDocType("LEGAL_DOCS")).toEqual([]);
    expect(getPromotionKindsForDocType("TERM_SHEET")).toEqual([]);
    expect(getPromotionKindsForDocType("MARKET_STUDY")).toEqual([]);
  });
});

describe("pickBestPromotionCandidate", () => {
  it("CAP_TABLE: retourne le CAP_TABLE_AS_OF HIGH", () => {
    const result = pickBestPromotionCandidate([baseCandidate({})], "CAP_TABLE");
    expect(result?.id).toBe("c1");
  });

  it("CAP_TABLE: ignore les signaux non-HIGH (MEDIUM/LOW)", () => {
    const result = pickBestPromotionCandidate(
      [
        baseCandidate({ id: "med", confidence: "MEDIUM" }),
        baseCandidate({ id: "low", confidence: "LOW" }),
      ],
      "CAP_TABLE"
    );
    expect(result).toBeNull();
  });

  it("CAP_TABLE: ignore les signaux scope 'filename' (MEDIUM exclu)", () => {
    const result = pickBestPromotionCandidate(
      [baseCandidate({ id: "fname", signalScopeKey: "filename" })],
      "CAP_TABLE"
    );
    expect(result).toBeNull();
  });

  it("CAP_TABLE: ignore les signaux sans asOfDate", () => {
    const result = pickBestPromotionCandidate(
      [baseCandidate({ id: "no-date", asOfDate: null })],
      "CAP_TABLE"
    );
    expect(result).toBeNull();
  });

  it("CAP_TABLE: ignore les autres kinds (DOCUMENT_DATE, FINANCIAL_PERIOD_FORECAST...)", () => {
    const result = pickBestPromotionCandidate(
      [baseCandidate({ id: "wrong-kind", kind: "DOCUMENT_DATE" })],
      "CAP_TABLE"
    );
    expect(result).toBeNull();
  });

  it("PITCH_DECK: retourne le DOCUMENT_DATE HIGH du footer (scope 'run:*'), pas le filename MEDIUM", () => {
    const result = pickBestPromotionCandidate(
      [
        baseCandidate({ id: "filename-medium", kind: "DOCUMENT_DATE", confidence: "MEDIUM", signalScopeKey: "filename" }),
        baseCandidate({ id: "footer-high", kind: "DOCUMENT_DATE", confidence: "HIGH", signalScopeKey: "run:c123" }),
      ],
      "PITCH_DECK"
    );
    expect(result?.id).toBe("footer-high");
  });

  it("tie-break: precision DAY gagne sur MONTH", () => {
    const result = pickBestPromotionCandidate(
      [
        baseCandidate({ id: "month", precision: "MONTH" }),
        baseCandidate({ id: "day", precision: "DAY" }),
      ],
      "CAP_TABLE"
    );
    expect(result?.id).toBe("day");
  });

  it("tie-break: precision égale → createdAt le plus récent gagne", () => {
    const result = pickBestPromotionCandidate(
      [
        baseCandidate({ id: "old", createdAt: new Date("2026-01-01T00:00:00Z") }),
        baseCandidate({ id: "new", createdAt: new Date("2026-05-18T00:00:00Z") }),
      ],
      "CAP_TABLE"
    );
    expect(result?.id).toBe("new");
  });

  it("FINANCIAL_STATEMENTS: BALANCE_SHEET_AS_OF accepté, FINANCIAL_PERIOD_ACTUAL ignoré (n'est pas une date du doc)", () => {
    const result = pickBestPromotionCandidate(
      [
        baseCandidate({ id: "period", kind: "FINANCIAL_PERIOD_ACTUAL" }),
        baseCandidate({ id: "as-of", kind: "BALANCE_SHEET_AS_OF" }),
      ],
      "FINANCIAL_STATEMENTS"
    );
    expect(result?.id).toBe("as-of");
  });

  it("OTHER doctype: jamais promu (return null)", () => {
    const result = pickBestPromotionCandidate(
      [baseCandidate({ kind: "DOCUMENT_DATE" })],
      "OTHER"
    );
    expect(result).toBeNull();
  });

  it("Codex round 10 P2 — picker exclut human:* (alignment avec SQL strict)", () => {
    const result = pickBestPromotionCandidate(
      [baseCandidate({ id: "human", signalScopeKey: "human:c0xx" + "x".repeat(20) })],
      "CAP_TABLE"
    );
    expect(result).toBeNull();
  });

  it("Codex round 10 P2 — picker exclut import:* (alignment avec SQL strict)", () => {
    const result = pickBestPromotionCandidate(
      [baseCandidate({ id: "import", signalScopeKey: "import:backfill-2026-05-18" })],
      "CAP_TABLE"
    );
    expect(result).toBeNull();
  });

  it("Codex round 10 P2 — picker accepte source_metadata", () => {
    const result = pickBestPromotionCandidate(
      [baseCandidate({ id: "src-meta", signalScopeKey: "source_metadata", kind: "CAP_TABLE_AS_OF" })],
      "CAP_TABLE"
    );
    expect(result?.id).toBe("src-meta");
  });
});
