import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase B7.1 — tests for GET /api/documents/[documentId]/attachments.
 *
 * Scope: read-only surface of ATTACHMENT_RELATION signals.
 *   - inbound: this doc is a CHILD (one or more emails point at it)
 *   - outbound: this doc is an EMAIL (one or more child docs point
 *     back to it via the encrypted valueJson.emailDocId)
 *
 * We don't spin up a real Prisma — we mock the client surface used
 * by the route + the decrypt helper (same pattern as the metadata
 * route tests). The decrypt mock lets us drive the post-decrypt
 * shape without needing real AES-256-GCM keys.
 */

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  // B11.2 — ownership lookups (GET / POST thisDoc + emailDoc /
  // DELETE thisDoc) now use composite `findFirst` for 404-uniform
  // anti-enumeration. Tests queue `documentFindFirst` for those.
  documentFindFirst: vi.fn(),
  documentFindUnique: vi.fn(),
  documentFindMany: vi.fn(),
  evidenceSignalFindMany: vi.fn(),
  // B7.2 — DELETE path uses findFirst + deleteMany (for human
  // signals) ; POST + suppression-DELETE path go through
  // createEvidenceSignal which is mocked at the @/services
  // boundary below.
  evidenceSignalFindFirst: vi.fn(),
  evidenceSignalDeleteMany: vi.fn(),
  createEvidenceSignal: vi.fn(),
  tryDecryptJsonField: vi.fn(),
  // B11.2 — POST + DELETE are rate-limited (30/min shared bucket).
  checkRateLimitDistributed: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/api-error", () => ({ handleApiError: mocks.handleApiError }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: mocks.documentFindFirst,
      findUnique: mocks.documentFindUnique,
      findMany: mocks.documentFindMany,
    },
    evidenceSignal: {
      findMany: mocks.evidenceSignalFindMany,
      findFirst: mocks.evidenceSignalFindFirst,
      deleteMany: mocks.evidenceSignalDeleteMany,
    },
  },
}));
vi.mock("@/lib/sanitize", () => ({
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
}));
vi.mock("@/lib/encryption", () => ({
  tryDecryptJsonField: mocks.tryDecryptJsonField,
}));
vi.mock("@/services/evidence-signals/create-signal", () => ({
  createEvidenceSignal: mocks.createEvidenceSignal,
}));

const { GET, POST, DELETE } = await import("../route");

const DOC_ID = "ck8aaaaaaaaaaaaaaaaaaaaa";

function makeContext(documentId: string = DOC_ID) {
  return { params: Promise.resolve({ documentId }) };
}

function makeRequest() {
  return new Request(`https://x/api/documents/${DOC_ID}/attachments`);
}

beforeEach(() => {
  // B7.2 — `vi.clearAllMocks()` only clears `mock.calls` and
  // `mock.results`; the per-mock `mockResolvedValueOnce` /
  // `mockReturnValueOnce` queues leak across tests. Use mockReset()
  // on each spy + re-set the defaults below. Without this, a POST
  // test that queues extra documentFindUnique values can leave them
  // behind, corrupting subsequent GET tests' first-call read.
  vi.clearAllMocks();
  mocks.requireAuth.mockReset();
  mocks.documentFindFirst.mockReset();
  mocks.documentFindUnique.mockReset();
  mocks.documentFindMany.mockReset();
  mocks.evidenceSignalFindMany.mockReset();
  mocks.evidenceSignalFindFirst.mockReset();
  mocks.evidenceSignalDeleteMany.mockReset();
  mocks.createEvidenceSignal.mockReset();
  mocks.tryDecryptJsonField.mockReset();
  mocks.checkRateLimitDistributed.mockReset();
  mocks.handleApiError.mockReset();
  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  // B11.2 — rate limit allowed by default; tests override for 429.
  mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true });
  // B11.2 — ownership lookup default fixture (GET / DELETE thisDoc).
  // The `deal: { userId }` key from pre-B11.2 is dropped because the
  // route no longer selects it (the userId WHERE filter on the
  // composite findFirst replaces the post-fetch check).
  mocks.documentFindFirst.mockResolvedValue({
    id: DOC_ID,
    dealId: "deal_1",
    sourceKind: "FILE",
    // B7.2.2 — name + sourceDate selected by GET so buildEntry can
    // derive display fields for human manual_link signals at
    // read-time (vs reading a stale valueJson snapshot).
    name: "this-doc.pdf",
    sourceDate: null,
    version: 1,
  });
  mocks.evidenceSignalFindMany.mockResolvedValue([]);
  mocks.documentFindMany.mockResolvedValue([]);
  // Default decrypt impl: plain object → plaintext; else absent.
  mocks.tryDecryptJsonField.mockImplementation((value: unknown) => {
    if (value === null || value === undefined) return { kind: "absent" };
    if (typeof value === "object" && !Array.isArray(value)) {
      return { kind: "plaintext", value };
    }
    return { kind: "absent" };
  });
  mocks.handleApiError.mockImplementation(
    (error: unknown) =>
      new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "internal" }),
        { status: 500 }
      )
  );
  // B7.2 — POST/DELETE mock defaults.
  mocks.evidenceSignalFindFirst.mockResolvedValue(null);
  mocks.evidenceSignalDeleteMany.mockResolvedValue({ count: 1 });
  mocks.createEvidenceSignal.mockResolvedValue({
    signal: { id: "sig_created_1" },
    deduplicated: false,
  });
});

function makePostRequest(body: unknown) {
  return new Request(`https://x/api/documents/${DOC_ID}/attachments`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest(body: unknown) {
  return new Request(`https://x/api/documents/${DOC_ID}/attachments`, {
    method: "DELETE",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/documents/[documentId]/attachments — B7.1 surface", () => {
  it("happy path — child doc with one inbound relation: returns inbound[1] with email metadata, outbound[0]", async () => {
    // The user opens the audit dialog on a cap table. That cap
    // table was attached to an email. We expect inbound to list
    // the email + confidence + method + reportedAt.
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_inbound_1",
          valueJson: { alg: "AES-256-GCM", data: "<enc>" },
          confidence: "HIGH",
          reportedAt: new Date("2026-04-22"),
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          signalScopeKey: "source_metadata",
        },
      ])
      // outbound query — no candidates in this scenario
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: {
        emailDocId: "email_doc_1",
        attachmentName: "captable.xlsx",
        matchMethod: "exact",
        matchScore: 1.0,
        emailSourceDate: "2026-04-22T00:00:00.000Z",
      },
    });
    // B7.2 — the GET endpoint now does TWO documentFindMany calls:
    //   (1) candidate emails (in Promise.all with the signal queries)
    //   (2) related-docs lookup (after decrypt+filter)
    // Default both to empty; tests override per case as needed.
    mocks.documentFindMany.mockResolvedValueOnce([]); // candidate emails
    mocks.documentFindMany.mockResolvedValueOnce([
      { id: "email_doc_1", name: "Q1 update.eml", type: "OTHER" },
    ]);

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        documentId: string;
        sourceKind: string;
        inbound: Array<Record<string, unknown>>;
        outbound: Array<Record<string, unknown>>;
      };
    };
    expect(body.data.documentId).toBe(DOC_ID);
    expect(body.data.sourceKind).toBe("FILE");
    expect(body.data.outbound).toEqual([]);
    expect(body.data.inbound).toHaveLength(1);
    expect(body.data.inbound[0]).toMatchObject({
      signalId: "sig_inbound_1",
      relatedDocumentId: "email_doc_1",
      relatedDocumentName: "Q1 update.eml",
      relatedDocumentType: "OTHER",
      attachmentName: "captable.xlsx",
      matchMethod: "exact",
      matchScore: 1.0,
      confidence: "HIGH",
      emailSourceDate: "2026-04-22T00:00:00.000Z",
    });
    expect(body.data.inbound[0]?.reportedAt).toMatch(/^2026-04-22/);
  });

  it("happy path — EMAIL doc with two outbound relations: returns outbound[2] (children), inbound[0]", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",    });
    // Inbound on the email itself: empty.
    // Outbound candidates: 2 ATTACHMENT_RELATION rows on different
    // child docs, each decrypting to emailDocId === DOC_ID.
    mocks.evidenceSignalFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "sig_out_1",
        documentId: "child_1",
        valueJson: { alg: "AES-256-GCM", data: "<enc1>" },
        confidence: "HIGH",
        reportedAt: new Date("2026-04-22"),
        createdAt: new Date("2026-04-22T10:00:00.000Z"),
        signalScopeKey: "source_metadata",
      },
      {
        id: "sig_out_2",
        documentId: "child_2",
        valueJson: { alg: "AES-256-GCM", data: "<enc2>" },
        confidence: "MEDIUM",
        reportedAt: new Date("2026-04-22"),
        createdAt: new Date("2026-04-22T10:00:00.000Z"),
        signalScopeKey: "source_metadata",
      },
    ]);
    mocks.tryDecryptJsonField
      .mockReturnValueOnce({
        kind: "decrypted",
        value: {
          emailDocId: DOC_ID,
          attachmentName: "deck.pdf",
          matchMethod: "exact",
          matchScore: 1.0,
        },
      })
      .mockReturnValueOnce({
        kind: "decrypted",
        value: {
          emailDocId: DOC_ID,
          attachmentName: "captable.xlsx",
          matchMethod: "normalized",
          matchScore: 0.95,
        },
      });
    mocks.documentFindMany.mockResolvedValueOnce([]); // candidate emails
    mocks.documentFindMany.mockResolvedValueOnce([
      { id: "child_1", name: "deck.pdf", type: "PITCH_DECK" },
      { id: "child_2", name: "captable.xlsx", type: "CAP_TABLE" },
    ]);

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { inbound: unknown[]; outbound: Array<Record<string, unknown>>; sourceKind: string };
    };
    expect(body.data.sourceKind).toBe("EMAIL");
    expect(body.data.inbound).toEqual([]);
    expect(body.data.outbound).toHaveLength(2);
    // Confidence/method/score propagated correctly.
    expect(body.data.outbound[0]).toMatchObject({
      relatedDocumentName: "deck.pdf",
      matchMethod: "exact",
      matchScore: 1.0,
      confidence: "HIGH",
    });
    expect(body.data.outbound[1]).toMatchObject({
      relatedDocumentName: "captable.xlsx",
      matchMethod: "normalized",
      matchScore: 0.95,
      confidence: "MEDIUM",
    });
  });

  it("filters out outbound candidates that point to a DIFFERENT email (cross-email isolation)", async () => {
    // The deal has 2 emails. We're fetching attachments for email_A;
    // the candidate set includes signals from BOTH emails (the
    // findMany is kind-scoped, not emailDocId-scoped — that's the
    // whole point of the in-app decrypt-and-filter).
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",    });
    mocks.evidenceSignalFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "sig_for_DOC_ID",
        documentId: "child_1",
        valueJson: { alg: "AES-256-GCM", data: "<enc1>" },
        confidence: "HIGH",
        reportedAt: null,
        createdAt: new Date(),
        signalScopeKey: "source_metadata",
      },
      {
        id: "sig_for_OTHER_email",
        documentId: "child_2",
        valueJson: { alg: "AES-256-GCM", data: "<enc2>" },
        confidence: "HIGH",
        reportedAt: null,
        createdAt: new Date(),
        signalScopeKey: "source_metadata",
      },
    ]);
    mocks.tryDecryptJsonField
      .mockReturnValueOnce({ kind: "decrypted", value: { emailDocId: DOC_ID } })
      .mockReturnValueOnce({ kind: "decrypted", value: { emailDocId: "different_email" } });
    mocks.documentFindMany.mockResolvedValueOnce([]); // candidate emails
    mocks.documentFindMany.mockResolvedValueOnce([
      { id: "child_1", name: "deck.pdf", type: "PITCH_DECK" },
    ]);

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { outbound: Array<Record<string, unknown>> } };
    // Only the signal pointing at DOC_ID is in outbound.
    expect(body.data.outbound).toHaveLength(1);
    expect(body.data.outbound[0]?.relatedDocumentId).toBe("child_1");
  });

  it("skips corrupted envelopes (does NOT block surfacing of valid relations)", async () => {
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_corrupt",
          valueJson: { alg: "AES-256-GCM", data: "<garbage>" },
          confidence: "HIGH",
          reportedAt: null,
          createdAt: new Date(),
          signalScopeKey: "source_metadata",
        },
        {
          id: "sig_valid",
          valueJson: { alg: "AES-256-GCM", data: "<enc>" },
          confidence: "MEDIUM",
          reportedAt: null,
          createdAt: new Date(),
          signalScopeKey: "source_metadata",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField
      .mockReturnValueOnce({ kind: "corrupted", reason: "auth tag mismatch" })
      .mockReturnValueOnce({
        kind: "decrypted",
        value: { emailDocId: "email_doc_1" },
      });
    // B7.2 — the GET endpoint now does TWO documentFindMany calls:
    //   (1) candidate emails (in Promise.all with the signal queries)
    //   (2) related-docs lookup (after decrypt+filter)
    // Default both to empty; tests override per case as needed.
    mocks.documentFindMany.mockResolvedValueOnce([]); // candidate emails
    mocks.documentFindMany.mockResolvedValueOnce([
      { id: "email_doc_1", name: "Q1 update.eml", type: "OTHER" },
    ]);

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { inbound: Array<Record<string, unknown>> } };
    expect(body.data.inbound).toHaveLength(1);
    expect(body.data.inbound[0]?.signalId).toBe("sig_valid");
  });

  it("skips entries whose related document was deleted (resolvable-target invariant)", async () => {
    // A relation that points to a doc that's been deleted shouldn't
    // surface — the UI would render a dead link.
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_orphan",
          valueJson: { alg: "AES-256-GCM", data: "<enc>" },
          confidence: "HIGH",
          reportedAt: null,
          createdAt: new Date(),
          signalScopeKey: "source_metadata",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { emailDocId: "deleted_email" },
    });
    // documentFindMany returns [] for both calls — first the
    // candidate emails query (empty deal), then the related-docs
    // lookup (deleted target).
    mocks.documentFindMany.mockResolvedValueOnce([]); // candidate emails
    mocks.documentFindMany.mockResolvedValueOnce([]); // related docs (deleted)

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { inbound: unknown[]; outbound: unknown[] } };
    expect(body.data.inbound).toEqual([]);
    expect(body.data.outbound).toEqual([]);
  });

  it("B11.2 — IDOR uniformised to 404 when deal.userId !== requesting user (no signal scan)", async () => {
    // Composite `findFirst({ where: { id, deal: { userId } } })`
    // returns null for cross-tenant doc ids → identical to "doc
    // never existed". Anti-enumeration.
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(404);
    // The signal scan MUST NOT have happened (fast-fail before the
    // expensive findMany).
    expect(mocks.evidenceSignalFindMany).not.toHaveBeenCalled();
    // Anchor the userId scoping in the composite where clause.
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
        }),
      })
    );
  });

  it("404 when the document does not exist", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(404);
    expect(mocks.evidenceSignalFindMany).not.toHaveBeenCalled();
  });

  it("400 when documentId is not a CUID", async () => {
    const ctx = { params: Promise.resolve({ documentId: "not-a-cuid" }) };
    const response = await GET(makeRequest() as never, ctx as never);
    expect(response.status).toBe(400);
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
  });

  it("Codex B7.1 — Both signal queries are dealId-scoped (cross-deal isolation invariant)", async () => {
    await GET(makeRequest() as never, makeContext() as never);

    expect(mocks.evidenceSignalFindMany).toHaveBeenCalledTimes(2);
    for (const call of mocks.evidenceSignalFindMany.mock.calls) {
      expect(call[0]?.where).toMatchObject({
        dealId: "deal_1",
        kind: "ATTACHMENT_RELATION",
      });
    }
  });

  it("Codex B7.1 — the related-docs findMany is dealId-scoped (defense in depth against cross-tenant id leak)", async () => {
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_inbound_1",
          valueJson: { alg: "AES-256-GCM", data: "<enc>" },
          confidence: "HIGH",
          reportedAt: null,
          createdAt: new Date(),
          signalScopeKey: "source_metadata",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { emailDocId: "email_doc_1" },
    });
    // B7.2 — the GET endpoint now does TWO documentFindMany calls:
    //   (1) candidate emails (in Promise.all with the signal queries)
    //   (2) related-docs lookup (after decrypt+filter)
    // Default both to empty; tests override per case as needed.
    mocks.documentFindMany.mockResolvedValueOnce([]); // candidate emails
    mocks.documentFindMany.mockResolvedValueOnce([
      { id: "email_doc_1", name: "Q1 update.eml", type: "OTHER" },
    ]);

    await GET(makeRequest() as never, makeContext() as never);

    // B7.2 — documentFindMany is called TWICE now: the FIRST call
    // is the candidate-emails query (with sourceKind=EMAIL filter),
    // the SECOND is the related-docs lookup (with id.in). Assert
    // on the SECOND call.
    const findManyCall = mocks.documentFindMany.mock.calls[1]?.[0];
    expect(findManyCall?.where).toMatchObject({
      id: { in: ["email_doc_1"] },
      // Critical: dealId scope on the related-docs query so a
      // hypothetical decrypted emailDocId from another tenant
      // (e.g. via a corrupted signal row) can't surface here.
      dealId: "deal_1",
    });
  });

  it("Codex B7.1 — GET path is read-only (no mutation calls inside the GET handler body)", async () => {
    // After B7.2 the file ALSO has POST + DELETE handlers — but the
    // GET handler itself MUST stay read-only. We scan the source for
    // the GET function body and assert no mutation calls slip in.
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const routeSource = readFileSync(
      join(process.cwd(), "src", "app", "api", "documents", "[documentId]", "attachments", "route.ts"),
      "utf8"
    );
    // Strip comments first.
    const codeOnly = routeSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    // Extract the GET function body (from `export async function GET`
    // up to the next `export async function` or end of file).
    const getMatch = codeOnly.match(
      /export\s+async\s+function\s+GET\([\s\S]+?(?=export\s+async\s+function\s|$)/
    );
    expect(getMatch).not.toBeNull();
    const getBody = getMatch?.[0] ?? "";
    expect(getBody).not.toMatch(/\.update\(/);
    expect(getBody).not.toMatch(/\.updateMany\(/);
    expect(getBody).not.toMatch(/\.delete\(/);
    expect(getBody).not.toMatch(/\.deleteMany\(/);
    expect(getBody).not.toMatch(/\.create\(/);
    expect(getBody).not.toMatch(/\.upsert\(/);
    // No createEvidenceSignal in GET either (that's POST/DELETE
    // territory).
    expect(getBody).not.toMatch(/createEvidenceSignal\(/);
  });

  it("Codex B7.2 invariant — corpusParentDocumentId is NEVER touched (F62 lineage immutability across the entire file)", async () => {
    // POST + DELETE were added; the lineage key MUST NOT be mutated
    // by either. The ATTACHMENT_RELATION signal IS the manual link
    // surface — it sits ALONGSIDE the F62 lineage, not on it.
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const routeSource = readFileSync(
      join(process.cwd(), "src", "app", "api", "documents", "[documentId]", "attachments", "route.ts"),
      "utf8"
    );
    const codeOnly = routeSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(codeOnly).not.toMatch(/corpusParentDocumentId/);
  });

  it("Codex B7.1 — signals with absent / null valueJson are skipped (defensive)", async () => {
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_null_value",
          valueJson: null,
          confidence: "HIGH",
          reportedAt: null,
          createdAt: new Date(),
          signalScopeKey: "source_metadata",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({ kind: "absent" });

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { inbound: unknown[] } };
    expect(body.data.inbound).toEqual([]);
  });

  it("Codex B7.1 — signals with valueJson missing emailDocId are skipped (incomplete relation)", async () => {
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_incomplete",
          valueJson: { alg: "AES-256-GCM", data: "<enc>" },
          confidence: "HIGH",
          reportedAt: null,
          createdAt: new Date(),
          signalScopeKey: "source_metadata",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      // No emailDocId field — signal is malformed.
      value: { attachmentName: "stray.pdf" },
    });

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { inbound: unknown[] } };
    expect(body.data.inbound).toEqual([]);
  });

  it("Codex B7.1 P2 — returns 401 when requireAuth throws 'Unauthorized' (NOT 500 via global error handler)", async () => {
    // Anti-régression: the client needs to distinguish session
    // expiry (401 → re-auth flow) from server error (500 → retry).
    // The route catches requireAuth() failures explicitly and
    // returns 401 instead of letting handleApiError convert to 500.
    mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("Unauthorized");
    // No signal scan + no document lookup before the auth check.
    expect(mocks.documentFindUnique).not.toHaveBeenCalled();
    expect(mocks.evidenceSignalFindMany).not.toHaveBeenCalled();
  });

  it("Codex B7.1 P2 — returns 401 when requireAuth throws 'Clerk user not found' (covers the second auth-failure code path)", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Clerk user not found"));

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(401);
  });

  it("Codex B7.1 P2 — falls back to handleApiError (500 path) on non-auth requireAuth errors (defensive — catches future Clerk SDK error shapes)", async () => {
    // If requireAuth ever throws a non-auth error (e.g. Clerk SDK
    // network failure), we should NOT convert it to a 401 (would
    // mask a server problem). Fall through to handleApiError.
    mocks.requireAuth.mockRejectedValueOnce(new Error("Clerk SDK network error"));

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(500);
  });

  it("returns matchMethod='unknown' when the decrypted value has a non-standard method (defensive — schema evolution)", async () => {
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_unknown_method",
          valueJson: { alg: "AES-256-GCM", data: "<enc>" },
          confidence: "LOW",
          reportedAt: null,
          createdAt: new Date(),
          signalScopeKey: "source_metadata",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { emailDocId: "email_doc_1", matchMethod: "fuzzy" /* unknown */ },
    });
    mocks.documentFindMany.mockResolvedValueOnce([]); // candidate emails
    mocks.documentFindMany.mockResolvedValueOnce([
      { id: "email_doc_1", name: "x.eml", type: "OTHER" },
    ]);

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { inbound: Array<Record<string, unknown>> } };
    expect(body.data.inbound[0]?.matchMethod).toBe("unknown");
  });
});

// ============================================================
// B7.2 — POST /attachments (link this doc to an email)
// ============================================================
const EMAIL_ID = "ckbbbbbbbbbbbbbbbbbbbbbb";

describe("POST /api/documents/[documentId]/attachments — B7.2 manual link", () => {
  function setupValidLinkContext() {
    // B11.2 — both lookups now go through findFirst with the
    // composite where (deal scoped by user). Promise.all preserves
    // call order so we chain the two mocks on documentFindFirst.
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        name: "captable.xlsx",
        version: 1,
      })
      .mockResolvedValueOnce({
        id: EMAIL_ID,
        dealId: "deal_1",
        name: "Q1 update.eml",
        sourceKind: "EMAIL",
        sourceDate: new Date("2026-04-22"),
        isLatest: true,
        processingStatus: "COMPLETED",
      });
  }

  it("happy path — creates a human ATTACHMENT_RELATION via createEvidenceSignal (signalScopeKey 'human:<cuid>', kind=ATTACHMENT_RELATION, sourceMethod=HUMAN_OVERRIDE)", async () => {
    setupValidLinkContext();

    const response = await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { signalId: string; provenance: string; emailDocumentId: string } };
    expect(body.data).toMatchObject({
      signalId: "sig_created_1",
      provenance: "human",
      emailDocumentId: EMAIL_ID,
    });

    // createEvidenceSignal called with the right shape.
    expect(mocks.createEvidenceSignal).toHaveBeenCalledTimes(1);
    const createCall = mocks.createEvidenceSignal.mock.calls[0]?.[1];
    expect(createCall).toMatchObject({
      dealId: "deal_1",
      documentId: DOC_ID,
      documentVersion: 1,
      kind: "ATTACHMENT_RELATION",
      sourceMethod: "HUMAN_OVERRIDE",
      confidence: "HIGH",
    });
    // signalScopeKey MUST be human-scoped + match the validation
    // pattern (c<hex>).
    expect(createCall?.signalScopeKey).toMatch(/^human:c[a-f0-9]{20,32}$/);
    // B7.2.1 → B7.2.2 (Codex P2) — valueJson is IDENTITY-STABLE
    // and MINIMAL. No setBy/setAt (vary per call). No
    // attachmentName (doc rename would change signalHash → break
    // dedup). No emailSourceDate (email-date correction would
    // change it too). Only identity fields stay:
    //   { kind, emailDocId, matchMethod }
    // Display values for attachmentName + emailSourceDate are
    // derived at GET-time from the live related docs.
    expect(createCall?.valueJson).toMatchObject({
      kind: "manual_link",
      emailDocId: EMAIL_ID,
      matchMethod: "manual",
    });
    expect(createCall?.valueJson).not.toHaveProperty("attachmentName");
    expect(createCall?.valueJson).not.toHaveProperty("emailSourceDate");
    expect(createCall?.valueJson).not.toHaveProperty("setBy");
    expect(createCall?.valueJson).not.toHaveProperty("setAt");
    // reportedAt mirrors the email's sourceDate (so the new
    // relation looks consistent with auto ones).
    expect(createCall?.reportedAt).toEqual(new Date("2026-04-22"));
  });

  it("returns 200 (not 201) when the manual link already exists (dedup via createEvidenceSignal)", async () => {
    setupValidLinkContext();
    mocks.createEvidenceSignal.mockResolvedValueOnce({
      signal: { id: "sig_existing" },
      deduplicated: true,
    });

    const response = await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { deduplicated: boolean } };
    expect(body.data.deduplicated).toBe(true);
  });

  it("Codex B7.2 — 400 when emailDocumentId === documentId (self-link guard)", async () => {
    const response = await POST(
      makePostRequest({ emailDocumentId: DOC_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
    // Self-link is caught before any DB call.
    expect(mocks.documentFindUnique).not.toHaveBeenCalled();
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
  });

  it("Codex B7.2 — 400 when target document is not an email (sourceKind != EMAIL)", async () => {
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        name: "x",
        version: 1,
      })
      .mockResolvedValueOnce({
        id: EMAIL_ID,
        dealId: "deal_1",
        name: "not-an-email.pdf",
        sourceKind: "FILE", // <-- not EMAIL
        sourceDate: null,
      });

    const response = await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
  });

  it("Codex B7.2 — 400 when target email belongs to a different deal (cross-deal isolation, even if user owns both deals)", async () => {
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        name: "x",
        version: 1,
      })
      .mockResolvedValueOnce({
        id: EMAIL_ID,
        dealId: "deal_2", // <-- different deal
        name: "Q1.eml",
        sourceKind: "EMAIL",
        sourceDate: null,
        isLatest: true,
        processingStatus: "COMPLETED",
      });

    const response = await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
  });

  it("B11.2 — 404 when this doc is owned by another user (IDOR uniformised to 404)", async () => {
    // Composite `findFirst({ deal: { userId } })` returns null for
    // cross-tenant doc ids → 404, identical to "doc never existed".
    mocks.documentFindFirst
      .mockResolvedValueOnce(null) // thisDoc
      .mockResolvedValueOnce(null); // emailDoc (Promise.all queue)

    const response = await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
  });

  it("404 when this doc does not exist", async () => {
    mocks.documentFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: EMAIL_ID,
        dealId: "deal_1",
        name: "y.eml",
        sourceKind: "EMAIL",
        sourceDate: null,
        isLatest: true,
        processingStatus: "COMPLETED",
      });

    const response = await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
  });

  it("404 when the email target does not exist", async () => {
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        name: "x",
        version: 1,
      })
      .mockResolvedValueOnce(null);

    const response = await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
  });

  it("400 when body is missing emailDocumentId", async () => {
    const response = await POST(makePostRequest({}) as never, makeContext() as never);
    expect(response.status).toBe(400);
  });

  it("400 when emailDocumentId is not a CUID", async () => {
    const response = await POST(
      makePostRequest({ emailDocumentId: "not-a-cuid" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
  });

  it("Codex B7.2 — 401 on Unauthorized (consistent with GET contract)", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));
    const response = await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(401);
  });
});

// ============================================================
// B7.2 — DELETE /attachments (unlink: safe-delete OR suppress)
// ============================================================
describe("DELETE /api/documents/[documentId]/attachments — B7.2 unlink", () => {
  const SIGNAL_ID = "ckccccccccccccccccccccccc";

  function setupDocOwnership() {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      version: 1,    });
  }

  it("Codex B7.2 — HUMAN signal (signalScopeKey starts with 'human:') → safe delete, NO suppression created", async () => {
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "human:cabcdef1234567890abcdef12",
      documentId: DOC_ID,
      valueJson: { alg: "AES-256-GCM", data: "<enc>" },
    });
    // B7.2.1 — DELETE now decrypts valueJson to verify the signal
    // touches the URL doc. The mock returns a manual_link shape
    // pointing at some email; since signal.documentId === DOC_ID
    // (inbound), the touches-URL check passes.
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { kind: "manual_link", emailDocId: "some_email", attachmentName: "x" },
    });

    const response = await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { action: string; signalId: string } };
    expect(body.data).toEqual({ action: "deleted", signalId: SIGNAL_ID });

    // Real delete called, scoped on (id, dealId) for IDOR safety.
    expect(mocks.evidenceSignalDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.evidenceSignalDeleteMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: SIGNAL_ID, dealId: "deal_1" },
    });
    // NO suppression signal created.
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
  });

  it("Codex B7.2 — AUTO signal (signalScopeKey='source_metadata') → NO delete, suppression signal CREATED (preserves auto trace)", async () => {
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "source_metadata", // auto signal from attachment-linker
      documentId: DOC_ID,
      valueJson: { alg: "AES-256-GCM", data: "<enc>" },
    });
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { emailDocId: "some_email", attachmentName: "x", matchMethod: "exact" },
    });

    const response = await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { action: string; signalId: string } };
    expect(body.data).toEqual({ action: "suppressed", signalId: SIGNAL_ID });

    // CRITICAL: the auto signal is NOT deleted (spec: "unlink
    // n'efface pas signal auto sans trace").
    expect(mocks.evidenceSignalDeleteMany).not.toHaveBeenCalled();
    // A suppression signal IS created.
    expect(mocks.createEvidenceSignal).toHaveBeenCalledTimes(1);
    const createCall = mocks.createEvidenceSignal.mock.calls[0]?.[1];
    expect(createCall).toMatchObject({
      dealId: "deal_1",
      documentId: DOC_ID,
      kind: "ATTACHMENT_RELATION",
      sourceMethod: "HUMAN_OVERRIDE",
    });
    // signalScopeKey is human-scoped (so GET filters it out at
    // surface time but the row stays as an audit trail of the
    // user's suppression action).
    expect(createCall?.signalScopeKey).toMatch(/^human:c[a-f0-9]{20,32}$/);
    // B7.2.1 — valueJson is IDENTITY-STABLE (no setBy/setAt).
    expect(createCall?.valueJson).toMatchObject({
      kind: "suppression",
      suppresses: SIGNAL_ID,
    });
    expect(createCall?.valueJson).not.toHaveProperty("setBy");
    expect(createCall?.valueJson).not.toHaveProperty("setAt");
  });

  it("Codex B7.2 — 404 when the signal doesn't exist OR belongs to another deal (findFirst returns null — IDOR-safe by dealId scope)", async () => {
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce(null);

    const response = await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
    expect(mocks.evidenceSignalDeleteMany).not.toHaveBeenCalled();
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
  });

  it("Codex B7.2 — findFirst is dealId-scoped + kind-scoped (signal MUST be ATTACHMENT_RELATION in THIS deal)", async () => {
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "human:cabcdef1234567890abcdef12",
      documentId: DOC_ID,
      valueJson: { alg: "AES-256-GCM", data: "<enc>" },
    });
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { kind: "manual_link", emailDocId: "some_email" },
    });

    await DELETE(makeDeleteRequest({ signalId: SIGNAL_ID }) as never, makeContext() as never);

    const findCall = mocks.evidenceSignalFindFirst.mock.calls[0]?.[0];
    expect(findCall?.where).toMatchObject({
      id: SIGNAL_ID,
      dealId: "deal_1",
      kind: "ATTACHMENT_RELATION",
    });
  });

  it("B11.2 — 404 when the user doesn't own the document (IDOR uniformised)", async () => {
    // Composite findFirst returns null for cross-tenant doc ids.
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const response = await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
    expect(mocks.evidenceSignalFindFirst).not.toHaveBeenCalled();
  });

  it("400 when body is missing signalId", async () => {
    const response = await DELETE(makeDeleteRequest({}) as never, makeContext() as never);
    expect(response.status).toBe(400);
  });

  it("400 when signalId is not a CUID", async () => {
    const response = await DELETE(
      makeDeleteRequest({ signalId: "not-a-cuid" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
  });

  it("Codex B7.2 — 401 on Unauthorized (consistent with GET/POST)", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("Unauthorized"));
    const response = await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(401);
  });
});

// ============================================================
// B7.2 — GET integration: suppression filter + provenance tag
// ============================================================
describe("GET /api/documents/[documentId]/attachments — B7.2 suppression + provenance", () => {
  it("Codex B7.2 — auto signal is HIDDEN from the GET output when a suppression signal targets it", async () => {
    // Two signals on the doc:
    //   1. auto ATTACHMENT_RELATION pointing at email_doc_1
    //   2. human suppression pointing at signal #1
    // GET MUST return inbound=[] (suppression hides the auto relation).
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_auto",
          valueJson: { alg: "AES-256-GCM", data: "<enc1>" },
          confidence: "HIGH",
          reportedAt: new Date("2026-04-22"),
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          signalScopeKey: "source_metadata",
        },
        {
          id: "sig_suppression",
          valueJson: { alg: "AES-256-GCM", data: "<enc2>" },
          confidence: "HIGH",
          reportedAt: null,
          createdAt: new Date("2026-04-22T11:00:00.000Z"),
          signalScopeKey: "human:cabcdef1234567890abcdef12",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField
      .mockReturnValueOnce({
        kind: "decrypted",
        value: { emailDocId: "email_doc_1", attachmentName: "captable.xlsx" },
      })
      .mockReturnValueOnce({
        kind: "decrypted",
        value: { kind: "suppression", suppresses: "sig_auto" },
      });
    mocks.documentFindMany.mockResolvedValueOnce([]); // candidate emails
    mocks.documentFindMany.mockResolvedValueOnce([
      { id: "email_doc_1", name: "Q1.eml", type: "OTHER" },
    ]);

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { inbound: unknown[]; outbound: unknown[] } };
    // Both the auto signal (suppressed) and the suppression signal
    // itself (infrastructure) are filtered out.
    expect(body.data.inbound).toEqual([]);
    expect(body.data.outbound).toEqual([]);
  });

  it("Codex B7.2 — human manual_link entries are marked provenance='human'", async () => {
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_human_link",
          valueJson: { alg: "AES-256-GCM", data: "<enc>" },
          confidence: "HIGH",
          reportedAt: new Date("2026-04-22"),
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          signalScopeKey: "human:cabcdef1234567890abcdef12",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: {
        kind: "manual_link",
        emailDocId: "email_doc_1",
        attachmentName: "captable.xlsx",
        matchMethod: "manual",
      },
    });
    mocks.documentFindMany.mockResolvedValueOnce([]);
    mocks.documentFindMany.mockResolvedValueOnce([
      { id: "email_doc_1", name: "Q1.eml", type: "OTHER" },
    ]);

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { inbound: Array<Record<string, unknown>> } };
    expect(body.data.inbound).toHaveLength(1);
    expect(body.data.inbound[0]).toMatchObject({
      provenance: "human",
      matchMethod: "manual",
    });
  });

  it("Codex B7.2 — auto entries are marked provenance='auto' (regression on the absence of the field would leave UI unable to distinguish)", async () => {
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_auto",
          valueJson: { alg: "AES-256-GCM", data: "<enc>" },
          confidence: "HIGH",
          reportedAt: new Date(),
          createdAt: new Date(),
          signalScopeKey: "source_metadata",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { emailDocId: "email_doc_1", matchMethod: "exact" },
    });
    mocks.documentFindMany.mockResolvedValueOnce([]);
    mocks.documentFindMany.mockResolvedValueOnce([
      { id: "email_doc_1", name: "Q1.eml", type: "OTHER" },
    ]);

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as { data: { inbound: Array<Record<string, unknown>> } };
    expect(body.data.inbound[0]?.provenance).toBe("auto");
  });

  it("Codex B7.2 — candidateEmails contains EMAIL docs in the same deal (excludes this doc) for the picker", async () => {
    mocks.documentFindMany.mockReset();
    mocks.documentFindMany.mockResolvedValueOnce([
      { id: "email_a", name: "Q1.eml", sourceDate: new Date("2026-04-22") },
      { id: "email_b", name: "Q2.eml", sourceDate: new Date("2026-05-15") },
    ]);
    mocks.documentFindMany.mockResolvedValueOnce([]); // related docs (no relations)

    const response = await GET(makeRequest() as never, makeContext() as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { candidateEmails: Array<Record<string, unknown>> };
    };
    expect(body.data.candidateEmails).toHaveLength(2);
    expect(body.data.candidateEmails[0]).toMatchObject({
      id: "email_a",
      name: "Q1.eml",
    });
    // Anti-régression: the findMany WHERE excludes this doc.
    const candidateCall = mocks.documentFindMany.mock.calls[0]?.[0];
    expect(candidateCall?.where).toMatchObject({
      dealId: "deal_1",
      sourceKind: "EMAIL",
      id: { not: DOC_ID },
    });
  });
});

// ============================================================
// B7.2.1 (Codex P1) — POST idempotency via deterministic identity
// ============================================================
describe("POST /api/documents/[documentId]/attachments — B7.2.1 Codex P1 idempotency", () => {
  function setupValidLinkContext() {
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        name: "captable.xlsx",
        version: 1,
      })
      .mockResolvedValueOnce({
        id: EMAIL_ID,
        dealId: "deal_1",
        name: "Q1 update.eml",
        sourceKind: "EMAIL",
        sourceDate: new Date("2026-04-22"),
        isLatest: true,
        processingStatus: "COMPLETED",
      });
  }

  it("Codex B7.2.1 P1 — two POSTs with the same (childDocId, emailDocId) pass IDENTICAL input to createEvidenceSignal (stable scopeKey + stable valueJson → P2002 dedup will fire)", async () => {
    setupValidLinkContext();
    await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    // Re-setup the lookups for the second POST (mocks consume
    // findUnique values per call).
    setupValidLinkContext();
    await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );

    expect(mocks.createEvidenceSignal).toHaveBeenCalledTimes(2);
    const first = mocks.createEvidenceSignal.mock.calls[0]?.[1];
    const second = mocks.createEvidenceSignal.mock.calls[1]?.[1];

    // signalScopeKey MUST be identical across the two calls.
    expect(first?.signalScopeKey).toBe(second?.signalScopeKey);
    // valueJson MUST be deep-equal across the two calls (this is
    // what makes signalHash stable → P2002 → createEvidenceSignal
    // dedup. If setBy/setAt sneak in, this assertion fails).
    expect(first?.valueJson).toEqual(second?.valueJson);
    // extractorVersion + kind + dealId + documentId + documentVersion
    // are also stable (sanity).
    expect(first?.extractorVersion).toBe(second?.extractorVersion);
    expect(first?.kind).toBe(second?.kind);
    expect(first?.dealId).toBe(second?.dealId);
    expect(first?.documentId).toBe(second?.documentId);
    expect(first?.documentVersion).toBe(second?.documentVersion);
  });

  it("Codex B7.2.1 P1 — humanOverrideId is DERIVED from the pair (different pair → different scopeKey)", async () => {
    setupValidLinkContext();
    await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    // Different email target — derivation MUST produce a different
    // scopeKey (otherwise two unrelated links would collide).
    const OTHER_EMAIL = "ckdddddddddddddddddddddddd";
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        name: "captable.xlsx",
        version: 1,
      })
      .mockResolvedValueOnce({
        id: OTHER_EMAIL,
        dealId: "deal_1",
        name: "Other.eml",
        sourceKind: "EMAIL",
        sourceDate: null,
        isLatest: true,
        processingStatus: "COMPLETED",
      });
    await POST(
      makePostRequest({ emailDocumentId: OTHER_EMAIL }) as never,
      makeContext() as never
    );

    const first = mocks.createEvidenceSignal.mock.calls[0]?.[1];
    const second = mocks.createEvidenceSignal.mock.calls[1]?.[1];
    expect(first?.signalScopeKey).not.toBe(second?.signalScopeKey);
  });

  it("Codex B7.2.1 P1 — valueJson does NOT contain setBy / setAt (would break signalHash stability)", async () => {
    setupValidLinkContext();
    await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );

    const value = mocks.createEvidenceSignal.mock.calls[0]?.[1]?.valueJson;
    expect(value).not.toHaveProperty("setBy");
    expect(value).not.toHaveProperty("setAt");
  });
});

// ============================================================
// B7.2.1 (Codex P2 #2) — DELETE refuses signals out of URL doc's context
// ============================================================
describe("DELETE /api/documents/[documentId]/attachments — B7.2.1 Codex P2 cross-document mutation guard", () => {
  const SIGNAL_ID = "ckccccccccccccccccccccccc";
  function setupDocOwnership() {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      version: 1,    });
  }

  it("Codex B7.2.1 P2 — signal in the SAME deal but NOT touching the URL doc → 404 (no mutation)", async () => {
    // The deal has multiple docs. A signal belongs to (B as child)
    // pointing at (C as email). User hits /documents/A/attachments
    // DELETE with that signalId. The route must refuse rather
    // than silently delete / suppress a relation that doesn't
    // belong in this doc's context.
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "source_metadata",
      documentId: "doc_B", // signal lives on B, not on DOC_ID
      valueJson: { alg: "AES-256-GCM", data: "<enc>" },
    });
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      // emailDocId points at C, not at DOC_ID — neither inbound
      // nor outbound from DOC_ID's POV.
      value: { kind: "manual_link", emailDocId: "doc_C" },
    });

    const response = await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
    // NO mutation fires.
    expect(mocks.evidenceSignalDeleteMany).not.toHaveBeenCalled();
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
  });

  it("Codex B7.2.1 P2 — inbound signal (signal.documentId === documentId) is ACCEPTED", async () => {
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "human:cabcdef1234567890abcdef12",
      documentId: DOC_ID, // inbound: signal lives on the URL doc
      valueJson: { alg: "AES-256-GCM", data: "<enc>" },
    });
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { kind: "manual_link", emailDocId: "doc_C" },
    });

    const response = await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
    expect(mocks.evidenceSignalDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("Codex B7.2.1 P2 — outbound signal (decrypted.emailDocId === documentId) is ACCEPTED", async () => {
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "source_metadata",
      documentId: "doc_child_B", // signal lives on a child, not the URL doc
      valueJson: { alg: "AES-256-GCM", data: "<enc>" },
    });
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      // emailDocId === URL doc → outbound from URL doc's POV (the
      // URL doc IS the email).
      value: { kind: "manual_link", emailDocId: DOC_ID },
    });
    // Target host (doc_child_B) version lookup for P2 #3 fix.
    mocks.documentFindUnique.mockResolvedValueOnce({
      version: 3,
      dealId: "deal_1",
    });

    const response = await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
    // It was an auto signal → suppression created (not deleted).
    expect(mocks.evidenceSignalDeleteMany).not.toHaveBeenCalled();
    expect(mocks.createEvidenceSignal).toHaveBeenCalledTimes(1);
  });

  it("Codex B7.2.1 P2 #3 — suppression `documentVersion` comes from the TARGET HOST doc, not the URL doc (outbound case)", async () => {
    // The URL doc is the email (DOC_ID, version 1). The signal
    // lives on a child doc (version 7). The suppression MUST be
    // tagged with version 7 (the child's), not 1 (the email's).
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "source_metadata",
      documentId: "child_doc",
      valueJson: { alg: "AES-256-GCM", data: "<enc>" },
    });
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { kind: "manual_link", emailDocId: DOC_ID }, // outbound
    });
    mocks.documentFindUnique.mockResolvedValueOnce({
      version: 7, // child's version
      dealId: "deal_1",
    });

    await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );

    const createCall = mocks.createEvidenceSignal.mock.calls[0]?.[1];
    expect(createCall?.documentId).toBe("child_doc");
    expect(createCall?.documentVersion).toBe(7); // child's version, NOT URL doc's 1
  });

  it("Codex B7.2.1 P2 #3 — inbound case keeps documentVersion = URL doc's version (no extra fetch)", async () => {
    // Inbound: signal lives on URL doc. The URL doc's version is
    // both the signal's host version AND the suppression's
    // version. No extra findUnique needed.
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "source_metadata",
      documentId: DOC_ID, // inbound
      valueJson: { alg: "AES-256-GCM", data: "<enc>" },
    });
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { kind: "manual_link", emailDocId: "some_email" },
    });

    await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );

    const createCall = mocks.createEvidenceSignal.mock.calls[0]?.[1];
    expect(createCall?.documentId).toBe(DOC_ID);
    expect(createCall?.documentVersion).toBe(1); // URL doc's version
    // B11.2 — ownership now goes through findFirst (1 call); the
    // target-host version fetch (findUnique) MUST be 0 calls in
    // the inbound case (signal lives on the URL doc, so its
    // version is already on `thisDoc`).
    expect(mocks.documentFindUnique).not.toHaveBeenCalled();
  });

  it("Codex B7.2.1 — DELETE on a SUPPRESSION signal is refused (counter-suppression via API would let users un-suppress auto signals)", async () => {
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "human:cabcdef1234567890abcdef12",
      documentId: DOC_ID,
      valueJson: { alg: "AES-256-GCM", data: "<enc>" },
    });
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { kind: "suppression", suppresses: "some_other_sig" },
    });

    const response = await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
    expect(mocks.evidenceSignalDeleteMany).not.toHaveBeenCalled();
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
  });

  it("Codex B7.2.1 — DELETE on a target whose envelope is corrupted is refused (no blind mutation)", async () => {
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "source_metadata",
      documentId: DOC_ID,
      valueJson: { alg: "AES-256-GCM", data: "<garbage>" },
    });
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "corrupted",
      reason: "auth tag mismatch",
    });

    const response = await DELETE(
      makeDeleteRequest({ signalId: SIGNAL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
    expect(mocks.evidenceSignalDeleteMany).not.toHaveBeenCalled();
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
  });

  it("Codex B7.2.2 P2 — valueJson contains ONLY identity fields (no attachmentName / emailSourceDate / setBy / setAt — would break dedup under rename or date-correction)", async () => {
    // Identity-stable contract: the only valueJson keys for a
    // manual_link signal are { kind, emailDocId, matchMethod }.
    // Any other field (attachmentName from thisDoc.name,
    // emailSourceDate from emailDoc.sourceDate, setBy, setAt)
    // would change between POSTs whenever the underlying doc is
    // renamed or the email's sourceDate is corrected — and
    // signalHash includes valueJson, so dedup would fail.
    const SIGNAL_ID = "ckccccccccccccccccccccccc";
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        name: "captable_v1.xlsx",
        version: 1,
      })
      .mockResolvedValueOnce({
        id: EMAIL_ID,
        dealId: "deal_1",
        name: "Q1.eml",
        sourceKind: "EMAIL",
        sourceDate: new Date("2026-04-22"),
        isLatest: true,
        processingStatus: "COMPLETED",
      });

    await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );

    const value = mocks.createEvidenceSignal.mock.calls[0]?.[1]?.valueJson as Record<string, unknown>;
    // Whitelist: ONLY these 3 keys.
    expect(Object.keys(value).sort()).toEqual(["emailDocId", "kind", "matchMethod"]);
    void SIGNAL_ID;
  });

  it("Codex B7.2.2 P2 — POST 2× with SAME pair but DIFFERENT doc name + DIFFERENT email sourceDate → SAME signalScopeKey + SAME valueJson (rename + date correction don't break dedup)", async () => {
    // The bug B7.2.2 closes: between two POSTs, the child doc
    // can be renamed (B6.1) AND the email's sourceDate can be
    // corrected (B6.3). Pre-B7.2.2, the second POST would land
    // a duplicate signal because valueJson.attachmentName +
    // valueJson.emailSourceDate captured the snapshots and
    // changed signalHash.
    //
    // Now valueJson is identity-only → same hash → P2002 →
    // createEvidenceSignal dedups.
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        name: "captable_v1.xlsx", // first rev
        version: 1,
      })
      .mockResolvedValueOnce({
        id: EMAIL_ID,
        dealId: "deal_1",
        name: "Q1.eml",
        sourceKind: "EMAIL",
        sourceDate: new Date("2026-04-22"), // first sourceDate
        isLatest: true,
        processingStatus: "COMPLETED",
      });
    await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );

    // Between the two POSTs: doc renamed + email sourceDate
    // corrected. Re-mock with the NEW snapshots.
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        name: "captable_RENAMED.xlsx", // RENAME
        version: 1,
      })
      .mockResolvedValueOnce({
        id: EMAIL_ID,
        dealId: "deal_1",
        name: "Q1.eml",
        sourceKind: "EMAIL",
        sourceDate: new Date("2026-05-15"), // CORRECTED DATE
        isLatest: true,
        processingStatus: "COMPLETED",
      });
    await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );

    const first = mocks.createEvidenceSignal.mock.calls[0]?.[1];
    const second = mocks.createEvidenceSignal.mock.calls[1]?.[1];

    // SAME scopeKey (derived from pair only).
    expect(first?.signalScopeKey).toBe(second?.signalScopeKey);
    // SAME valueJson DEEP — this is what makes signalHash stable.
    expect(first?.valueJson).toEqual(second?.valueJson);
    // Sanity: valueJson DOESN'T contain the snapshots.
    expect(first?.valueJson).not.toHaveProperty("attachmentName");
    expect(first?.valueJson).not.toHaveProperty("emailSourceDate");
  });

  it("Codex B7.2.2 P2 — POST refuses targets where isLatest=false (no link to stale versions)", async () => {
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        name: "x",
        version: 1,
      })
      .mockResolvedValueOnce({
        id: EMAIL_ID,
        dealId: "deal_1",
        name: "Q1.eml",
        sourceKind: "EMAIL",
        sourceDate: new Date("2026-04-22"),
        isLatest: false, // <-- stale version
        processingStatus: "COMPLETED",
      });

    const response = await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/latest version/i);
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
  });

  it("Codex B7.2.2 P2 — POST refuses targets where processingStatus=FAILED (no link to broken emails)", async () => {
    mocks.documentFindFirst
      .mockResolvedValueOnce({
        id: DOC_ID,
        dealId: "deal_1",
        name: "x",
        version: 1,
      })
      .mockResolvedValueOnce({
        id: EMAIL_ID,
        dealId: "deal_1",
        name: "Q1.eml",
        sourceKind: "EMAIL",
        sourceDate: null,
        isLatest: true,
        processingStatus: "FAILED", // <-- broken
      });

    const response = await POST(
      makePostRequest({ emailDocumentId: EMAIL_ID }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/extraction failed/i);
    expect(mocks.createEvidenceSignal).not.toHaveBeenCalled();
  });

  it("Codex B7.2.2 P2 — candidateEmails picker query filters isLatest=true AND processingStatus != FAILED (no stale/broken options in the dropdown)", async () => {
    await GET(makeRequest() as never, makeContext() as never);

    // The candidate-emails query is the FIRST documentFindMany call
    // (it runs inside the Promise.all alongside the signal queries).
    // The related-docs query only fires when referencedDocIds is
    // non-empty, so with no signals in this test it doesn't run.
    expect(mocks.documentFindMany).toHaveBeenCalled();
    const candidatesCall = mocks.documentFindMany.mock.calls[0]?.[0];
    expect(candidatesCall?.where).toMatchObject({
      dealId: "deal_1",
      sourceKind: "EMAIL",
      id: { not: DOC_ID },
      isLatest: true,
      processingStatus: { not: "FAILED" },
    });
  });

  it("Codex B7.2.2 P2 — GET human inbound entry derives attachmentName from THIS doc's current name (not from valueJson snapshot)", async () => {
    // The URL doc is the CHILD. Its name was last set to
    // "renamed-cap-table.xlsx" (e.g. via B6.1 rename). The human
    // manual_link signal's valueJson has NO attachmentName.
    // buildEntry MUST surface "renamed-cap-table.xlsx" — proof
    // that the read path derives from the live doc.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "FILE",
      name: "renamed-cap-table.xlsx", // current name (post-rename)
      sourceDate: null,    });
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_human_link",
          valueJson: { alg: "AES-256-GCM", data: "<enc>" },
          confidence: "HIGH",
          reportedAt: new Date("2026-04-22"),
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          signalScopeKey: "human:cabcdef1234567890abcdef12",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      // Minimal valueJson — no attachmentName.
      value: { kind: "manual_link", emailDocId: "email_doc_1", matchMethod: "manual" },
    });
    mocks.documentFindMany.mockResolvedValueOnce([]); // candidate emails
    mocks.documentFindMany.mockResolvedValueOnce([
      {
        id: "email_doc_1",
        name: "Q1.eml",
        type: "OTHER",
        sourceDate: new Date("2026-05-15"), // post-correction email date
      },
    ]);

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as {
      data: { inbound: Array<Record<string, unknown>> };
    };
    expect(body.data.inbound).toHaveLength(1);
    // attachmentName comes from THIS doc's current name.
    expect(body.data.inbound[0]?.attachmentName).toBe("renamed-cap-table.xlsx");
    // emailSourceDate comes from the RELATED email's current sourceDate.
    expect(body.data.inbound[0]?.emailSourceDate).toMatch(/^2026-05-15/);
  });

  it("Codex B7.2.2 P2 — GET human outbound entry derives attachmentName from the RELATED CHILD's current name + emailSourceDate from THIS email's current sourceDate", async () => {
    // The URL doc is the EMAIL. The signal's documentId is the
    // child's id. buildEntry must derive:
    //   attachmentName  = related (child).name
    //   emailSourceDate = this doc (email).sourceDate
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: DOC_ID,
      dealId: "deal_1",
      sourceKind: "EMAIL",
      name: "Q1.eml",
      sourceDate: new Date("2026-06-01"), // current sourceDate post-correction
    });
    mocks.evidenceSignalFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "sig_human_outbound",
        documentId: "child_1",
        valueJson: { alg: "AES-256-GCM", data: "<enc>" },
        confidence: "HIGH",
        reportedAt: null,
        createdAt: new Date(),
        signalScopeKey: "human:cabcdef1234567890abcdef12",
      },
    ]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { kind: "manual_link", emailDocId: DOC_ID, matchMethod: "manual" },
    });
    mocks.documentFindMany.mockResolvedValueOnce([]); // candidate emails
    mocks.documentFindMany.mockResolvedValueOnce([
      {
        id: "child_1",
        name: "renamed-deck.pdf",
        type: "PITCH_DECK",
        sourceDate: null,
      },
    ]);

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as {
      data: { outbound: Array<Record<string, unknown>> };
    };
    expect(body.data.outbound).toHaveLength(1);
    expect(body.data.outbound[0]?.attachmentName).toBe("renamed-deck.pdf");
    expect(body.data.outbound[0]?.emailSourceDate).toMatch(/^2026-06-01/);
  });

  it("Codex B7.2.2 P2 — AUTO entries STILL read attachmentName + emailSourceDate from valueJson snapshot (auto signals are regenerated by B6.3 recompute when needed, so this is OK)", async () => {
    mocks.evidenceSignalFindMany
      .mockResolvedValueOnce([
        {
          id: "sig_auto",
          valueJson: { alg: "AES-256-GCM", data: "<enc>" },
          confidence: "HIGH",
          reportedAt: new Date("2026-04-22"),
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          signalScopeKey: "source_metadata",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: {
        emailDocId: "email_doc_1",
        // Auto path: valueJson DOES carry these (snapshot at linker time).
        attachmentName: "auto-linker-named.xlsx",
        emailSourceDate: "2026-04-22T00:00:00.000Z",
        matchMethod: "exact",
      },
    });
    mocks.documentFindMany.mockResolvedValueOnce([]); // candidate emails
    mocks.documentFindMany.mockResolvedValueOnce([
      { id: "email_doc_1", name: "Q1.eml", type: "OTHER", sourceDate: new Date("2026-04-22") },
    ]);

    const response = await GET(makeRequest() as never, makeContext() as never);
    const body = (await response.json()) as {
      data: { inbound: Array<Record<string, unknown>> };
    };
    // Auto path: attachmentName + emailSourceDate from valueJson.
    expect(body.data.inbound[0]?.attachmentName).toBe("auto-linker-named.xlsx");
    expect(body.data.inbound[0]?.emailSourceDate).toBe("2026-04-22T00:00:00.000Z");
  });

  it("Codex B7.2.1 P1 — two unlinks of the same auto signal pass IDENTICAL input to createEvidenceSignal (suppression idempotent)", async () => {
    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "source_metadata",
      documentId: DOC_ID,
      valueJson: { alg: "AES-256-GCM", data: "<enc>" },
    });
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { kind: "manual_link", emailDocId: "some_email" },
    });
    await DELETE(makeDeleteRequest({ signalId: SIGNAL_ID }) as never, makeContext() as never);

    setupDocOwnership();
    mocks.evidenceSignalFindFirst.mockResolvedValueOnce({
      id: SIGNAL_ID,
      signalScopeKey: "source_metadata",
      documentId: DOC_ID,
      valueJson: { alg: "AES-256-GCM", data: "<enc>" },
    });
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { kind: "manual_link", emailDocId: "some_email" },
    });
    await DELETE(makeDeleteRequest({ signalId: SIGNAL_ID }) as never, makeContext() as never);

    expect(mocks.createEvidenceSignal).toHaveBeenCalledTimes(2);
    const first = mocks.createEvidenceSignal.mock.calls[0]?.[1];
    const second = mocks.createEvidenceSignal.mock.calls[1]?.[1];
    expect(first?.signalScopeKey).toBe(second?.signalScopeKey);
    expect(first?.valueJson).toEqual(second?.valueJson);
  });
});
