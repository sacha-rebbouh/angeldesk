import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  redFlagFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirst },
    redFlag: { findMany: mocks.redFlagFindMany },
  },
}));

const { GET } = await import("../route");

const dealId = "ckdeal000000000000000000aa";
const userId = "ckuser0000000000000000000a";

function callGet(routeDealId: string = dealId) {
  return GET(new Request(`http://localhost/api/deals/${routeDealId}/questions`) as never, {
    params: Promise.resolve({ dealId: routeDealId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: userId });
  mocks.dealFindFirst.mockResolvedValue({ id: dealId });
});

describe("GET /api/deals/[dealId]/questions", () => {
  it("returns 400 on an invalid dealId format", async () => {
    const response = await callGet("not-a-cuid");
    expect(response.status).toBe(400);
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the deal is not owned by the requester (IDOR guard)", async () => {
    mocks.dealFindFirst.mockResolvedValueOnce(null);
    const response = await callGet();
    expect(response.status).toBe(404);
    expect(mocks.redFlagFindMany).not.toHaveBeenCalled();
  });

  it("emits one RED_FLAG entry per flag and one QUESTION_TO_ASK entry per chained question", async () => {
    mocks.redFlagFindMany.mockResolvedValueOnce([
      {
        id: "rf_1",
        title: "Churn jumped to 3.2% in Q1",
        severity: "HIGH",
        category: "FINANCIAL",
        questionsToAsk: ["Why churn?", "Which cohort?"],
      },
      {
        id: "rf_2",
        title: "  ", // whitespace title — skip the RED_FLAG entry
        severity: "MEDIUM",
        category: "PRODUCT",
        questionsToAsk: ["", "Roadmap Q3?"],
      },
    ]);

    const response = await callGet();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([
      {
        source: "RED_FLAG",
        redFlagId: "rf_1",
        questionText: "Churn jumped to 3.2% in Q1",
        severity: "HIGH",
        category: "FINANCIAL",
      },
      {
        source: "QUESTION_TO_ASK",
        redFlagId: "rf_1",
        questionText: "Why churn?",
        severity: "HIGH",
        category: "FINANCIAL",
        index: 0,
      },
      {
        source: "QUESTION_TO_ASK",
        redFlagId: "rf_1",
        questionText: "Which cohort?",
        severity: "HIGH",
        category: "FINANCIAL",
        index: 1,
      },
      {
        source: "QUESTION_TO_ASK",
        redFlagId: "rf_2",
        questionText: "Roadmap Q3?",
        severity: "MEDIUM",
        category: "PRODUCT",
        index: 1,
      },
    ]);
  });

  it("only fetches red flags that are OPEN or INVESTIGATING", async () => {
    mocks.redFlagFindMany.mockResolvedValueOnce([]);
    await callGet();
    const args = mocks.redFlagFindMany.mock.calls[0]?.[0];
    expect(args.where.status.in).toEqual(["OPEN", "INVESTIGATING"]);
    expect(args.where.dealId).toBe(dealId);
  });

  it("returns an empty list when the deal has no open red flags", async () => {
    mocks.redFlagFindMany.mockResolvedValueOnce([]);
    const response = await callGet();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data).toEqual([]);
  });
});
