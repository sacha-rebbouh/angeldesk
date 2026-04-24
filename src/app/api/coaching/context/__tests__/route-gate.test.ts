import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  evaluateDealCorpusReadinessSoft: vi.fn(),
  compileDealContext: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));

vi.mock("@/lib/sanitize", () => ({ isValidCuid: vi.fn(() => true) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirst },
  },
}));

vi.mock("@/lib/live/context-compiler", () => ({
  compileDealContext: mocks.compileDealContext,
}));

vi.mock("@/services/documents/readiness-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/documents/readiness-gate")>();
  return {
    ...actual,
    evaluateDealCorpusReadinessSoft: mocks.evaluateDealCorpusReadinessSoft,
  };
});

vi.mock("@/lib/api-error", () => ({
  handleApiError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

const { GET } = await import("../route");

describe("GET /api/coaching/context - ARC-LIGHT soft-gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.dealFindFirst.mockResolvedValue({ id: "clmdeal00000000000000000", userId: "user_1" });
  });

  it("returns corpusSkipped=true on toxic corpus instead of 409, and never compiles the context", async () => {
    mocks.evaluateDealCorpusReadinessSoft.mockResolvedValue({
      ready: false,
      reasonCode: "UNVERIFIED_ARTIFACT",
      readiness: null,
    });

    const req = new NextRequest(
      "http://localhost/api/coaching/context?dealId=clmdeal00000000000000000"
    );
    const response = await GET(req);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      data: null,
      corpusSkipped: true,
      reasonCode: "UNVERIFIED_ARTIFACT",
    });
    expect(mocks.compileDealContext).not.toHaveBeenCalled();
  });

  it("compiles the context when readiness passes", async () => {
    mocks.evaluateDealCorpusReadinessSoft.mockResolvedValue({
      ready: true,
      reasonCode: null,
      readiness: null,
    });
    mocks.compileDealContext.mockResolvedValue({ compiled: "ok" });

    const req = new NextRequest(
      "http://localhost/api/coaching/context?dealId=clmdeal00000000000000000"
    );
    const response = await GET(req);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ data: { compiled: "ok" } });
    expect(mocks.compileDealContext).toHaveBeenCalledWith("clmdeal00000000000000000");
  });
});
