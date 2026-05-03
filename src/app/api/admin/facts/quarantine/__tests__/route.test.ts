import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  isValidCuid: vi.fn(),
  listSuspiciousCurrentFacts: vi.fn(),
  quarantineSuspiciousCurrentFacts: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/sanitize", () => ({
  isValidCuid: mocks.isValidCuid,
}));

vi.mock("@/services/fact-store", () => ({
  listSuspiciousCurrentFacts: mocks.listSuspiciousCurrentFacts,
  quarantineSuspiciousCurrentFacts: mocks.quarantineSuspiciousCurrentFacts,
}));

vi.mock("@/lib/api-error", () => ({
  handleApiError: mocks.handleApiError,
}));

const { GET, POST } = await import("../route");

describe("admin facts quarantine route", () => {
  const dealId = "c123456789012345678901234";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin_1" });
    mocks.isValidCuid.mockReturnValue(true);
    mocks.listSuspiciousCurrentFacts.mockResolvedValue({
      scannedDeals: 1,
      scannedCurrentFacts: 3,
      candidates: [],
      issueCounts: {},
    });
    mocks.quarantineSuspiciousCurrentFacts.mockResolvedValue({
      scannedDeals: 1,
      scannedCurrentFacts: 3,
      candidates: [],
      issueCounts: {},
      dryRun: false,
      targetedCount: 2,
      remainingTargetedCount: 0,
      quarantinedCount: 2,
      skippedCount: 0,
      quarantinedEventIds: ["evt_1", "evt_2"],
      iterations: 1,
    });
    mocks.handleApiError.mockImplementation((error: unknown) =>
      new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "unexpected" }),
        { status: 500, headers: { "content-type": "application/json" } }
      )
    );
  });

  it("lists suspicious facts in dry preview", async () => {
    const response = await GET(
      new Request(`http://localhost/api/admin/facts/quarantine?dealId=${dealId}&take=25`) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listSuspiciousCurrentFacts).toHaveBeenCalledWith({
      dealId,
      limit: 25,
    });
    expect(payload.data.admin.id).toBe("admin_1");
  });

  it("runs quarantine batch on POST", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/facts/quarantine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dealIds: [dealId], dryRun: false, limit: 50 }),
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.quarantineSuspiciousCurrentFacts).toHaveBeenCalledWith({
      dealIds: [dealId],
      dryRun: false,
      limit: 50,
    });
    expect(payload.data.quarantinedCount).toBe(2);
  });
});
