import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findUnique: vi.fn(),
    },
    thesis: {
      findFirst: vi.fn(),
    },
    analysis: {
      findMany: vi.fn(),
    },
    liveSession: {
      findMany: vi.fn(),
    },
    document: {
      findMany: vi.fn(),
    },
    factEvent: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/services/analysis-results/load-results", () => ({
  loadResults: vi.fn(),
}));

vi.mock("@/services/corpus", () => ({
  getCorpusSnapshotDocumentIds: vi.fn(),
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFactsFromView: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { loadResults } from "@/services/analysis-results/load-results";
import { getCorpusSnapshotDocumentIds } from "@/services/corpus";
import { getCurrentFactsFromView } from "@/services/fact-store/current-facts";
import { compileDealContext } from "@/lib/live/context-compiler";

describe("compileDealContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.deal.findUnique).mockResolvedValue({
      id: "deal_1",
      name: "Legacy Deal Name",
      companyName: null,
      sector: "SaaS",
      stage: "SEED",
      arr: 1000,
      growthRate: 25,
      amountRequested: 500000,
      valuationPre: 4000000,
      geography: "France",
      description: "Legacy description",
      website: "https://legacy.example",
      globalScore: 78,
      teamScore: 80,
      marketScore: 76,
      productScore: 74,
      financialsScore: 72,
      redFlags: [],
      founders: [],
    } as never);

    vi.mocked(prisma.thesis.findFirst).mockResolvedValue({
      id: "thesis_1",
      dealId: "deal_1",
      verdict: "favorable",
      corpusSnapshotId: "snapshot_1",
    } as never);
    vi.mocked(prisma.analysis.findMany).mockResolvedValue([
      {
        id: "analysis_2",
        dealId: "deal_1",
        thesisId: null,
        corpusSnapshotId: "snapshot_legacy",
        completedAt: new Date("2026-04-20T10:00:00Z"),
        createdAt: new Date("2026-04-20T10:00:00Z"),
        negotiationStrategy: { summary: "Wrong latest analysis." },
      },
      {
        id: "analysis_1",
        dealId: "deal_1",
        thesisId: "thesis_1",
        corpusSnapshotId: "snapshot_1",
        completedAt: new Date("2026-04-19T10:00:00Z"),
        createdAt: new Date("2026-04-19T10:00:00Z"),
        negotiationStrategy: { summary: "Push on terms." },
      },
    ] as never);

    vi.mocked(prisma.liveSession.findMany).mockResolvedValue([]);

    vi.mocked(getCorpusSnapshotDocumentIds).mockResolvedValue(["doc_snapshot"]);
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      { id: "doc_snapshot", name: "Snapshot Deck.pdf", type: "PITCH_DECK" },
    ] as never);
    vi.mocked(prisma.factEvent.findMany).mockResolvedValue([
      {
        factKey: "financial.arr",
        displayValue: "ARR €1.2M",
        sourceDocumentId: "doc_snapshot",
      },
    ] as never);
    vi.mocked(getCurrentFactsFromView).mockResolvedValue([
      {
        dealId: "deal_1",
        factKey: "company.name",
        category: "OTHER",
        currentValue: "Canonical Snapshot Co",
        currentDisplayValue: "Canonical Snapshot Co",
        currentSource: "PITCH_DECK",
        currentConfidence: 95,
        currentTruthConfidence: 95,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
      {
        dealId: "deal_1",
        factKey: "other.website",
        category: "OTHER",
        currentValue: "https://canonical.example",
        currentDisplayValue: "https://canonical.example",
        currentSource: "CONTEXT_ENGINE",
        currentConfidence: 88,
        currentTruthConfidence: 70,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
      {
        dealId: "deal_1",
        factKey: "financial.arr",
        category: "FINANCIAL",
        currentValue: 1200000,
        currentDisplayValue: "€1.2M",
        currentSource: "DATA_ROOM",
        currentConfidence: 97,
        currentTruthConfidence: 97,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
      {
        dealId: "deal_1",
        factKey: "financial.amount_raising",
        category: "FINANCIAL",
        currentValue: 1500000,
        currentDisplayValue: "€1.5M",
        currentSource: "PITCH_DECK",
        currentConfidence: 90,
        currentTruthConfidence: 75,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
      {
        dealId: "deal_1",
        factKey: "financial.valuation_pre",
        category: "FINANCIAL",
        currentValue: 9000000,
        currentDisplayValue: "€9M",
        currentSource: "PITCH_DECK",
        currentConfidence: 90,
        currentTruthConfidence: 75,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-19T10:00:00Z"),
        lastUpdatedAt: new Date("2026-04-19T10:00:00Z"),
      },
    ] as never);

    vi.mocked(loadResults).mockResolvedValue({
      "synthesis-deal-scorer": {
        success: true,
        data: {
          overallScore: 91,
          dimensionScores: [
            { dimension: "Equipe", score: 83 },
            { dimension: "Marche", score: 79 },
            { dimension: "Produit", score: 77 },
            { dimension: "Financials", score: 75 },
          ],
        },
      },
    });
  });

  it("uses the analysis snapshot scope and canonical facts for live context", async () => {
    const context = await compileDealContext("deal_1");

    expect(prisma.thesis.findFirst).toHaveBeenCalledWith({
      where: { dealId: "deal_1", isLatest: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        dealId: true,
        verdict: true,
        corpusSnapshotId: true,
      },
    });
    expect(prisma.analysis.findMany).toHaveBeenCalledWith({
      where: { dealId: "deal_1", status: "COMPLETED" },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        dealId: true,
        mode: true,
        thesisId: true,
        corpusSnapshotId: true,
        completedAt: true,
        createdAt: true,
        negotiationStrategy: true,
      },
    });
    expect(getCorpusSnapshotDocumentIds).toHaveBeenCalledWith("snapshot_1");
    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["doc_snapshot"] } },
      select: { id: true, name: true, type: true },
    });
    expect(prisma.factEvent.findMany).toHaveBeenCalledWith({
      where: {
        dealId: "deal_1",
        eventType: "CREATED",
        sourceDocumentId: { in: ["doc_snapshot"] },
      },
      select: { factKey: true, displayValue: true, sourceDocumentId: true },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    expect(context.companyName).toBe("Canonical Snapshot Co");
    expect(context.dealBasics.website).toBe("https://canonical.example");
    expect(context.dealBasics.arr).toBe(1200000);
    expect(context.dealBasics.amountRequested).toBe(1500000);
    expect(context.dealBasics.valuationPre).toBe(9000000);
    expect(context.scores).toEqual({
      global: 91,
      team: 83,
      market: 79,
      product: 77,
      financials: 75,
    });
    expect(context.overallScore).toBe(91);
    expect(context.negotiationStrategy).toBe("Push on terms.");
    expect(context.documentSummaries).toEqual([
      {
        name: "Snapshot Deck.pdf",
        type: "PITCH_DECK",
        keyClaims: ["ARR €1.2M"],
      },
    ]);
  });
});
