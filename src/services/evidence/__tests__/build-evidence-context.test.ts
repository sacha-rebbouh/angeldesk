/**
 * Phase 5.0/5.4 — Unit + integration tests for buildDealEvidenceContext.
 *
 * The unit tests mock Prisma to verify the picker / dedup / stale-warning
 * logic. A small Neon-backed integration test covers the Avekapeti gate
 * (cap table + email + BP) end-to-end.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================
// Pure / unit tests with mocked Prisma
// ============================================================

const mocks = vi.hoisted(() => ({
  documentFindMany: vi.fn(),
  evidenceSignalFindMany: vi.fn(),
  queryRaw: vi.fn().mockResolvedValue([]), // latest-run-per-doc query
  safeDecrypt: vi.fn((s: string) => s.startsWith("ENC:") ? s.slice(4) : s),
  safeDecryptJsonField: vi.fn((v: unknown) => v),
}));

vi.mock("@/lib/encryption", () => ({
  safeDecrypt: mocks.safeDecrypt,
  safeDecryptJsonField: mocks.safeDecryptJsonField,
}));

const fakePrisma = {
  document: { findMany: mocks.documentFindMany },
  evidenceSignal: { findMany: mocks.evidenceSignalFindMany },
  $queryRaw: mocks.queryRaw,
} as never;

const { buildDealEvidenceContext } = await import("../build-evidence-context");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.safeDecrypt.mockImplementation((s: string) => s.startsWith("ENC:") ? s.slice(4) : s);
  mocks.safeDecryptJsonField.mockImplementation((v: unknown) => v);
  mocks.queryRaw.mockResolvedValue([]); // default: no latest run
});

describe("buildDealEvidenceContext — empty deal", () => {
  it("retourne un map vide quand aucun document", async () => {
    mocks.documentFindMany.mockResolvedValue([]);
    mocks.evidenceSignalFindMany.mockResolvedValue([]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_empty");
    expect(out).toEqual({});
  });

  it("retourne un context vide par doc quand aucun signal", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_1", name: "Test.pdf", type: "OTHER", corpusParentDocumentId: null },
    ]);
    mocks.evidenceSignalFindMany.mockResolvedValue([]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x");
    expect(out["doc_1"]).toMatchObject({
      documentDate: null,
      asOf: null,
      forecast: null,
      actuals: [],
      detectedAttachments: [],
      staleWarnings: [],
    });
  });
});

describe("Codex round 16 P1 — drop signals from old extraction run", () => {
  it("ancien run HIGH + dernier run MEDIUM → dernier run wins (le HIGH stale est filtré)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Cap.png", type: "CAP_TABLE", corpusParentDocumentId: null },
    ]);
    // Latest run is R2.
    mocks.queryRaw.mockResolvedValue([{ documentId: "doc_cap", id: "runR2" }]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({
        id: "s_old_run", documentId: "doc_cap", kind: "CAP_TABLE_AS_OF",
        asOfDate: new Date("2024-09-18"),
        confidence: "HIGH", // old HIGH
        signalScopeKey: "run:runR1", // OLD run
      }),
      makeSignal({
        id: "s_new_run", documentId: "doc_cap", kind: "CAP_TABLE_AS_OF",
        asOfDate: new Date("2024-09-18"),
        confidence: "MEDIUM", // new MEDIUM
        signalScopeKey: "run:runR2", // LATEST run
      }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x");
    expect(out["doc_cap"].asOf?.signalId).toBe("s_new_run");
    expect(out["doc_cap"].asOf?.confidence).toBe("MEDIUM");
  });

  it("non-run signals (filename, source_metadata, human, import) survivent indépendamment du latest run", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Cap.png", type: "CAP_TABLE", corpusParentDocumentId: null },
    ]);
    mocks.queryRaw.mockResolvedValue([{ documentId: "doc_cap", id: "runR2" }]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({
        id: "s_filename", documentId: "doc_cap", kind: "DOCUMENT_DATE",
        asOfDate: new Date("2026-03-01"),
        confidence: "MEDIUM",
        signalScopeKey: "filename",
      }),
      makeSignal({
        id: "s_src_meta", documentId: "doc_cap", kind: "ATTACHMENT_RELATION",
        reportedAt: new Date("2026-04-22"),
        confidence: "HIGH",
        signalScopeKey: "source_metadata",
        valueJson: { emailDocId: "doc_email", matchMethod: "exact" },
      }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x");
    expect(out["doc_cap"].documentDate?.signalId).toBe("s_filename");
    // source_metadata signal survives the latest-run filter; the attachment
    // is recorded (emailDocName resolves to null since doc_email isn't loaded).
    expect(out["doc_cap"].detectedAttachments).toHaveLength(1);
    expect(out["doc_cap"].detectedAttachments[0].emailDocId).toBe("doc_email");
  });

  it("doc sans latest run connu → run:* signals préservés (fallback conservateur)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Cap.png", type: "CAP_TABLE", corpusParentDocumentId: null },
    ]);
    mocks.queryRaw.mockResolvedValue([]); // no run found
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({
        id: "s_orphan_run", documentId: "doc_cap", kind: "CAP_TABLE_AS_OF",
        asOfDate: new Date("2024-09-18"),
        confidence: "HIGH",
        signalScopeKey: "run:runOrphan",
      }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x");
    expect(out["doc_cap"].asOf?.signalId).toBe("s_orphan_run");
  });
});

describe("Codex round 15 P1 — latest extractor version wins (Phase 1 §3.12 deferred decision)", () => {
  it("v1 + v2 sur même (doc, scope, kind) → seul v2 visible (parser upgrade)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Cap.png", type: "CAP_TABLE", corpusParentDocumentId: null },
    ]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({
        id: "s_v1", documentId: "doc_cap", kind: "CAP_TABLE_AS_OF",
        asOfDate: new Date("2024-09-18"),
        confidence: "HIGH", // v1 a HIGH même
        extractorVersion: "temporal-extractor@2026-05-17-001",
        signalScopeKey: "run:c1",
      }),
      makeSignal({
        id: "s_v2", documentId: "doc_cap", kind: "CAP_TABLE_AS_OF",
        asOfDate: new Date("2024-09-18"),
        confidence: "MEDIUM", // v2 a MEDIUM mais doit toujours gagner (parser plus récent)
        extractorVersion: "temporal-extractor@2026-05-18-001",
        signalScopeKey: "run:c1",
      }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x");
    expect(out["doc_cap"].asOf?.signalId).toBe("s_v2");
    expect(out["doc_cap"].asOf?.confidence).toBe("MEDIUM"); // v2 wins despite lower confidence
  });

  it("v1 sur run:R1 + v2 sur run:R2 → coexistent (scopes différents)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Cap.png", type: "CAP_TABLE", corpusParentDocumentId: null },
    ]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({
        id: "s_run1_v1", documentId: "doc_cap", kind: "CAP_TABLE_AS_OF",
        asOfDate: new Date("2024-09-18"),
        confidence: "HIGH",
        extractorVersion: "temporal-extractor@2026-05-17-001",
        signalScopeKey: "run:c1",
      }),
      makeSignal({
        id: "s_run2_v2", documentId: "doc_cap", kind: "CAP_TABLE_AS_OF",
        asOfDate: new Date("2024-09-18"),
        confidence: "HIGH",
        extractorVersion: "temporal-extractor@2026-05-18-001",
        signalScopeKey: "run:c2",
      }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x");
    // The picker still sees both candidates (different scopes), and the existing
    // ranking takes over (here both HIGH/DAY → createdAt desc).
    expect(out["doc_cap"].asOf).toBeDefined();
  });
});

describe("buildDealEvidenceContext — picker logic", () => {
  it("CAP_TABLE_AS_OF HIGH gagne sur DOCUMENT_DATE MEDIUM (kinds différents)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Cap.png", type: "CAP_TABLE", corpusParentDocumentId: null },
    ]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({ id: "s_capof", kind: "CAP_TABLE_AS_OF", asOfDate: new Date("2024-09-18"), confidence: "HIGH", signalScopeKey: "run:c1" }),
      makeSignal({ id: "s_docdate", kind: "DOCUMENT_DATE", asOfDate: new Date("2024-09-01"), confidence: "MEDIUM", signalScopeKey: "filename" }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x");
    expect(out["doc_cap"].asOf?.signalKind).toBe("CAP_TABLE_AS_OF");
    // documentDate is still populated (different role) but the prelude prefers asOf.
    expect(out["doc_cap"].documentDate?.signalKind).toBe("DOCUMENT_DATE");
  });

  it("HIGH > MEDIUM puis DAY > MONTH puis scope rank (run > source_metadata > filename)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_d", name: "Deck.pdf", type: "PITCH_DECK", corpusParentDocumentId: null },
    ]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({ id: "s_lo_filename", documentId: "doc_d", kind: "DOCUMENT_DATE", asOfDate: new Date("2026-03-01"), confidence: "MEDIUM", precision: "MONTH", signalScopeKey: "filename" }),
      makeSignal({ id: "s_hi_run", documentId: "doc_d", kind: "DOCUMENT_DATE", asOfDate: new Date("2026-03-01"), confidence: "HIGH", precision: "MONTH", signalScopeKey: "run:c1" }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x");
    expect(out["doc_d"].documentDate?.signalId).toBe("s_hi_run");
  });

  it("FINANCIAL_PERIOD_FORECAST: pick le plus récent (max dateEnd)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_bp", name: "BP.xlsx", type: "FINANCIAL_MODEL", corpusParentDocumentId: null },
    ]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({
        id: "s_old", documentId: "doc_bp", kind: "FINANCIAL_PERIOD_FORECAST",
        dateStart: new Date("2025-01-01"), dateEnd: new Date("2025-12-31"),
        valueJson: { yearsCovered: [2025] }, confidence: "HIGH",
      }),
      makeSignal({
        id: "s_new", documentId: "doc_bp", kind: "FINANCIAL_PERIOD_FORECAST",
        dateStart: new Date("2026-01-01"), dateEnd: new Date("2030-12-31"),
        valueJson: { yearsCovered: [2026, 2027, 2028, 2029, 2030] }, confidence: "HIGH",
      }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x");
    expect(out["doc_bp"].forecast?.signalId).toBe("s_new");
    expect(out["doc_bp"].forecast?.yearsCovered).toEqual([2026, 2027, 2028, 2029, 2030]);
  });

  it("FINANCIAL_PERIOD_ACTUAL: collecte tous les signaux (multi-bilans)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_bilan", name: "Bilan.pdf", type: "FINANCIAL_STATEMENTS", corpusParentDocumentId: null },
    ]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({ id: "a1", documentId: "doc_bilan", kind: "FINANCIAL_PERIOD_ACTUAL", dateStart: new Date("2024-01-01"), dateEnd: new Date("2024-12-31"), valueJson: { yearsCovered: [2024] } }),
      makeSignal({ id: "a2", documentId: "doc_bilan", kind: "FINANCIAL_PERIOD_ACTUAL", dateStart: new Date("2025-01-01"), dateEnd: new Date("2025-12-31"), valueJson: { yearsCovered: [2025] } }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x");
    expect(out["doc_bilan"].actuals).toHaveLength(2);
    expect(out["doc_bilan"].actuals.map((a) => a.yearsCovered.flat())).toEqual([[2024], [2025]]);
  });
});

describe("buildDealEvidenceContext — attachment resolution", () => {
  it("ATTACHMENT_RELATION → résolution du nom email parent", async () => {
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Cap.png", type: "CAP_TABLE", corpusParentDocumentId: null },
      { id: "doc_email", name: "Mail.pdf", type: "OTHER", corpusParentDocumentId: null },
    ]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({
        id: "s_att", kind: "ATTACHMENT_RELATION", documentId: "doc_cap",
        reportedAt: new Date("2026-04-22T01:03:00Z"),
        valueJson: { emailDocId: "doc_email", matchMethod: "exact", emailSourceDate: "2026-04-22T01:03:00Z" },
      }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x");
    expect(out["doc_cap"].detectedAttachments).toHaveLength(1);
    expect(out["doc_cap"].detectedAttachments[0]).toMatchObject({
      emailDocId: "doc_email",
      emailDocName: "Mail.pdf",
      matchMethod: "exact",
    });
  });
});

describe("buildDealEvidenceContext — stale warnings (Codex Phase 5 gate)", () => {
  it("cap_table_stale: > 12 mois après aujourd'hui → warning medium", async () => {
    const today = new Date("2026-05-18T00:00:00Z");
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_cap", name: "Cap.png", type: "CAP_TABLE", corpusParentDocumentId: null },
    ]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({ id: "s_capof", kind: "CAP_TABLE_AS_OF", asOfDate: new Date("2024-09-18"), confidence: "HIGH" }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x", { today });
    const warning = out["doc_cap"].staleWarnings.find((w) => w.kind === "cap_table_stale");
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe("high"); // 20 months > 12*1.5 = 18 → high
    expect(warning?.message).toMatch(/months old/);
  });

  it("forecast_now_historical: forecast 2025-2026 alors qu'on est en 2026-05 → warning", async () => {
    const today = new Date("2026-05-18T00:00:00Z");
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_bp", name: "BP.xlsx", type: "FINANCIAL_MODEL", corpusParentDocumentId: null },
    ]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({
        id: "s_forecast", documentId: "doc_bp", kind: "FINANCIAL_PERIOD_FORECAST",
        dateStart: new Date("2025-01-01"), dateEnd: new Date("2026-12-31"),
        valueJson: { yearsCovered: [2025, 2026] }, confidence: "HIGH",
      }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x", { today });
    const warning = out["doc_bp"].staleWarnings.find((w) => w.kind === "forecast_now_historical");
    expect(warning).toBeDefined();
    expect(warning?.message).toMatch(/Year-to-Date actuals/);
    expect(warning?.message).toMatch(/2025, 2026/);
    expect(warning?.message).toMatch(/do NOT treat the forecast values as realised/);
  });

  it("forecast 2027+ (entièrement futur) → PAS de warning historical", async () => {
    const today = new Date("2026-05-18T00:00:00Z");
    mocks.documentFindMany.mockResolvedValue([
      { id: "doc_bp", name: "BP.xlsx", type: "FINANCIAL_MODEL", corpusParentDocumentId: null },
    ]);
    mocks.evidenceSignalFindMany.mockResolvedValue([
      makeSignal({
        id: "s_forecast", documentId: "doc_bp", kind: "FINANCIAL_PERIOD_FORECAST",
        dateStart: new Date("2027-01-01"), dateEnd: new Date("2030-12-31"),
        valueJson: { yearsCovered: [2027, 2028, 2029, 2030] }, confidence: "HIGH",
      }),
    ]);
    const out = await buildDealEvidenceContext(fakePrisma, "deal_x", { today });
    expect(out["doc_bp"].staleWarnings.find((w) => w.kind === "forecast_now_historical")).toBeUndefined();
  });
});

// ============================================================
// Helpers
// ============================================================
function makeSignal(over: Partial<{
  id: string;
  kind: string;
  documentId: string;
  asOfDate: Date | null;
  dateStart: Date | null;
  dateEnd: Date | null;
  reportedAt: Date | null;
  precision: string;
  confidence: string;
  signalScopeKey: string;
  evidenceText: string | null;
  valueJson: unknown;
  createdAt: Date;
  extractorVersion: string;
}>): never {
  return {
    id: "sig",
    kind: "DOCUMENT_DATE",
    documentId: "doc_cap",
    dealId: "deal_x",
    documentVersion: 1,
    signalScopeKey: "run:c1",
    extractionRunId: null,
    extractorVersion: "test@v1",
    sourceTextHash: null,
    valueJson: null,
    dateStart: null,
    dateEnd: null,
    asOfDate: null,
    reportedAt: null,
    precision: "DAY",
    confidence: "HIGH",
    sourceMethod: "DETERMINISTIC",
    evidenceText: null,
    pageNumber: null,
    sheetName: null,
    charOffset: null,
    signalHash: "deadbeef",
    metadata: null,
    createdAt: new Date("2026-05-18"),
    ...over,
  } as unknown as never;
}

// NB: integration test (real Prisma, real Neon) lives in a separate file
// (build-evidence-context-integration.test.ts) to avoid the vi.mock leak —
// the encryption mock here would otherwise break the real encrypt path.
