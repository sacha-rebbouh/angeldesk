import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  dealFindFirst: vi.fn(),
  redFlagFindFirst: vi.fn(),
  getRunningAnalysisForDeal: vi.fn(),
  isPendingThesisReview: vi.fn(),
  ingestTextCorpusItem: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/sanitize", () => ({
  checkRateLimitDistributed: mocks.rateLimit,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirst },
    redFlag: { findFirst: mocks.redFlagFindFirst },
  },
}));

vi.mock("@/services/analysis/guards", () => ({
  getRunningAnalysisForDeal: mocks.getRunningAnalysisForDeal,
  isPendingThesisReview: mocks.isPendingThesisReview,
}));

vi.mock("@/services/documents/text-ingestion", async () => {
  const actual = await vi.importActual<typeof import("@/services/documents/text-ingestion")>(
    "@/services/documents/text-ingestion"
  );
  return {
    ...actual,
    ingestTextCorpusItem: mocks.ingestTextCorpusItem,
  };
});

const { POST } = await import("../route");

const dealId = "ckdeal000000000000000000aa";
const redFlagId = "ckredflag00000000000000000";
const userId = "ckuser0000000000000000000a";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/documents/text", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: userId });
  mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetIn: 60 });
  mocks.dealFindFirst.mockResolvedValue({ id: dealId });
  mocks.redFlagFindFirst.mockResolvedValue({ id: redFlagId });
  mocks.getRunningAnalysisForDeal.mockResolvedValue(null);
  mocks.isPendingThesisReview.mockReturnValue(false);
  mocks.ingestTextCorpusItem.mockResolvedValue({
    kind: "created",
    document: {
      id: "doc_1",
      dealId,
      name: "Re: churn",
      type: "OTHER",
      sourceKind: "EMAIL",
      corpusRole: "GENERAL",
      sourceDate: new Date("2026-04-24T08:00:00.000Z"),
      receivedAt: null,
      sourceAuthor: null,
      sourceSubject: "Re: churn",
      linkedQuestionSource: null,
      linkedQuestionText: null,
      linkedRedFlagId: null,
      processingStatus: "COMPLETED",
      extractionQuality: 100,
      mimeType: "text/markdown",
      uploadedAt: new Date("2026-04-28T12:00:00.000Z"),
    },
    extractionRunId: "run_1",
  });
});

// ---------------------------------------------------------------------------

describe("POST /api/documents/text — happy paths", () => {
  it("creates an email piece and returns 201 with the canonical shape", async () => {
    const response = await POST(
      buildRequest({
        dealId,
        sourceKind: "EMAIL",
        subject: "Re: churn",
        sentAt: "2026-04-24T08:00:00.000Z",
        body: "Update on churn metrics.",
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data.id).toBe("doc_1");
    expect(payload.data.sourceKind).toBe("EMAIL");
    expect(payload.data.corpusRole).toBe("GENERAL");
    expect(payload.data.processingStatus).toBe("COMPLETED");
    expect(payload.data.mimeType).toBe("text/markdown");
    expect(payload.data.extractionRunId).toBe("run_1");
    expect(mocks.ingestTextCorpusItem).toHaveBeenCalledOnce();
  });

  it("forwards a NOTE payload with linkedQuestion to the ingestion service", async () => {
    mocks.ingestTextCorpusItem.mockResolvedValueOnce({
      kind: "created",
      document: {
        id: "doc_note",
        dealId,
        name: "Note",
        type: "OTHER",
        sourceKind: "NOTE",
        corpusRole: "DILIGENCE_RESPONSE",
        sourceDate: new Date("2026-04-22T15:00:00.000Z"),
        receivedAt: null,
        sourceAuthor: null,
        sourceSubject: null,
        linkedQuestionSource: "RED_FLAG",
        linkedQuestionText: "Why churn?",
        linkedRedFlagId: redFlagId,
        processingStatus: "COMPLETED",
        extractionQuality: 100,
        mimeType: "text/markdown",
        uploadedAt: new Date("2026-04-28T12:00:00.000Z"),
      },
      extractionRunId: "run_note",
    });

    const response = await POST(
      buildRequest({
        dealId,
        sourceKind: "NOTE",
        occurredAt: "2026-04-22T15:00:00.000Z",
        body: "Founder said churn was driven by onboarding regression.",
        linkedQuestion: { source: "RED_FLAG", redFlagId, questionText: "Why churn?" },
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.redFlagFindFirst).toHaveBeenCalledWith({
      where: { id: redFlagId, dealId, deal: { userId } },
      select: { id: true },
    });
    expect(payload.data.corpusRole).toBe("DILIGENCE_RESPONSE");
    expect(payload.data.linkedRedFlagId).toBe(redFlagId);
  });
});

describe("POST /api/documents/text — auth + rate limit", () => {
  it("returns 429 when the rate limit is exceeded", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetIn: 42 });
    const response = await POST(
      buildRequest({ dealId, sourceKind: "EMAIL", body: "x" }) as never
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(mocks.ingestTextCorpusItem).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/documents/text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }) as never
    );
    expect(response.status).toBe(400);
    expect(mocks.ingestTextCorpusItem).not.toHaveBeenCalled();
  });

  it("returns 400 with Zod issues on schema violation", async () => {
    const response = await POST(
      buildRequest({ dealId, sourceKind: "EMAIL" /* missing body */ }) as never
    );
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.error).toBe("Validation error");
    expect(Array.isArray(payload.issues)).toBe(true);
    expect(mocks.ingestTextCorpusItem).not.toHaveBeenCalled();
  });

  it("returns 400 when the public payload tries to set corpusRole", async () => {
    const response = await POST(
      buildRequest({
        dealId,
        sourceKind: "EMAIL",
        body: "Body",
        corpusRole: "DILIGENCE_RESPONSE",
      }) as never
    );
    expect(response.status).toBe(400);
    expect(mocks.ingestTextCorpusItem).not.toHaveBeenCalled();
  });
});

describe("POST /api/documents/text — ownership + IDOR guards", () => {
  it("returns 404 when the deal does not belong to the user", async () => {
    mocks.dealFindFirst.mockResolvedValueOnce(null);
    const response = await POST(
      buildRequest({ dealId, sourceKind: "EMAIL", body: "Body" }) as never
    );
    expect(response.status).toBe(404);
    expect(mocks.ingestTextCorpusItem).not.toHaveBeenCalled();
  });

  it("returns 404 when linkedQuestion.redFlagId points to a foreign deal", async () => {
    mocks.redFlagFindFirst.mockResolvedValueOnce(null);
    const response = await POST(
      buildRequest({
        dealId,
        sourceKind: "EMAIL",
        body: "Body",
        linkedQuestion: { source: "RED_FLAG", redFlagId, questionText: "Why?" },
      }) as never
    );
    const payload = await response.json();
    expect(response.status).toBe(404);
    expect(payload.error).toContain("Linked red flag");
    expect(mocks.ingestTextCorpusItem).not.toHaveBeenCalled();
  });
});

describe("POST /api/documents/text — corpus state guards", () => {
  it("returns 409 when an analysis is running on the deal", async () => {
    mocks.getRunningAnalysisForDeal.mockResolvedValueOnce({
      id: "analysis_running",
      dealId,
      mode: "FULL",
      status: "RUNNING",
      thesisId: "thesis_1",
      thesisDecision: null,
      createdAt: new Date(),
    });
    const response = await POST(
      buildRequest({ dealId, sourceKind: "EMAIL", body: "Body" }) as never
    );
    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload.pendingAnalysisId).toBe("analysis_running");
    expect(mocks.ingestTextCorpusItem).not.toHaveBeenCalled();
  });

  it("returns 409 when the ingestion service detects a duplicate", async () => {
    mocks.ingestTextCorpusItem.mockResolvedValueOnce({
      kind: "duplicate",
      existingDocumentId: "doc_existing",
      existingDocumentName: "Re: churn",
      sameDeal: true,
    });
    const response = await POST(
      buildRequest({ dealId, sourceKind: "EMAIL", body: "Body" }) as never
    );
    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload.existingDocument.id).toBe("doc_existing");
    expect(payload.existingDocument.sameDeal).toBe(true);
  });
});
