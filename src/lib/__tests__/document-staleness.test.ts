/**
 * Phase B3.3 — Document staleness helper unit tests.
 */
import { describe, expect, it } from "vitest";
import {
  formatStalenessAge,
  isDocumentStale,
  type DocumentStalenessInput,
} from "../document-staleness";

const NOW = 1_700_000_000_000;

function mk(status: string, uploadedAtMs: number | null | undefined | Date | string = NOW): DocumentStalenessInput {
  return { processingStatus: status, uploadedAt: uploadedAtMs };
}

describe("isDocumentStale — terminal statuses are never stale", () => {
  it("COMPLETED → not stale, ageMs=null", () => {
    expect(isDocumentStale(mk("COMPLETED", NOW - 999_999_999), { nowMs: NOW })).toEqual({
      stale: false,
      ageMs: null,
    });
  });
  it("FAILED → not stale (B3.1 retry handles it)", () => {
    expect(isDocumentStale(mk("FAILED"), { nowMs: NOW }).stale).toBe(false);
  });
  it("CANCELLED → not stale", () => {
    expect(isDocumentStale(mk("CANCELLED"), { nowMs: NOW }).stale).toBe(false);
  });
  it("statut inconnu → terminal par défaut (défensif)", () => {
    expect(isDocumentStale(mk("WEIRD"), { nowMs: NOW }).stale).toBe(false);
  });
});

describe("isDocumentStale — PENDING threshold", () => {
  const PENDING_THRESHOLD = 2 * 60 * 1000;

  it("PENDING fresh (1 minute) → not stale", () => {
    const r = isDocumentStale(mk("PENDING", NOW - 60_000), { nowMs: NOW });
    expect(r.stale).toBe(false);
    expect(r.ageMs).toBe(60_000);
  });

  it("PENDING juste sous le seuil → not stale", () => {
    const r = isDocumentStale(mk("PENDING", NOW - PENDING_THRESHOLD), { nowMs: NOW });
    expect(r.stale).toBe(false);
  });

  it("PENDING juste au-dessus du seuil → stale (pending_stuck)", () => {
    const r = isDocumentStale(mk("PENDING", NOW - PENDING_THRESHOLD - 1), { nowMs: NOW });
    expect(r.stale).toBe(true);
    expect(r.reason).toBe("pending_stuck");
    expect(r.ageMs).toBe(PENDING_THRESHOLD + 1);
  });

  it("override pendingThresholdMs respecté", () => {
    const r = isDocumentStale(mk("PENDING", NOW - 30_000), {
      nowMs: NOW,
      pendingThresholdMs: 20_000,
    });
    expect(r.stale).toBe(true);
  });
});

describe("isDocumentStale — PROCESSING threshold", () => {
  const PROCESSING_THRESHOLD = 10 * 60 * 1000;

  it("PROCESSING fresh (5 minutes) → not stale", () => {
    const r = isDocumentStale(mk("PROCESSING", NOW - 5 * 60 * 1000), { nowMs: NOW });
    expect(r.stale).toBe(false);
  });

  it("PROCESSING juste sous le seuil → not stale", () => {
    const r = isDocumentStale(mk("PROCESSING", NOW - PROCESSING_THRESHOLD), { nowMs: NOW });
    expect(r.stale).toBe(false);
  });

  it("PROCESSING juste au-dessus du seuil → stale (processing_stuck)", () => {
    const r = isDocumentStale(mk("PROCESSING", NOW - PROCESSING_THRESHOLD - 1), { nowMs: NOW });
    expect(r.stale).toBe(true);
    expect(r.reason).toBe("processing_stuck");
  });

  it("PROCESSING très ancien → stale + ageMs précis", () => {
    const r = isDocumentStale(mk("PROCESSING", NOW - 3_600_000), { nowMs: NOW });
    expect(r.stale).toBe(true);
    expect(r.ageMs).toBe(3_600_000);
  });
});

describe("isDocumentStale — timestamp parsing", () => {
  it("uploadedAt Date object accepté", () => {
    const r = isDocumentStale(mk("PROCESSING", new Date(NOW - 60 * 60 * 1000)), { nowMs: NOW });
    expect(r.stale).toBe(true);
  });

  it("uploadedAt ISO string accepté", () => {
    const r = isDocumentStale(mk("PROCESSING", new Date(NOW - 60 * 60 * 1000).toISOString()), {
      nowMs: NOW,
    });
    expect(r.stale).toBe(true);
  });

  it("uploadedAt null → not stale (on ne décide pas sans timestamp)", () => {
    expect(isDocumentStale(mk("PROCESSING", null), { nowMs: NOW }).stale).toBe(false);
  });

  it("uploadedAt undefined → not stale", () => {
    expect(isDocumentStale(mk("PROCESSING", undefined), { nowMs: NOW }).stale).toBe(false);
  });

  it("uploadedAt string non-parsable → not stale (défensif)", () => {
    expect(isDocumentStale(mk("PROCESSING", "not-a-date"), { nowMs: NOW }).stale).toBe(false);
  });

  it("uploadedAt FUTUR (clock skew) → ageMs=0 (pas négatif), not stale", () => {
    const r = isDocumentStale(mk("PROCESSING", NOW + 60_000), { nowMs: NOW });
    expect(r.ageMs).toBe(0);
    expect(r.stale).toBe(false);
  });
});

describe("formatStalenessAge", () => {
  it("< 60 min → 'N min'", () => {
    expect(formatStalenessAge(5 * 60 * 1000)).toBe("5 min");
    expect(formatStalenessAge(59 * 60 * 1000)).toBe("59 min");
  });
  it(">= 60 min → 'H h MM'", () => {
    expect(formatStalenessAge(60 * 60 * 1000)).toBe("1 h 00");
    expect(formatStalenessAge(75 * 60 * 1000)).toBe("1 h 15");
    expect(formatStalenessAge(2 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe("2 h 05");
  });
});
