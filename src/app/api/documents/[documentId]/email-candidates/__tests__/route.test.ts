import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase B7.3 — tests for GET /api/documents/[documentId]/email-candidates.
 *
 * Read-only endpoint that surfaces the thread messages detected by
 * `inferEmailSourceFromExtractedText` (stored in
 * `Document.sourceMetadata.threadMessages`) so the user can pick a
 * different sourceDate via the metadata editor's candidate picker.
 *
 * Mutation goes through the existing PATCH /metadata; this endpoint
 * has no write surface — anti-régression guard at the end checks
 * no mutation primitives are called.
 */

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  documentFindFirst: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/api-error", () => ({ handleApiError: mocks.handleApiError }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: mocks.documentFindFirst,
    },
  },
}));

const { GET } = await import("../route");

const DOC_ID = "ck8aaaaaaaaaaaaaaaaaaaaa";

function makeContext(documentId: string = DOC_ID) {
  return { params: Promise.resolve({ documentId }) };
}

function makeRequest() {
  return new Request(`https://x/api/documents/${DOC_ID}/email-candidates`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockReset();
  mocks.documentFindFirst.mockReset();
  mocks.handleApiError.mockReset();
  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  mocks.documentFindFirst.mockResolvedValue({
    id: DOC_ID,
    dealId: "deal_1",
    sourceKind: "EMAIL",
    sourceDate: null,
    sourceMetadata: null,
    deal: { userId: "user_owner" },
  });
  mocks.handleApiError.mockImplementation(
    (error: unknown) =>
      new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "internal" }),
        { status: 500 }
      )
  );
});

describe("GET /api/documents/[documentId]/email-candidates — B7.3 thread date candidates", () => {
  it("happy path — returns all thread messages from sourceMetadata.threadMessages with isPrimary marker on the one matching sourceDate", async () => {
    const primarySentAt = "2026-04-22T01:03:00.000Z";
    const secondaryAt = "2026-04-06T16:10:00.000Z";
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",
      sourceDate: new Date(primarySentAt),
      sourceMetadata: {
        inferredFrom: "uploaded_file_text",
        confidence: "high",
        threadMessageCount: 2,
        threadMessages: [
          { from: "Eryck <eryck@x.com>", sentAt: primarySentAt, subject: "Re: Avekapeti" },
          { from: "Fati <fati@x.io>", sentAt: secondaryAt, subject: "Re: Avekapeti" },
        ],
      },
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      documentId: DOC_ID,
      sourceKind: "EMAIL",
      currentSourceDate: primarySentAt,
      inferredConfidence: "high",
      inferredFrom: "uploaded_file_text",
      hasManualOverride: false,
    });
    const candidates = body.data.candidates as Array<Record<string, unknown>>;
    expect(candidates).toHaveLength(2);
    // Primary = the one whose sentAt matches sourceDate.
    expect(candidates[0]).toMatchObject({
      from: "Eryck <eryck@x.com>",
      sentAt: primarySentAt,
      subject: "Re: Avekapeti",
      isPrimary: true,
    });
    expect(candidates[1]).toMatchObject({
      from: "Fati <fati@x.io>",
      sentAt: secondaryAt,
      subject: "Re: Avekapeti",
      isPrimary: false,
    });
  });

  it("hasManualOverride=true when sourceMetadata.manual.sourceDate exists (B6.1 override)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",
      sourceDate: new Date("2026-05-15"),
      sourceMetadata: {
        manual: {
          sourceDate: {
            setBy: "user_owner",
            setAt: "2026-04-30T00:00:00.000Z",
            previousValue: "2026-04-22T01:03:00.000Z",
            newValue: "2026-05-15T00:00:00.000Z",
          },
        },
        threadMessages: [
          { from: "x", sentAt: "2026-04-22T01:03:00.000Z", subject: "y" },
        ],
      },
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { hasManualOverride: boolean } };
    expect(body.data.hasManualOverride).toBe(true);
  });

  it("returns empty candidates list when threadMessages is missing / empty (graceful for non-email docs)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "FILE",
      sourceDate: null,
      sourceMetadata: null,
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { candidates: unknown[]; sourceKind: string } };
    expect(body.data.sourceKind).toBe("FILE");
    expect(body.data.candidates).toEqual([]);
  });

  it("skips thread messages with missing / invalid sentAt (defensive)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",
      sourceDate: new Date("2026-04-22"),
      sourceMetadata: {
        threadMessages: [
          { from: "ok", sentAt: "2026-04-22T01:03:00.000Z", subject: "ok" },
          { from: "bad", sentAt: "not-a-date", subject: "bad" }, // unparseable
          { from: "missing", subject: "no-sentAt" }, // missing sentAt
          { sentAt: 12345 }, // wrong type
        ],
      },
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as {
      data: { candidates: Array<Record<string, unknown>> };
    };
    expect(body.data.candidates).toHaveLength(1);
    expect(body.data.candidates[0]?.from).toBe("ok");
  });

  it("when sourceDate is null and threadMessages exist → no candidate is marked isPrimary (inference didn't promote)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",
      sourceDate: null, // ambiguous case — inference left it unset
      sourceMetadata: {
        threadMessages: [
          { from: "a", sentAt: "2026-04-22T01:03:00.000Z", subject: "x" },
          { from: "b", sentAt: "2026-04-06T16:10:00.000Z", subject: "y" },
        ],
      },
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as {
      data: { candidates: Array<Record<string, unknown>>; currentSourceDate: string | null };
    };
    expect(body.data.currentSourceDate).toBeNull();
    expect(body.data.candidates).toHaveLength(2);
    expect(body.data.candidates.every((c) => c.isPrimary === false)).toBe(true);
  });

  it("inferredConfidence=null when sourceMetadata.confidence is not 'high' or 'medium' (defensive against schema drift)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",
      sourceDate: null,
      sourceMetadata: {
        confidence: "low", // unexpected value
        threadMessages: [],
      },
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { inferredConfidence: string | null } };
    expect(body.data.inferredConfidence).toBeNull();
  });

  it("Codex B11.2 — IDOR uniformised to 404 when deal.userId !== requesting user (no candidates leaked, no enumeration)", async () => {
    // B11.2 — the route now scopes the lookup via composite
    // `findFirst({ where: { id, deal: { userId } } })`. A cross-
    // tenant doc id returns `null` from Prisma → 404, identical
    // shape as "doc never existed". The pre-B11.2 split (403 vs
    // 404) leaked the existence of doc ids to non-owners.
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error?: string; data?: unknown };
    expect(body.data).toBeUndefined();
    // Anchor the WHERE clause — the userId filter MUST be part of
    // the query so a buggy refactor can't silently drop the scope.
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: DOC_ID,
          deal: { userId: "user_owner" },
        }),
      })
    );
  });

  it("404 when the document does not exist", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);
    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(404);
  });

  it("400 when documentId is not a CUID", async () => {
    const ctx = { params: Promise.resolve({ documentId: "not-a-cuid" }) };
    const response = await GET(makeRequest() as never, ctx as never);
    expect(response.status).toBe(400);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
  });

  it("Codex B7.3 — 401 on Unauthorized (consistent with sibling routes)", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));
    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(401);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
  });

  it("Codex B7.3 — 401 on Clerk user not found", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Clerk user not found"));
    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(401);
  });

  it("Codex B7.3 — handles sourceMetadata being a non-object (null / scalar / array) gracefully → empty candidates", async () => {
    // Defensive: a buggy writer could leave sourceMetadata as a
    // scalar or array. The route MUST NOT crash; it returns
    // empty candidates + null metadata fields.
    for (const value of [null, "string-value", ["array"], 42]) {
      mocks.documentFindFirst.mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        sourceKind: "EMAIL",
        sourceDate: null,
        sourceMetadata: value,
        deal: { userId: "user_owner" },
      });
      const response = await GET(makeRequest() as never, makeContext() as never);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: { candidates: unknown[] } };
      expect(body.data.candidates).toEqual([]);
    }
  });

  it("Codex B7.3 — Read-only contract: route does NOT call any mutation primitive (no update / delete / create)", async () => {
    await GET(makeRequest() as never, makeContext() as never);
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const routeSource = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "api",
        "documents",
        "[documentId]",
        "email-candidates",
        "route.ts"
      ),
      "utf8"
    );
    const codeOnly = routeSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(codeOnly).not.toMatch(/\.update\(/);
    expect(codeOnly).not.toMatch(/\.updateMany\(/);
    expect(codeOnly).not.toMatch(/\.delete\(/);
    expect(codeOnly).not.toMatch(/\.deleteMany\(/);
    expect(codeOnly).not.toMatch(/\.create\(/);
    expect(codeOnly).not.toMatch(/\.upsert\(/);
    // No createEvidenceSignal either (that'd be a write surface).
    expect(codeOnly).not.toMatch(/createEvidenceSignal/);
  });

  it("Codex B7.3.1 P2 — endpoint DEFENSIVELY caps candidates at 20 even when threadMessages exceeds the inference cap (writer bypass safety)", async () => {
    // Repro Codex P2: the inference caps at 20 via
    // `slice(0, 20)`, but a future writer (DB migration, manual
    // edit, parser regression) could leave > 20 messages in
    // sourceMetadata. The endpoint MUST cap defensively rather
    // than rely on the upstream cap.
    const messages = Array.from({ length: 25 }, (_, i) => ({
      from: `from_${i}`,
      sentAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      subject: `subject ${i}`,
    }));
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",
      sourceDate: null,
      sourceMetadata: { threadMessages: messages },
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as {
      data: { candidates: Array<Record<string, unknown>> };
    };
    // 25 in → 20 out (anti-régression on the cap itself).
    expect(body.data.candidates).toHaveLength(20);
    // The CAP is on the FIRST 20 (no sorting), so we still get
    // candidate 0 through 19.
    expect(body.data.candidates[0]?.from).toBe("from_0");
    expect(body.data.candidates[19]?.from).toBe("from_19");
  });

  it("Codex B7.3 — endpoint exposes 20 candidates faithfully when threadMessages has exactly 20 (cap is exactly inclusive, not exclusive)", async () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      from: `from_${i}`,
      sentAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      subject: `subject ${i}`,
    }));
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",
      sourceDate: null,
      sourceMetadata: { threadMessages: messages },
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { candidates: unknown[] } };
    expect(body.data.candidates).toHaveLength(20);
  });

  it("Codex B7.3.1 P1 (RED) — isPrimary is DAY-LEVEL: candidate at 01:03 + stored sourceDate at 00:00 (same UTC day) → STILL isPrimary=true", async () => {
    // Repro: the picker stores sourceDate at day granularity
    // (`<input type="date">` → midnight UTC). The candidate's
    // sentAt keeps the email's full ISO time. Pre-fix, the
    // ms-level comparison failed → no candidate flagged
    // "Actuel" → UI lied to the user.
    //
    // Fix: compare at UTC-day level (toISOString().slice(0,10)).
    const sentAt = "2026-04-22T01:03:00.000Z"; // email header time
    const storedSourceDate = new Date("2026-04-22T00:00:00.000Z"); // post-picker save
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",
      sourceDate: storedSourceDate,
      sourceMetadata: {
        threadMessages: [{ from: "Sender <s@x.com>", sentAt, subject: "Re: thread" }],
      },
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as {
      data: { candidates: Array<Record<string, unknown>> };
    };
    expect(body.data.candidates).toHaveLength(1);
    // CRITICAL: post-fix this must be TRUE (was FALSE pre-fix).
    expect(body.data.candidates[0]?.isPrimary).toBe(true);
  });

  it("Codex B7.3.1 P1 — different UTC day still → isPrimary=false (day-level comparison is symmetric)", async () => {
    // Sanity: the day-level fix mustn't make EVERYTHING primary.
    // A candidate on 2026-04-22 vs sourceDate on 2026-04-23 must
    // STILL be NOT primary.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",
      sourceDate: new Date("2026-04-23T00:00:00.000Z"),
      sourceMetadata: {
        threadMessages: [
          { from: "x", sentAt: "2026-04-22T23:59:00.000Z", subject: "y" },
        ],
      },
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { candidates: Array<Record<string, unknown>> } };
    expect(body.data.candidates[0]?.isPrimary).toBe(false);
  });

  it("Codex B7.3.1 P1 — when MULTIPLE candidates fall on the SAME day as sourceDate, ALL of them flag isPrimary=true (day-level granularity is shared, not exclusive)", async () => {
    // Edge case: a thread with two messages on the same day. With
    // day-level comparison, BOTH match the stored sourceDate.
    // This is acceptable — the picker shows both as "Actuel" and
    // the user can pick either. Pre-fix (ms-level), only one
    // would match by coincidence.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",
      sourceDate: new Date("2026-04-22T00:00:00.000Z"),
      sourceMetadata: {
        threadMessages: [
          { from: "a", sentAt: "2026-04-22T08:00:00.000Z", subject: "morning" },
          { from: "b", sentAt: "2026-04-22T18:30:00.000Z", subject: "evening" },
        ],
      },
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as {
      data: { candidates: Array<Record<string, unknown>> };
    };
    expect(body.data.candidates).toHaveLength(2);
    expect(body.data.candidates[0]?.isPrimary).toBe(true);
    expect(body.data.candidates[1]?.isPrimary).toBe(true);
  });

  it("Codex B7.3 — surfaces candidates even when sourceKind != EMAIL (user can correct a misclassified doc using the same picker)", async () => {
    // A doc misclassified as FILE might still have threadMessages
    // from a previous EMAIL classification. Surfacing the candidates
    // here lets the user re-correct the sourceDate via the picker
    // alongside the B6.2 sourceKind change.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "FILE", // reclassified
      sourceDate: null,
      sourceMetadata: {
        threadMessages: [
          { from: "x", sentAt: "2026-04-22T01:03:00.000Z", subject: "y" },
        ],
      },
      deal: { userId: "user_owner" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { sourceKind: string; candidates: unknown[] };
    };
    expect(body.data.sourceKind).toBe("FILE");
    expect(body.data.candidates).toHaveLength(1);
  });
});
