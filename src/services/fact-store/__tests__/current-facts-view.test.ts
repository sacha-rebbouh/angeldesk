import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  factEventFindMany: vi.fn(),
  documentFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRaw: mocks.executeRaw,
    $queryRaw: mocks.queryRaw,
    factEvent: {
      findMany: mocks.factEventFindMany,
    },
    document: {
      findMany: mocks.documentFindMany,
    },
  },
}));

describe("current facts materialized view coordination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("dedupes concurrent refreshes into a single SQL refresh", async () => {
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    mocks.executeRaw.mockImplementation(() => refreshGate);
    mocks.documentFindMany.mockResolvedValue([]);

    const { refreshCurrentFactsView } = await import("../current-facts");

    const firstRefresh = refreshCurrentFactsView();
    const secondRefresh = refreshCurrentFactsView();

    await Promise.resolve();
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);

    releaseRefresh();
    await Promise.all([firstRefresh, secondRefresh]);
  });

  it("waits for an in-flight refresh before reading from the materialized view", async () => {
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    mocks.executeRaw.mockImplementation(() => refreshGate);
    mocks.queryRaw.mockResolvedValue([
      {
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
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: "system",
      },
    ]);
    mocks.documentFindMany.mockResolvedValue([]);

    const { getCurrentFactsFromView, refreshCurrentFactsView } = await import("../current-facts");

    const refreshPromise = refreshCurrentFactsView();
    const readPromise = getCurrentFactsFromView("deal_1");

    await Promise.resolve();
    expect(mocks.queryRaw).not.toHaveBeenCalled();

    releaseRefresh();
    await refreshPromise;

    const facts = await readPromise;
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.factKey).toBe("financial.arr");
  });

  it("falls back to computed facts when the materialized view points to a superseded source document", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        id: "event_1",
        dealId: "deal_1",
        factKey: "financial.arr",
        category: "FINANCIAL",
        value: 1000000,
        displayValue: "1M EUR",
        unit: null,
        source: "PITCH_DECK",
        sourceDocumentId: "doc_old",
        sourceConfidence: 90,
        truthConfidence: 90,
        extractedText: null,
        sourceMetadata: null,
        validAt: null,
        periodType: null,
        periodLabel: null,
        reliability: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: "system",
      },
    ]);
    mocks.documentFindMany.mockResolvedValue([{ id: "doc_old" }]);
    mocks.factEventFindMany.mockResolvedValue([]);

    const { getCurrentFactsFromView } = await import("../current-facts");

    const facts = await getCurrentFactsFromView("deal_1");

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.documentFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.factEventFindMany).toHaveBeenCalledTimes(1);
    expect(facts).toEqual([]);
  });
});
