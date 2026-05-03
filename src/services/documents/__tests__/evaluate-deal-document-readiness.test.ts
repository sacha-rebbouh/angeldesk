import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  documentFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findMany: mocks.documentFindMany,
    },
  },
}));

const { evaluateDealDocumentReadiness } = await import("../extraction-runs");

interface FakePage {
  pageNumber: number;
  status?: string;
  artifact?: unknown;
  charCount?: number;
  qualityScore?: number | null;
  hasTables?: boolean;
  hasCharts?: boolean;
  hasFinancialKeywords?: boolean;
  hasMarketKeywords?: boolean;
  hasTeamKeywords?: boolean;
  errorMessage?: string | null;
}

interface FakeDocumentOptions {
  documentId?: string;
  documentName?: string;
  runId?: string;
  readyForAnalysis?: boolean;
  status?: string;
  blockedReason?: string | null;
  pages?: FakePage[];
  overrides?: Array<{ pageNumber?: number; approvedAt?: Date | null }>;
  noRun?: boolean;
}

function makeFakeDocument(options: FakeDocumentOptions = {}) {
  const {
    documentId = "doc_1",
    documentName = "e4n-deck.pdf",
    runId = "run_1",
    readyForAnalysis = true,
    status = "READY_WITH_WARNINGS",
    blockedReason = null,
    pages = [],
    overrides = [],
    noRun = false,
  } = options;

  return {
    id: documentId,
    name: documentName,
    type: "PITCH_DECK",
    mimeType: "application/pdf",
    processingStatus: "COMPLETED",
    extractionQuality: 70,
    extractionRuns: noRun
      ? []
      : [
          {
            id: runId,
            status,
            readyForAnalysis,
            blockedReason,
            pages: pages.map((page) => ({
              pageNumber: page.pageNumber,
              status: page.status ?? "READY",
              charCount: page.charCount ?? 500,
              qualityScore: page.qualityScore ?? 80,
              hasTables: page.hasTables ?? false,
              hasCharts: page.hasCharts ?? false,
              hasFinancialKeywords: page.hasFinancialKeywords ?? false,
              hasMarketKeywords: page.hasMarketKeywords ?? false,
              hasTeamKeywords: page.hasTeamKeywords ?? false,
              errorMessage: page.errorMessage ?? null,
              artifact: page.artifact ?? {},
            })),
            overrides,
          },
        ],
  };
}

describe("evaluateDealDocumentReadiness (toxic-artifact gate)", () => {
  const originalFlag = process.env.EXTRACTION_STRICT_READINESS;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EXTRACTION_STRICT_READINESS; // default: strict ON
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.EXTRACTION_STRICT_READINESS;
    } else {
      process.env.EXTRACTION_STRICT_READINESS = originalFlag;
    }
  });

  it("blocks when a READY_WITH_WARNINGS run has a page with heuristic_fallback (the e4n angle mort)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      makeFakeDocument({
        readyForAnalysis: true,
        status: "READY_WITH_WARNINGS",
        pages: [
          {
            pageNumber: 16,
            status: "READY_WITH_WARNINGS",
            artifact: {
              verification: {
                state: "heuristic_fallback",
                evidence: ["legacy_text_fallback"],
              },
            },
          },
        ],
      }),
    ]);

    const result = await evaluateDealDocumentReadiness("deal_1");

    expect(result.ready).toBe(false);
    const codes = result.blockers.map((b) => b.code);
    expect(codes).toContain("UNVERIFIED_ARTIFACT");
    expect(codes).not.toContain("EXTRACTION_BLOCKED");
    const blocker = result.blockers.find((b) => b.code === "UNVERIFIED_ARTIFACT");
    expect(blocker?.pageNumber).toBe(16);
    expect(blocker?.canBypass).toBe(false);
    expect(blocker?.message).toContain("heuristic_fallback");
  });

  it("blocks on parse_failed state", async () => {
    mocks.documentFindMany.mockResolvedValue([
      makeFakeDocument({
        pages: [{ pageNumber: 1, artifact: { verification: { state: "parse_failed" } } }],
      }),
    ]);

    const result = await evaluateDealDocumentReadiness("deal_1");

    expect(result.ready).toBe(false);
    expect(result.blockers.some((b) => b.code === "UNVERIFIED_ARTIFACT")).toBe(true);
  });

  it("does not block READY native pages only because verification.state is unverified", async () => {
    mocks.documentFindMany.mockResolvedValue([
      makeFakeDocument({
        pages: [{ pageNumber: 1, status: "READY", artifact: { verification: { state: "unverified" } } }],
      }),
    ]);

    const result = await evaluateDealDocumentReadiness("deal_1");

    expect(result.ready).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("lets native-legacy pages pass (no verification.state present)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      makeFakeDocument({
        pages: [{ pageNumber: 1, artifact: { text: "some legacy text" } }],
      }),
    ]);

    const result = await evaluateDealDocumentReadiness("deal_1");

    expect(result.ready).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("lets provider_structured pages pass", async () => {
    mocks.documentFindMany.mockResolvedValue([
      makeFakeDocument({
        pages: [{ pageNumber: 1, artifact: { verification: { state: "provider_structured" } } }],
      }),
    ]);

    const result = await evaluateDealDocumentReadiness("deal_1");

    expect(result.ready).toBe(true);
  });

  it("does not double-signal a page that is already in unresolvedPages (FAILED status is unconditional blocker)", async () => {
    mocks.documentFindMany.mockResolvedValue([
      makeFakeDocument({
        readyForAnalysis: false,
        status: "BLOCKED",
        pages: [
          { pageNumber: 16, status: "FAILED", artifact: { verification: { state: "heuristic_fallback" } } },
        ],
      }),
    ]);

    const result = await evaluateDealDocumentReadiness("deal_1");

    expect(result.ready).toBe(false);
    const p16Blockers = result.blockers.filter((b) => b.pageNumber === 16);
    expect(p16Blockers).toHaveLength(1);
    expect(p16Blockers[0].code).toBe("PAGE_REQUIRES_REVIEW");
  });

  it("emits EXTRACTION_BLOCKED only when no page-level blocker explains the block", async () => {
    mocks.documentFindMany.mockResolvedValue([
      makeFakeDocument({
        readyForAnalysis: false,
        status: "BLOCKED",
        blockedReason: "corpus-level error",
        pages: [
          { pageNumber: 1, status: "READY", artifact: { verification: { state: "provider_structured" } } },
        ],
      }),
    ]);

    const result = await evaluateDealDocumentReadiness("deal_1");

    expect(result.ready).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("EXTRACTION_BLOCKED");
  });

  it("falls back silently when strict flag is disabled", async () => {
    process.env.EXTRACTION_STRICT_READINESS = "false";
    mocks.documentFindMany.mockResolvedValue([
      makeFakeDocument({
        pages: [{ pageNumber: 16, artifact: { verification: { state: "heuristic_fallback" } } }],
      }),
    ]);

    const result = await evaluateDealDocumentReadiness("deal_1");

    expect(result.ready).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("still blocks on missing run regardless of flag", async () => {
    process.env.EXTRACTION_STRICT_READINESS = "false";
    mocks.documentFindMany.mockResolvedValue([makeFakeDocument({ noRun: true })]);

    const result = await evaluateDealDocumentReadiness("deal_1");

    expect(result.ready).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("STRICT_EXTRACTION_MISSING");
  });

  it("handles mixed documents: one toxic + one clean", async () => {
    mocks.documentFindMany.mockResolvedValue([
      makeFakeDocument({
        documentId: "doc_clean",
        documentName: "clean.pdf",
        runId: "run_clean",
        pages: [{ pageNumber: 1, artifact: { verification: { state: "provider_structured" } } }],
      }),
      makeFakeDocument({
        documentId: "doc_toxic",
        documentName: "toxic.pdf",
        runId: "run_toxic",
        pages: [
          {
            pageNumber: 3,
            artifact: {
              verification: {
                state: "heuristic_fallback",
                evidence: ["legacy_text_fallback"],
              },
            },
          },
        ],
      }),
    ]);

    const result = await evaluateDealDocumentReadiness("deal_1");

    expect(result.ready).toBe(false);
    const toxicBlocker = result.blockers.find((b) => b.documentId === "doc_toxic");
    expect(toxicBlocker?.code).toBe("UNVERIFIED_ARTIFACT");
    expect(result.blockers.some((b) => b.documentId === "doc_clean")).toBe(false);
  });
});
