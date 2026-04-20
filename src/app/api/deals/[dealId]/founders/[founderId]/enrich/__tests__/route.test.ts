import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  dealFindFirst: vi.fn(),
  founderFindFirst: vi.fn(),
  founderUpdate: vi.fn(),
  isRapidAPILinkedInConfigured: vi.fn(),
  analyzeFounderLinkedIn: vi.fn(),
  validateLinkedInProfileUrl: vi.fn(),
  getCurrentFactsFromView: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: mocks.dealFindFirst,
    },
    founder: {
      findFirst: mocks.founderFindFirst,
      update: mocks.founderUpdate,
    },
  },
}));

vi.mock("@/services/context-engine/connectors/rapidapi-linkedin", () => ({
  analyzeFounderLinkedIn: mocks.analyzeFounderLinkedIn,
  isRapidAPILinkedInConfigured: mocks.isRapidAPILinkedInConfigured,
}));

vi.mock("@/lib/url-validator", () => ({
  validateLinkedInProfileUrl: mocks.validateLinkedInProfileUrl,
}));

vi.mock("@/services/fact-store/current-facts", () => ({
  getCurrentFactsFromView: mocks.getCurrentFactsFromView,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

const { POST } = await import("../route");

const dealId = "ck12345678901234567890123";
const founderId = "ck12345678901234567890124";

describe("POST /api/deals/[dealId]/founders/[founderId]/enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAuth.mockResolvedValue({ id: "user_1" });
    mocks.dealFindFirst.mockResolvedValue({
      id: dealId,
      sector: "deeptech",
    });
    mocks.getCurrentFactsFromView.mockResolvedValue([
      {
        dealId,
        factKey: "other.sector",
        category: "OTHER",
        currentValue: "fintech",
        currentDisplayValue: "Fintech",
        currentSource: "PITCH_DECK",
        currentConfidence: 91,
        isDisputed: false,
        eventHistory: [],
        firstSeenAt: new Date("2026-04-20T09:00:00Z"),
        lastUpdatedAt: new Date("2026-04-20T09:00:00Z"),
      },
    ]);
    mocks.founderFindFirst.mockResolvedValue({
      id: founderId,
      dealId,
      name: "Alex Founder",
      role: "CEO",
      linkedinUrl: "https://linkedin.com/in/alex-founder",
      previousVentures: [],
    });
    mocks.founderUpdate.mockResolvedValue({
      id: "founder_1",
      verifiedInfo: {},
    });
    mocks.isRapidAPILinkedInConfigured.mockReturnValue(true);
    mocks.validateLinkedInProfileUrl.mockReturnValue({ valid: true });
    mocks.analyzeFounderLinkedIn.mockResolvedValue({
      success: true,
      profile: {
        previousCompanies: [],
        education: [],
        previousVentures: [],
      },
      analysis: {},
      rawProfile: {
        full_name: "Alex Founder",
        experiences: [],
        education: [],
        skills: [],
        languages: [],
      },
    });
    mocks.handleApiError.mockImplementation((error: unknown) =>
      new Response(JSON.stringify({ error: error instanceof Error ? error.message : "unexpected" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    );
  });

  it("uses the canonical sector fact for founder enrichment", async () => {
    const response = await POST(
      new NextRequest(`http://localhost/api/deals/${dealId}/founders/${founderId}/enrich`, {
        method: "POST",
        body: JSON.stringify({ consentLinkedIn: true }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ dealId, founderId }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.analyzeFounderLinkedIn).toHaveBeenCalledWith(
      "https://linkedin.com/in/alex-founder",
      "CEO",
      "fintech"
    );
  });
});
