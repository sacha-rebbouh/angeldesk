import { describe, expect, it } from "vitest";
import { generateDealFingerprint } from "../index";
import type { CurrentFact } from "@/services/fact-store/types";

function buildDeal(
  overrides: Partial<Parameters<typeof generateDealFingerprint>[0]> = {}
): Parameters<typeof generateDealFingerprint>[0] {
  return {
    id: "deal_1",
    name: "Legacy Deal",
    companyName: "Legacy Company",
    description: "Legacy description",
    website: "https://legacy.example",
    sector: "SaaS",
    stage: "SEED",
    geography: "FR",
    arr: 1000 as never,
    growthRate: 12 as never,
    amountRequested: 100000 as never,
    valuationPre: 1500000 as never,
    updatedAt: new Date("2026-04-20T10:00:00Z"),
    createdAt: new Date("2026-04-10T10:00:00Z"),
    instrument: null,
    userId: "user_1",
    status: "SCREENING",
    source: null,
    sourceUrl: null,
    lastScrapedAt: null,
    processingStatus: null,
    extractionQuality: null,
    processingError: null,
    processingProgress: 0,
    aiSummary: null,
    thesisVerdict: null,
    thesisConfidence: null,
    thesisVersion: null,
    thesisLastGeneratedAt: null,
    geographyInferred: null,
    deckUploadDate: null,
    nextAction: null,
    nextActionDue: null,
    lastContactAt: null,
    deletedAt: null,
    archivedAt: null,
    companyId: null,
    legalName: null,
    incorporationDate: null,
    headquarters: null,
    employeeCount: null,
    revenue: null,
    burnRate: null,
    runway: null,
    capTableSummary: null,
    competitionNotes: null,
    marketNotes: null,
    productNotes: null,
    founderNotes: null,
    internalNotes: null,
    globalScore: null,
    teamScore: null,
    marketScore: null,
    productScore: null,
    financialsScore: null,
    documents: [],
    founders: [],
    currentFacts: [],
    ...overrides,
  } as Parameters<typeof generateDealFingerprint>[0];
}

describe("Codex round 15 P2 — EvidenceSignals invalidate fingerprint", () => {
  it("ajouter un signal change le fingerprint", () => {
    const noSignals = generateDealFingerprint(buildDeal());
    const withSignal = generateDealFingerprint(buildDeal(), [
      {
        documentId: "doc_1",
        signalScopeKey: "run:c1abc12345678",
        kind: "CAP_TABLE_AS_OF",
        signalHash: "deadbeef",
        extractorVersion: "temporal-extractor@2026-05-18-001",
      },
    ]);
    expect(noSignals).not.toBe(withSignal);
  });

  it("retire un signal change le fingerprint", () => {
    const withTwoSignals = generateDealFingerprint(buildDeal(), [
      { documentId: "doc_1", signalScopeKey: "filename", kind: "DOCUMENT_DATE", signalHash: "h1", extractorVersion: "v1" },
      { documentId: "doc_2", signalScopeKey: "source_metadata", kind: "ATTACHMENT_RELATION", signalHash: "h2", extractorVersion: "v1" },
    ]);
    const withOneSignal = generateDealFingerprint(buildDeal(), [
      { documentId: "doc_1", signalScopeKey: "filename", kind: "DOCUMENT_DATE", signalHash: "h1", extractorVersion: "v1" },
    ]);
    expect(withTwoSignals).not.toBe(withOneSignal);
  });

  it("ordre des signals n'affecte pas le fingerprint (sort stable)", () => {
    const orderA = generateDealFingerprint(buildDeal(), [
      { documentId: "doc_a", signalScopeKey: "filename", kind: "DOCUMENT_DATE", signalHash: "h1", extractorVersion: "v1" },
      { documentId: "doc_b", signalScopeKey: "source_metadata", kind: "ATTACHMENT_RELATION", signalHash: "h2", extractorVersion: "v1" },
    ]);
    const orderB = generateDealFingerprint(buildDeal(), [
      { documentId: "doc_b", signalScopeKey: "source_metadata", kind: "ATTACHMENT_RELATION", signalHash: "h2", extractorVersion: "v1" },
      { documentId: "doc_a", signalScopeKey: "filename", kind: "DOCUMENT_DATE", signalHash: "h1", extractorVersion: "v1" },
    ]);
    expect(orderA).toBe(orderB);
  });

  it("changement de extractorVersion (parser upgrade) change le fingerprint", () => {
    const baseSignal = { documentId: "doc_1", signalScopeKey: "filename", kind: "DOCUMENT_DATE", signalHash: "h1" };
    const v1 = generateDealFingerprint(buildDeal(), [{ ...baseSignal, extractorVersion: "v1" }]);
    const v2 = generateDealFingerprint(buildDeal(), [{ ...baseSignal, extractorVersion: "v2" }]);
    expect(v1).not.toBe(v2);
  });

  it("changement de signalHash change le fingerprint (nouveau payload)", () => {
    const base = { documentId: "doc_1", signalScopeKey: "filename", kind: "DOCUMENT_DATE", extractorVersion: "v1" };
    const h1 = generateDealFingerprint(buildDeal(), [{ ...base, signalHash: "hash1" }]);
    const h2 = generateDealFingerprint(buildDeal(), [{ ...base, signalHash: "hash2" }]);
    expect(h1).not.toBe(h2);
  });

  it("aucun signal (legacy) → backward compat avec fingerprint pré-Phase 5.1", () => {
    // The function should accept omitted second argument and produce a stable
    // fingerprint identical to passing [].
    const noArg = generateDealFingerprint(buildDeal());
    const emptyArr = generateDealFingerprint(buildDeal(), []);
    expect(noArg).toBe(emptyArr);
  });

  it("Codex round 16 P2 — 2 signaux identiques sauf extractorVersion, ordre inversé → même fingerprint", () => {
    const base = { documentId: "doc_1", signalScopeKey: "filename", kind: "DOCUMENT_DATE", signalHash: "h1" };
    const orderA = generateDealFingerprint(buildDeal(), [
      { ...base, extractorVersion: "v1" },
      { ...base, extractorVersion: "v2" },
    ]);
    const orderB = generateDealFingerprint(buildDeal(), [
      { ...base, extractorVersion: "v2" },
      { ...base, extractorVersion: "v1" },
    ]);
    expect(orderA).toBe(orderB);
  });
});

describe("generateDealFingerprint", () => {
  it("prefers canonical current facts over stale persisted deal fields", () => {
    const staleFingerprint = generateDealFingerprint(buildDeal());

    const canonicalFactFingerprint = generateDealFingerprint(
      buildDeal({
        currentFacts: [
          {
            dealId: "deal_1",
            factKey: "company.name",
            category: "OTHER",
            currentValue: "Canonical Co",
            currentDisplayValue: "Canonical Co",
            currentSource: "PITCH_DECK",
            currentConfidence: 95,
            currentTruthConfidence: 92,
            isDisputed: false,
            eventHistory: [],
            firstSeenAt: new Date("2026-04-19T10:00:00Z"),
            lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
          } satisfies CurrentFact,
          {
            dealId: "deal_1",
            factKey: "other.website",
            category: "OTHER",
            currentValue: "https://canonical.example",
            currentDisplayValue: "https://canonical.example",
            currentSource: "CONTEXT_ENGINE",
            currentConfidence: 96,
            currentTruthConfidence: 94,
            isDisputed: false,
            eventHistory: [],
            firstSeenAt: new Date("2026-04-19T10:00:00Z"),
            lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
          } satisfies CurrentFact,
          {
            dealId: "deal_1",
            factKey: "financial.arr",
            category: "FINANCIAL",
            currentValue: 1200000,
            currentDisplayValue: "€1.2M",
            currentSource: "DATA_ROOM",
            currentConfidence: 97,
            currentTruthConfidence: 95,
            isDisputed: false,
            eventHistory: [],
            firstSeenAt: new Date("2026-04-19T10:00:00Z"),
            lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
          } satisfies CurrentFact,
        ],
      })
    );

    const canonicalFieldFingerprint = generateDealFingerprint(
      buildDeal({
        companyName: "Canonical Co",
        website: "https://canonical.example",
        arr: 1200000 as never,
      })
    );

    expect(canonicalFactFingerprint).not.toBe(staleFingerprint);
    expect(canonicalFactFingerprint).toBe(canonicalFieldFingerprint);
  });
});

// ============================================================
// B6.1 fix-up (Codex P1) — Document metadata fields the user can
// override (manual sourceDate, type, sourceKind, email metadata) MUST
// be part of the fingerprint. Otherwise a user correction would land
// a cached analysis built with the OLD value — the exact bug the
// Codex audit flagged on B6.1 round 1.
// ============================================================
describe("Codex B6.1 P1 — Document metadata in fingerprint (cache invalidates on user override)", () => {
  function buildBaseDocument(overrides: Record<string, unknown> = {}) {
    return {
      id: "doc_A",
      extractedText: "same text both sides",
      processingStatus: "COMPLETED",
      uploadedAt: new Date("2026-03-10T00:00:00Z"),
      name: "deck.pdf",
      type: "PITCH_DECK",
      sourceKind: "FILE",
      corpusRole: "GENERAL",
      sourceDate: null,
      receivedAt: null,
      sourceAuthor: null,
      sourceSubject: null,
      corpusParentDocumentId: null,
      extractionRuns: [],
      ...overrides,
    };
  }

  it("sourceDate change → fingerprint change (manual date override invalidates cache)", () => {
    // The Codex audit's exact requirement: "deux deals/documents
    // identiques sauf sourceDate doivent produire deux fingerprints
    // différents."
    const noDateFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ sourceDate: null })] as never })
    );
    const withDateFingerprint = generateDealFingerprint(
      buildDeal({
        documents: [
          buildBaseDocument({ sourceDate: new Date("2026-03-14") }),
        ] as never,
      })
    );
    expect(noDateFingerprint).not.toBe(withDateFingerprint);
  });

  it("sourceDate change to a different date → fingerprint change (user corrects an automated date)", () => {
    const date1Fingerprint = generateDealFingerprint(
      buildDeal({
        documents: [buildBaseDocument({ sourceDate: new Date("2025-12-01") })] as never,
      })
    );
    const date2Fingerprint = generateDealFingerprint(
      buildDeal({
        documents: [buildBaseDocument({ sourceDate: new Date("2026-03-14") })] as never,
      })
    );
    expect(date1Fingerprint).not.toBe(date2Fingerprint);
  });

  it("receivedAt change → fingerprint change (B6.3 territory — email correction)", () => {
    const noReceivedFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ receivedAt: null })] as never })
    );
    const withReceivedFingerprint = generateDealFingerprint(
      buildDeal({
        documents: [
          buildBaseDocument({ receivedAt: new Date("2026-03-15") }),
        ] as never,
      })
    );
    expect(noReceivedFingerprint).not.toBe(withReceivedFingerprint);
  });

  it("type change → fingerprint change (B6.2 territory — type override recalc)", () => {
    const otherTypeFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ type: "OTHER" })] as never })
    );
    const pitchDeckFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ type: "PITCH_DECK" })] as never })
    );
    expect(otherTypeFingerprint).not.toBe(pitchDeckFingerprint);
  });

  it("sourceKind change → fingerprint change (B6.2 territory — FILE → EMAIL reclassification)", () => {
    const fileKindFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ sourceKind: "FILE" })] as never })
    );
    const emailKindFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ sourceKind: "EMAIL" })] as never })
    );
    expect(fileKindFingerprint).not.toBe(emailKindFingerprint);
  });

  it("corpusRole change → fingerprint change", () => {
    const generalFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ corpusRole: "GENERAL" })] as never })
    );
    const responseFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ corpusRole: "DILIGENCE_RESPONSE" })] as never })
    );
    expect(generalFingerprint).not.toBe(responseFingerprint);
  });

  it("sourceAuthor change → fingerprint change (B6.3 territory — email attribution)", () => {
    const noAuthorFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ sourceAuthor: null })] as never })
    );
    const withAuthorFingerprint = generateDealFingerprint(
      buildDeal({
        documents: [buildBaseDocument({ sourceAuthor: "CFO <cfo@x.com>" })] as never,
      })
    );
    expect(noAuthorFingerprint).not.toBe(withAuthorFingerprint);
  });

  it("sourceSubject change → fingerprint change (B6.3 territory — email subject correction)", () => {
    const noSubjectFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ sourceSubject: null })] as never })
    );
    const withSubjectFingerprint = generateDealFingerprint(
      buildDeal({
        documents: [buildBaseDocument({ sourceSubject: "Q1 update — confidential" })] as never,
      })
    );
    expect(noSubjectFingerprint).not.toBe(withSubjectFingerprint);
  });

  it("corpusParentDocumentId change → fingerprint change (B7 territory — attachment relinking)", () => {
    const orphanFingerprint = generateDealFingerprint(
      buildDeal({
        documents: [buildBaseDocument({ corpusParentDocumentId: null })] as never,
      })
    );
    const attachedFingerprint = generateDealFingerprint(
      buildDeal({
        documents: [
          buildBaseDocument({ corpusParentDocumentId: "doc_parent_email" }),
        ] as never,
      })
    );
    expect(orphanFingerprint).not.toBe(attachedFingerprint);
  });

  it("name change → fingerprint change (file rename affects agent attribution)", () => {
    const nameAFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ name: "deck-v1.pdf" })] as never })
    );
    const nameBFingerprint = generateDealFingerprint(
      buildDeal({ documents: [buildBaseDocument({ name: "deck-v2.pdf" })] as never })
    );
    expect(nameAFingerprint).not.toBe(nameBFingerprint);
  });

  it("identical metadata produces identical fingerprint (stable hashing — anti-flake)", () => {
    // Defensive: confirms the new fields don't introduce timestamp-based
    // non-determinism (e.g. Date.toISOString() of the same Date is stable).
    const fp1 = generateDealFingerprint(
      buildDeal({
        documents: [
          buildBaseDocument({
            sourceDate: new Date("2026-03-14"),
            receivedAt: new Date("2026-03-15"),
            sourceAuthor: "CFO",
            sourceSubject: "Q1",
            corpusParentDocumentId: "doc_parent",
          }),
        ] as never,
      })
    );
    const fp2 = generateDealFingerprint(
      buildDeal({
        documents: [
          buildBaseDocument({
            sourceDate: new Date("2026-03-14"),
            receivedAt: new Date("2026-03-15"),
            sourceAuthor: "CFO",
            sourceSubject: "Q1",
            corpusParentDocumentId: "doc_parent",
          }),
        ] as never,
      })
    );
    expect(fp1).toBe(fp2);
  });
});
