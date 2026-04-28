import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  documentFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: mocks.documentFindFirst,
    },
  },
}));

const { checkDuplicateDocument, computeContentHash } = await import("../document-hash");

describe("document-hash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-04-28T10:00:00.000Z"));
  });

  it("computes stable SHA-256 hashes", () => {
    expect(computeContentHash(Buffer.from("angel-desk"))).toBe(
      "ab01f82ec63ed98fc87558ca1ed428e1237efb20a6e4b145a56dd2587dfbafe6"
    );
  });

  it("ignores failed documents and stale processing documents when checking duplicates", async () => {
    mocks.documentFindFirst.mockResolvedValue(null);

    await checkDuplicateDocument("hash_1", "deal_1", "user_1");

    expect(mocks.documentFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contentHash: "hash_1",
        deal: { userId: "user_1" },
        OR: [
          { processingStatus: { notIn: ["FAILED", "PROCESSING"] } },
          {
            processingStatus: "PROCESSING",
            uploadedAt: { gt: new Date("2026-04-28T09:40:00.000Z") },
          },
        ],
      }),
    }));
  });

  it("returns duplicate metadata for active documents", async () => {
    mocks.documentFindFirst.mockResolvedValue({
      id: "doc_1",
      name: "deck.pdf",
      dealId: "deal_1",
      uploadedAt: new Date("2026-04-28T09:59:00.000Z"),
      deal: { name: "Deal 1" },
    });

    const result = await checkDuplicateDocument("hash_1", "deal_1", "user_1");

    expect(result).toEqual({
      isDuplicate: true,
      sameDeal: true,
      existingDocument: {
        id: "doc_1",
        name: "deck.pdf",
        dealId: "deal_1",
        dealName: "Deal 1",
        uploadedAt: new Date("2026-04-28T09:59:00.000Z"),
      },
    });
  });
});
