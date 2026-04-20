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
