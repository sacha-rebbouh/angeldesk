import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  factEventFindMany: vi.fn(),
  documentFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    factEvent: {
      findMany: mocks.factEventFindMany,
    },
    document: {
      findMany: mocks.documentFindMany,
    },
  },
}));

function makeFactEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event_1",
    dealId: "deal_1",
    factKey: "financial.arr",
    category: "FINANCIAL",
    value: 1000000,
    displayValue: "1M EUR",
    unit: null,
    source: "PITCH_DECK",
    sourceDocumentId: null,
    sourceConfidence: 90,
    truthConfidence: 90,
    extractedText: null,
    sourceMetadata: null,
    validAt: null,
    periodType: null,
    periodLabel: null,
    reliability: null,
    eventType: "CREATED",
    supersedesEventId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: "system",
    reason: null,
    ...overrides,
  };
}

describe("getCurrentFacts source document freshness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("skips a current event whose source document is no longer latest", async () => {
    mocks.factEventFindMany.mockResolvedValue([
      makeFactEvent({
        id: "event_stale",
        sourceDocumentId: "doc_old",
      }),
    ]);
    mocks.documentFindMany.mockResolvedValue([{ id: "doc_old" }]);

    const { getCurrentFacts } = await import("../current-facts");
    const facts = await getCurrentFacts("deal_1");

    expect(facts).toEqual([]);
  });

  it("falls back to the next eligible event when a newer document-backed fact became stale", async () => {
    mocks.factEventFindMany.mockResolvedValue([
      makeFactEvent({
        id: "event_new_stale",
        sourceDocumentId: "doc_old",
        displayValue: "1.2M EUR",
        value: 1200000,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      }),
      makeFactEvent({
        id: "event_old_live",
        sourceDocumentId: "doc_live",
        displayValue: "1M EUR",
        value: 1000000,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ]);
    mocks.documentFindMany.mockResolvedValue([{ id: "doc_old" }]);

    const { getCurrentFacts } = await import("../current-facts");
    const facts = await getCurrentFacts("deal_1");

    expect(facts).toHaveLength(1);
    expect(facts[0]?.currentValue).toBe(1000000);
    expect(facts[0]?.currentDisplayValue).toBe("1M EUR");
  });

  it("keeps facts that are not tied to a document", async () => {
    mocks.factEventFindMany.mockResolvedValue([
      makeFactEvent({
        id: "event_no_doc",
        sourceDocumentId: null,
        source: "BA_OVERRIDE",
      }),
    ]);
    mocks.documentFindMany.mockResolvedValue([]);

    const { getCurrentFacts } = await import("../current-facts");
    const facts = await getCurrentFacts("deal_1");

    expect(facts).toHaveLength(1);
    expect(facts[0]?.currentSource).toBe("BA_OVERRIDE");
  });

  it("canonicalizes legacy alias fact keys when reading current facts", async () => {
    mocks.factEventFindMany.mockResolvedValue([
      makeFactEvent({
        id: "event_alias",
        factKey: "competition.competitor_count",
        category: "COMPETITION",
        value: 3,
        displayValue: "3",
      }),
    ]);
    mocks.documentFindMany.mockResolvedValue([]);

    const { getCurrentFacts } = await import("../current-facts");
    const facts = await getCurrentFacts("deal_1");

    expect(facts).toHaveLength(1);
    expect(facts[0]?.factKey).toBe("competition.competitors_count");
    expect(facts[0]?.category).toBe("COMPETITION");
  });

  it("drops structurally invalid scalar facts already polluted in the event store", async () => {
    mocks.factEventFindMany.mockResolvedValue([
      makeFactEvent({
        id: "event_market_tam",
        factKey: "market.tam",
        category: "MARKET",
        value: { validated: 195000000 },
        displayValue: "[object Object]",
      }),
    ]);
    mocks.documentFindMany.mockResolvedValue([]);

    const { getCurrentFacts } = await import("../current-facts");
    const facts = await getCurrentFacts("deal_1");

    expect(facts).toEqual([]);
  });

  it("drops semantically invalid historical facts that fail the quality gate", async () => {
    mocks.factEventFindMany.mockResolvedValue([
      makeFactEvent({
        id: "event_revenue_currency",
        factKey: "financial.revenue",
        category: "FINANCIAL",
        value: 241379,
        unit: "EUR",
        displayValue: "2.8M NOK",
        extractedText: "€2.8m Revenue (2026)",
      }),
      makeFactEvent({
        id: "event_traction",
        factKey: "traction.mau",
        category: "TRACTION",
        value: 81.6,
        displayValue: "81.6%",
        extractedText: "81.6% Current Occupancy",
      }),
    ]);
    mocks.documentFindMany.mockResolvedValue([]);

    const { getCurrentFacts } = await import("../current-facts");
    const facts = await getCurrentFacts("deal_1");

    expect(facts).toEqual([]);
  });
});
