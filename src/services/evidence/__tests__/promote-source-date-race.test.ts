/**
 * Phase 3.1 — Unit tests for promoteSourceDateFromSignals race-safety + scope filter.
 * (Codex round 9 P1 + P2 follow-ups.)
 *
 * Mocks Prisma to force the exact race scenarios that integration tests
 * cannot reliably exercise.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signalFindMany: vi.fn(),
  documentFindUnique: vi.fn(),
  documentUpdateMany: vi.fn(),
}));

const fakePrisma = {
  evidenceSignal: { findMany: mocks.signalFindMany },
  document: {
    findUnique: mocks.documentFindUnique,
    updateMany: mocks.documentUpdateMany,
  },
} as never;

const { promoteSourceDateFromSignals } = await import("../promote-source-date");

const baseCandidate = {
  id: "sig_1",
  kind: "CAP_TABLE_AS_OF" as const,
  asOfDate: new Date("2024-09-18T00:00:00Z"),
  precision: "DAY" as const,
  extractorVersion: "test@v1",
  signalScopeKey: "run:cabc123",
  createdAt: new Date("2026-05-18T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Codex round 9 P1 — race-safe promotion via atomic updateMany", () => {
  it("happy path: updateMany.count=1 → promoted=true", async () => {
    mocks.signalFindMany.mockResolvedValue([baseCandidate]);
    mocks.documentFindUnique.mockResolvedValue({ sourceDate: null, sourceMetadata: null });
    mocks.documentUpdateMany.mockResolvedValue({ count: 1 });

    const outcome = await promoteSourceDateFromSignals(fakePrisma, {
      documentId: "doc_1",
      dealId: "deal_1",
      documentType: "CAP_TABLE",
      currentSourceDate: null,
    });

    expect(outcome).toMatchObject({
      promoted: true,
      newSourceDate: baseCandidate.asOfDate,
      signalId: "sig_1",
      kind: "CAP_TABLE_AS_OF",
    });

    // Verify the atomic WHERE clause includes sourceDate: null (race guard).
    expect(mocks.documentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "doc_1",
          dealId: "deal_1",
          sourceDate: null,
        }),
      })
    );
  });

  it("race scenario: concurrent writer set sourceDate between findUnique and updateMany → count=0 → promoted=false", async () => {
    mocks.signalFindMany.mockResolvedValue([baseCandidate]);
    // findUnique sees sourceDate=null (pre-race)
    mocks.documentFindUnique.mockResolvedValue({ sourceDate: null, sourceMetadata: null });
    // updateMany sees sourceDate=non-null due to concurrent writer
    // (the WHERE clause filters our row out) → count: 0
    mocks.documentUpdateMany.mockResolvedValue({ count: 0 });

    const outcome = await promoteSourceDateFromSignals(fakePrisma, {
      documentId: "doc_race",
      dealId: "deal_1",
      documentType: "CAP_TABLE",
      currentSourceDate: null,
    });

    expect(outcome).toEqual({
      promoted: false,
      reason: "source_date_already_set",
    });
    // updateMany WAS called (we tried), but the WHERE clause protected us.
    expect(mocks.documentUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("currentSourceDate passed = early bail (no DB read)", async () => {
    const outcome = await promoteSourceDateFromSignals(fakePrisma, {
      documentId: "doc_1",
      dealId: "deal_1",
      documentType: "CAP_TABLE",
      currentSourceDate: new Date("2024-01-01T00:00:00Z"),
    });
    expect(outcome).toEqual({ promoted: false, reason: "source_date_already_set" });
    expect(mocks.signalFindMany).not.toHaveBeenCalled();
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });

  it("findUnique returns sourceDate set (between find + update) → bail before update", async () => {
    mocks.signalFindMany.mockResolvedValue([baseCandidate]);
    mocks.documentFindUnique.mockResolvedValue({
      sourceDate: new Date("2024-12-31T00:00:00Z"),
      sourceMetadata: null,
    });

    const outcome = await promoteSourceDateFromSignals(fakePrisma, {
      documentId: "doc_1",
      dealId: "deal_1",
      documentType: "CAP_TABLE",
      currentSourceDate: null,
    });
    expect(outcome).toEqual({ promoted: false, reason: "source_date_already_set" });
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });
});

describe("Codex round 9 P2 — promotion scope filter is strict {run:*, source_metadata}", () => {
  it("findMany is called with OR [startsWith: 'run:', equals: 'source_metadata']", async () => {
    mocks.signalFindMany.mockResolvedValue([]);
    await promoteSourceDateFromSignals(fakePrisma, {
      documentId: "doc_1",
      dealId: "deal_1",
      documentType: "CAP_TABLE",
      currentSourceDate: null,
    });
    expect(mocks.signalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { signalScopeKey: { startsWith: "run:" } },
            { signalScopeKey: "source_metadata" },
          ],
        }),
      })
    );
  });

  it("findMany filter excludes 'filename' implicitly via OR list (only run:* and source_metadata pass)", async () => {
    // The query itself only allows run:* and source_metadata.
    // human:* and import:* are NOT in the OR list — so they cannot be picked.
    mocks.signalFindMany.mockResolvedValue([]);
    await promoteSourceDateFromSignals(fakePrisma, {
      documentId: "doc_1",
      dealId: "deal_1",
      documentType: "CAP_TABLE",
      currentSourceDate: null,
    });
    const where = (mocks.signalFindMany.mock.calls[0]?.[0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toHaveLength(2);
    // No clause for "human:*" or "import:*" anywhere.
    const whereJson = JSON.stringify(where);
    expect(whereJson).not.toContain("human:");
    expect(whereJson).not.toContain("import:");
    expect(whereJson).not.toContain("filename");
  });
});

describe("metadata patch (Codex round 8 trace)", () => {
  it("preserves existing sourceMetadata keys when adding the temporal trace", async () => {
    mocks.signalFindMany.mockResolvedValue([baseCandidate]);
    mocks.documentFindUnique.mockResolvedValue({
      sourceDate: null,
      sourceMetadata: { inferredFrom: "uploaded_file_text", custom: "preserved" },
    });
    mocks.documentUpdateMany.mockResolvedValue({ count: 1 });

    await promoteSourceDateFromSignals(fakePrisma, {
      documentId: "doc_1",
      dealId: "deal_1",
      documentType: "CAP_TABLE",
      currentSourceDate: null,
    });

    const call = mocks.documentUpdateMany.mock.calls[0][0] as { data: { sourceMetadata: Record<string, unknown> } };
    const meta = call.data.sourceMetadata;
    expect(meta.inferredFrom).toBe("uploaded_file_text");
    expect(meta.custom).toBe("preserved");
    expect(meta.temporal).toMatchObject({
      promotedBy: "evidence-engine-phase3",
      kind: "CAP_TABLE_AS_OF",
      confidence: "HIGH",
      evidenceSignalId: "sig_1",
    });
  });
});
