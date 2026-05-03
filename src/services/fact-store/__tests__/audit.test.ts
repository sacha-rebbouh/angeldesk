import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  refreshCurrentFactsView: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    factEvent: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      update: mocks.update,
      create: mocks.create,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../current-facts", async () => {
  const actual = await vi.importActual<typeof import("../current-facts")>("../current-facts");
  return {
    ...actual,
    refreshCurrentFactsView: mocks.refreshCurrentFactsView,
  };
});

const { listSuspiciousCurrentFacts, quarantineSuspiciousCurrentFacts } = await import("../audit");

describe("fact-store audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshCurrentFactsView.mockResolvedValue(undefined);
  });

  it("flags severe and non-severe suspicious current facts", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "evt_structured",
        dealId: "deal_1",
        factKey: "market.tam",
        category: "MARKET",
        value: { claimed: 1_000_000_000 },
        displayValue: "[object Object]",
        unit: null,
        source: "CONTEXT_ENGINE",
        sourceDocumentId: null,
        sourceConfidence: 70,
        truthConfidence: null,
        extractedText: "TAM estimated at [object Object]",
        sourceMetadata: null,
        validAt: null,
        periodType: null,
        periodLabel: null,
        reliability: null,
        eventType: "CREATED",
        supersedesEventId: null,
        createdAt: new Date("2026-04-20T10:00:00.000Z"),
        createdBy: "system",
        reason: null,
      },
      {
        id: "evt_alias",
        dealId: "deal_1",
        factKey: "competition.competitor_count",
        category: "COMPETITION",
        value: 2,
        displayValue: "2 competitors",
        unit: null,
        source: "PITCH_DECK",
        sourceDocumentId: "doc_1",
        sourceConfidence: 80,
        truthConfidence: 50,
        extractedText: "2 main competitors",
        sourceMetadata: null,
        validAt: null,
        periodType: null,
        periodLabel: null,
        reliability: { reliability: "DECLARED" },
        eventType: "CREATED",
        supersedesEventId: null,
        createdAt: new Date("2026-04-20T09:00:00.000Z"),
        createdBy: "system",
        reason: null,
      },
      {
        id: "evt_traction",
        dealId: "deal_2",
        factKey: "traction.customers_count",
        category: "TRACTION",
        value: 4000,
        displayValue: "4,000 units",
        unit: null,
        source: "PITCH_DECK",
        sourceDocumentId: "doc_2",
        sourceConfidence: 82,
        truthConfidence: 55,
        extractedText: "4,000 sqm Storage Units",
        sourceMetadata: null,
        validAt: null,
        periodType: null,
        periodLabel: null,
        reliability: { reliability: "DECLARED" },
        eventType: "CREATED",
        supersedesEventId: null,
        createdAt: new Date("2026-04-20T08:00:00.000Z"),
        createdBy: "system",
        reason: null,
      },
    ]);

    const result = await listSuspiciousCurrentFacts();

    expect(result.scannedDeals).toBe(2);
    expect(result.scannedCurrentFacts).toBe(3);
    expect(result.candidates).toHaveLength(3);
    expect(result.issueCounts.STRUCTURED_VALUE_FOR_SCALAR_KEY).toBe(1);
    expect(result.issueCounts.DISPLAY_VALUE_OBJECT_COLLAPSE).toBe(1);
    expect(result.issueCounts.LEGACY_ALIAS_FACT_KEY).toBe(1);
    expect(result.issueCounts.TRACTION_CUSTOMER_USER_SEMANTIC_MISMATCH).toBe(1);
    expect(result.candidates.find((candidate) => candidate.eventId === "evt_alias")?.autoQuarantineRecommended).toBe(false);
    expect(result.candidates.find((candidate) => candidate.eventId === "evt_structured")?.autoQuarantineRecommended).toBe(true);
  });

  it("quarantines only auto-quarantinable current facts", async () => {
    const currentEvent = {
      id: "evt_traction",
      dealId: "deal_1",
      factKey: "traction.customers_count",
      category: "TRACTION",
      value: 4000,
      displayValue: "4,000 units",
      unit: null,
      source: "PITCH_DECK",
      sourceDocumentId: "doc_2",
      sourceConfidence: 82,
      truthConfidence: 55,
      extractedText: "4,000 sqm Storage Units",
      sourceMetadata: null,
      validAt: null,
      periodType: null,
      periodLabel: null,
      reliability: { reliability: "DECLARED" },
      eventType: "CREATED",
      supersedesEventId: null,
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
      createdBy: "system",
      reason: null,
    };

    mocks.findMany
      .mockResolvedValueOnce([currentEvent])
      .mockResolvedValueOnce([]);
    mocks.findUnique.mockResolvedValue(currentEvent);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<boolean>) =>
      callback({
        factEvent: {
          findUnique: mocks.findUnique,
          update: mocks.update,
          create: mocks.create,
        },
      })
    );
    mocks.update.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue(undefined);

    const result = await quarantineSuspiciousCurrentFacts({ dryRun: false });

    expect(result.targetedCount).toBe(1);
    expect(result.remainingTargetedCount).toBe(0);
    expect(result.quarantinedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.iterations).toBe(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.refreshCurrentFactsView).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        eventType: "PENDING_REVIEW",
        supersedesEventId: "evt_traction",
      },
    });
  });
});
