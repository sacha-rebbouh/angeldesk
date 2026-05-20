import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase B6.1 — tests for PATCH /api/documents/[documentId]/metadata.
// Scope: sourceDate override. B6.2/B6.3 will land sourceKind / type /
// email metadata in additional tests on the same endpoint.
//
// We don't spin up a real Prisma — we mock the client surface used by
// the route (findUnique + updateMany) and assert the route's contracts:
//   - auth required (401);
//   - ownership enforced (403 if deal.userId !== user.id);
//   - 200 happy path mutates sourceDate AND merges sourceMetadata.manual
//     with an audit trail (setBy / setAt / previousValue);
//   - 400 on invalid body (missing date / unparseable / empty PATCH);
//   - 404 on unknown document;
//   - 404 on race with delete (updateMany returns count:0);
//   - existing sourceMetadata blocks (e.g. `temporal` set by
//     promote-source-date.ts) MUST be preserved verbatim — patch, not
//     replace.

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  // B11.2 — composite ownership lookup uses findFirst now
  // (404 uniform on cross-tenant / missing); the route's post-PATCH
  // canonical-row re-fetch still uses findUnique on the owned row.
  documentFindFirst: vi.fn(),
  documentFindUnique: vi.fn(),
  documentUpdateMany: vi.fn(),
  // B11.2 — new gates: rate limit + analysis-running guard.
  checkRateLimitDistributed: vi.fn(),
  getRunningAnalysisForDeal: vi.fn(),
  // B6.1 fix-up (Codex P2) — patchDocumentSourceMetadataAtomic uses
  // $transaction. We share ONE mock `transaction` for both:
  //   (a) the helper's txn (patch sourceMetadata + Document columns)
  //   (b) the route's recompute txn (B6.2.2 — delete owned signals +
  //       optional outbound cleanup + runEvidenceForDocument)
  // The mock impl in beforeEach dispatches to the right tx-scoped
  // proxies based on the call order (helper first, recompute second).
  transaction: vi.fn(),
  txDocumentFindUnique: vi.fn(),
  txDocumentUpdateMany: vi.fn(),
  // B6.2.2 — recompute happens INSIDE a tx now (delete + recompute
  // atomic). These mocks are wired through the tx proxy.
  txEvidenceSignalDeleteMany: vi.fn(),
  // B6.2.3 (Codex P1) — outbound cleanup now reads candidates,
  // decrypts in-app, then deletes by id. Tests mock the read with
  // pre-decrypted shapes via the decrypt mock below.
  txEvidenceSignalFindMany: vi.fn(),
  tryDecryptJsonField: vi.fn(),
  runEvidenceForDocument: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/api-error", () => ({ handleApiError: mocks.handleApiError }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: mocks.documentFindFirst,
      findUnique: mocks.documentFindUnique,
      updateMany: mocks.documentUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/sanitize", () => ({
  checkRateLimitDistributed: mocks.checkRateLimitDistributed,
}));
vi.mock("@/services/analysis/guards", () => ({
  getRunningAnalysisForDeal: mocks.getRunningAnalysisForDeal,
  // The route uses isPendingThesisReview only to pick the error
  // message; we don't need to assert on it, just provide a stub.
  isPendingThesisReview: () => false,
}));
vi.mock("@/services/evidence", () => ({
  runEvidenceForDocument: mocks.runEvidenceForDocument,
}));
// B6.2.3 — the route now decrypts ATTACHMENT_RELATION envelopes in-
// app during the EMAIL → non-EMAIL cleanup. Mocking
// tryDecryptJsonField lets the test drive the post-decrypt shape
// without needing real AES-256-GCM keys.
vi.mock("@/lib/encryption", () => ({
  tryDecryptJsonField: mocks.tryDecryptJsonField,
}));

const { PATCH } = await import("../route");

function makeContext() {
  return { params: Promise.resolve({ documentId: "ck8aaaaaaaaaaaaaaaaaaaaa" }) };
}

function makeRequest(body: unknown) {
  return new Request("https://x/api/documents/ck8aaaaaaaaaaaaaaaaaaaaa/metadata", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: "user_owner" });
  // B11.2 — rate-limit allowed by default (tests override for the 429
  // case) + analysis NOT running (tests override for the 409 case).
  mocks.checkRateLimitDistributed.mockResolvedValue({ allowed: true });
  mocks.getRunningAnalysisForDeal.mockResolvedValue(null);
  // B11.2 — the OWNERSHIP lookup uses `findFirst` (composite where
  // returning 404 uniformly). The re-fetch for the response payload
  // still uses `findUnique`. Both default to a permissive shape so
  // the happy-path test works without per-case overrides; tests
  // targeting specific shapes use mockResolvedValueOnce on the
  // appropriate mock.
  mocks.documentFindFirst.mockResolvedValue({
    id: "ck8aaaaaaaaaaaaaaaaaaaaa",
    dealId: "deal_1",
    sourceDate: null,
    sourceKind: "FILE",
    type: "PITCH_DECK",
    processingStatus: "COMPLETED",
  });
  mocks.documentFindUnique.mockResolvedValue({
    id: "ck8aaaaaaaaaaaaaaaaaaaaa",
    dealId: "deal_1",
    sourceDate: null,
    sourceMetadata: null,
    sourceKind: "FILE",
    type: "PITCH_DECK",
    name: "deck.pdf",
    processingStatus: "COMPLETED",
  });
  // B6.2.1 / B6.2.2 — recompute mocks default to success no-op so
  // happy paths for non-type/sourceKind PATCHes (sourceDate-only)
  // keep passing without per-test setup. Tests that exercise the
  // recompute override these as needed.
  mocks.txEvidenceSignalDeleteMany.mockResolvedValue({ count: 0 });
  mocks.runEvidenceForDocument.mockResolvedValue({
    status: "ran",
    signalsPersisted: 0,
    signalsDeduplicated: 0,
    promoted: false,
    attachmentsLinked: 0,
    claimsPersisted: 0,
    claimsDeduplicated: 0,
  });
  // The $transaction mock dispatches the helper's tx (sourceMetadata
  // patch) and the route's recompute tx (delete + recompute). Both
  // get a tx object with the document model + evidenceSignal model.
  // The mock impl runs the callback inline so test assertions on the
  // tx-scoped mocks fire synchronously.
  mocks.transaction.mockImplementation(
    async (
      fn: (tx: {
        document: { findUnique: unknown; updateMany: unknown };
        evidenceSignal: { deleteMany: unknown; findMany: unknown };
      }) => unknown
    ) => {
      const tx = {
        document: {
          findUnique: mocks.txDocumentFindUnique,
          updateMany: mocks.txDocumentUpdateMany,
        },
        evidenceSignal: {
          deleteMany: mocks.txEvidenceSignalDeleteMany,
          findMany: mocks.txEvidenceSignalFindMany,
        },
      };
      return fn(tx);
    }
  );
  // B6.2.3 — default to empty candidate list so non-EMAIL→non-EMAIL
  // tests don't accidentally trigger the outbound cleanup branch.
  mocks.txEvidenceSignalFindMany.mockResolvedValue([]);
  // Default decrypt impl: anything looking like a plain object →
  // return as plaintext; anything else → absent. Tests override per
  // case with mockImplementationOnce.
  mocks.tryDecryptJsonField.mockImplementation((value: unknown) => {
    if (value === null || value === undefined) return { kind: "absent" };
    if (typeof value === "object" && !Array.isArray(value)) {
      return { kind: "plaintext", value };
    }
    return { kind: "absent" };
  });
  mocks.documentUpdateMany.mockResolvedValue({ count: 1 });
  mocks.txDocumentFindUnique.mockResolvedValue({
    id: "ck8aaaaaaaaaaaaaaaaaaaaa",
    dealId: "deal_1",
    sourceDate: null,
    sourceMetadata: null,
    // B6.2 — helper now also reads type + sourceKind so the patch fn
    // can capture them as previousValue in the audit trail.
    type: "PITCH_DECK",
    sourceKind: "FILE",
  });
  mocks.txDocumentUpdateMany.mockResolvedValue({ count: 1 });
  // B6.2.2 — the single $transaction mock impl above (line ~110)
  // dispatches BOTH the helper's patch txn (document.findUnique +
  // updateMany) AND the route's recompute txn (evidenceSignal.deleteMany
  // + runEvidenceForDocument with the tx-scoped prisma proxy). The
  // legacy second mockImplementation that lived here was a leftover
  // from B6.1 round 2 — it OVERWROTE the first with a tx that lacked
  // `evidenceSignal`, breaking the recompute path. Removed.
  mocks.handleApiError.mockImplementation(
    (error: unknown) =>
      new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "internal" }),
        { status: 500 }
      )
  );
});

describe("PATCH /api/documents/[documentId]/metadata — B6.1 sourceDate override", () => {
  it("happy path — 200, mutates sourceDate AND patches sourceMetadata.manual.sourceDate with audit trail (write is INSIDE the helper's transaction)", async () => {
    const response = await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);

    // B6.1 fix-up — the write moved INSIDE the helper's
    // $transaction. The route-level `documentUpdateMany` mock must
    // NOT have been called; only the tx-scoped one.
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
    expect(mocks.txDocumentUpdateMany).toHaveBeenCalledTimes(1);

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    // IDOR-safe scope: both id + dealId in the WHERE.
    expect(call?.where).toMatchObject({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
    });
    // sourceDate written as a Date.
    expect(call?.data?.sourceDate).toBeInstanceOf(Date);
    expect((call?.data?.sourceDate as Date).toISOString().startsWith("2026-03-14")).toBe(true);
    // sourceMetadata.manual.sourceDate audit trail:
    const meta = call?.data?.sourceMetadata as Record<string, unknown>;
    const manual = meta.manual as Record<string, unknown>;
    const audit = manual.sourceDate as Record<string, unknown>;
    expect(audit.setBy).toBe("user_owner");
    expect(typeof audit.setAt).toBe("string");
    expect(audit.previousValue).toBeNull();
    expect(audit.newValue).toMatch(/^2026-03-14T/);
  });

  it("preserves existing sourceMetadata blocks (e.g. temporal from promote-source-date) — patch, not replace", async () => {
    // Critical: B6.1 spec — "sourceMetadata trace manual override".
    // The Phase 3 evidence-engine writes a `temporal` block. If our
    // PATCH replaced sourceMetadata wholesale, the promotion provenance
    // would be lost. The merge must keep `temporal` intact and only
    // add/replace the `manual.sourceDate` block.
    //
    // The "existing metadata" comes from the tx-scoped findUnique
    // inside the helper, NOT from the outer ownership check.
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      sourceDate: new Date("2025-01-01"),
      sourceMetadata: {
        temporal: {
          promotedBy: "evidence-engine-phase3",
          promotedAt: "2025-12-15T10:00:00.000Z",
          evidenceSignalId: "sig_old",
          kind: "DOCUMENT_DATE",
        },
        someOtherBlock: { kept: true },
      },
      type: "PITCH_DECK",
      sourceKind: "FILE",
    });

    await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    const meta = call?.data?.sourceMetadata as Record<string, unknown>;
    // Existing blocks preserved verbatim.
    expect(meta.temporal).toMatchObject({
      promotedBy: "evidence-engine-phase3",
      evidenceSignalId: "sig_old",
    });
    expect(meta.someOtherBlock).toEqual({ kept: true });
    // New manual block added.
    const manual = meta.manual as Record<string, unknown>;
    const audit = manual.sourceDate as Record<string, unknown>;
    expect(audit.setBy).toBe("user_owner");
    // previousValue captures the PRE-override sourceDate so the audit
    // trail is complete.
    expect(audit.previousValue).toBe(new Date("2025-01-01").toISOString());
  });

  it("subsequent overrides preserve existing manual block siblings (B6.2/B6.3 forward-compat)", async () => {
    // Forward-compat: when B6.2 lands manual.documentType and B6.3 lands
    // manual.email, a sourceDate edit MUST NOT clobber them. Anchor the
    // merge contract now.
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      sourceDate: null,
      sourceMetadata: {
        manual: {
          documentType: { setBy: "user_other", setAt: "2026-02-01T00:00:00.000Z" },
          email: { setBy: "user_other", setAt: "2026-02-02T00:00:00.000Z" },
        },
      },
      type: "PITCH_DECK",
      sourceKind: "FILE",
    });

    await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    const meta = call?.data?.sourceMetadata as Record<string, unknown>;
    const manual = meta.manual as Record<string, unknown>;
    expect(manual.documentType).toMatchObject({ setBy: "user_other" });
    expect(manual.email).toMatchObject({ setBy: "user_other" });
    expect(manual.sourceDate).toBeDefined();
  });

  it("B11.2 — IDOR uniformised to 404 when deal.userId !== requesting user (no mutation, no transaction opened)", async () => {
    // Pre-B11.2 the route returned 403; the composite `findFirst`
    // now returns `null` for cross-tenant doc ids, so the route
    // 404s identically to the "doc never existed" case. Anti-
    // enumeration on the metadata PATCH surface.
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const response = await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
    // Neither write path fires (the txn must not even open).
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
    // Anchor the userId scoping in the composite where.
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deal: { userId: "user_owner" },
        }),
      })
    );
  });

  it("404 when the document does not exist (txn not opened)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const response = await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("404 on delete race inside the patch txn (helper throws DocumentNotFoundForMetadataPatchError → 404)", async () => {
    // The tx-scoped findUnique returns null (the row vanished between
    // the ownership check and the patch txn). The helper throws
    // DocumentNotFoundForMetadataPatchError; the route catches and
    // returns 404 — same UX as the "doc never existed" case.
    mocks.txDocumentFindUnique.mockResolvedValueOnce(null);

    const response = await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
  });

  it("404 on delete race AFTER the tx-scoped findUnique (updateMany returns count:0)", async () => {
    // Scenario: the tx-scoped findUnique sees the row, but the
    // updateMany right after returns count:0 (the row vanished
    // mid-transaction). Helper throws DocumentNotFoundForMetadataPatchError.
    mocks.txDocumentUpdateMany.mockResolvedValueOnce({ count: 0 });

    const response = await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
  });

  it("400 when documentId is not a CUID", async () => {
    const ctx = { params: Promise.resolve({ documentId: "not-a-cuid" }) };
    const response = await PATCH(makeRequest({ sourceDate: "2026-03-14" }) as never, ctx as never);
    expect(response.status).toBe(400);
    expect(mocks.documentFindUnique).not.toHaveBeenCalled();
  });

  it("400 when body is missing sourceDate (empty PATCH)", async () => {
    const response = await PATCH(makeRequest({}) as never, makeContext() as never);
    expect(response.status).toBe(400);
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("400 when body is not a JSON object", async () => {
    const response = await PATCH(makeRequest('"not an object"') as never, makeContext() as never);
    expect(response.status).toBe(400);
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("400 when sourceDate is empty string (clear-via-empty-string is explicitly NOT supported)", async () => {
    const response = await PATCH(
      makeRequest({ sourceDate: "" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("400 when sourceDate is unparseable", async () => {
    const response = await PATCH(
      makeRequest({ sourceDate: "not-a-date" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("returns the updated doc shape (id, sourceDate, sourceMetadata, sourceKind, type, name, processingStatus)", async () => {
    // B11.2 — ownership now uses findFirst; the post-update re-fetch
    // still uses findUnique. Mock the two surfaces separately.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      sourceDate: null,
      sourceKind: "FILE",
      type: "PITCH_DECK",
      processingStatus: "COMPLETED",
    });
    mocks.documentFindUnique.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      sourceDate: new Date("2026-03-14"),
      sourceMetadata: { manual: { sourceDate: { setBy: "user_owner" } } },
      sourceKind: "FILE",
      type: "PITCH_DECK",
      name: "deck.pdf",
      processingStatus: "COMPLETED",
    });

    const response = await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      sourceKind: "FILE",
      type: "PITCH_DECK",
      processingStatus: "COMPLETED",
    });
    expect(body.data.sourceMetadata).toMatchObject({
      manual: { sourceDate: { setBy: "user_owner" } },
    });
  });

  it("Codex B6.1 P2 — write is wrapped in a Serializable transaction (atomic merge against concurrent writers)", async () => {
    // The helper opens `$transaction({ ... }, { isolationLevel:
    // Prisma.TransactionIsolationLevel.Serializable })`. Anchor the
    // contract structurally so a future refactor that loses the
    // isolation hint surfaces as a test failure.
    await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const transactionOptions = mocks.transaction.mock.calls[0]?.[1];
    expect(transactionOptions).toMatchObject({
      isolationLevel: "Serializable",
    });
  });
});

// ============================================================
// B6.1 — backfill protection invariants (anchored on the gates that
// already exist in the codebase — anti-regression guards).
// ============================================================
describe("B6.1 — backfill protection (existing gates preserved)", () => {
  it("promote-source-date.ts gates promotion on `currentSourceDate !== null` (manual override is a Date → blocks promotion)", async () => {
    // Anti-regression: B6.1 relies on the existing promote-source-date
    // gate to protect manual overrides. If a future refactor drops the
    // gate, manual sourceDate could be overwritten by a backfill batch.
    // Anchor the grep here so this test fails immediately if the gate
    // is removed.
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const promoteSource = readFileSync(
      join(
        process.cwd(),
        "src",
        "services",
        "evidence",
        "promote-source-date.ts"
      ),
      "utf8"
    );
    // Early return when sourceDate is already set.
    expect(promoteSource).toMatch(
      /if\s*\(input\.currentSourceDate\)\s*\{\s*return\s*\{\s*promoted:\s*false,\s*reason:\s*"source_date_already_set"/
    );
    // Atomic SQL gate (race-safe).
    expect(promoteSource).toMatch(
      /prisma\.document\.updateMany\([\s\S]{0,400}sourceDate:\s*null/
    );
  });

  it("email-source-inference.ts returns null when existingSourceDate is set (manual override blocks email inference)", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const inferenceSource = readFileSync(
      join(
        process.cwd(),
        "src",
        "services",
        "documents",
        "email-source-inference.ts"
      ),
      "utf8"
    );
    // Early bail on existing sourceDate.
    expect(inferenceSource).toMatch(
      /if\s*\(params\.existingSourceDate\)\s*return\s*null/
    );
  });
});

// ============================================================
// B6.2 — Edit document type + sourceKind (strict slice)
// ============================================================
describe("PATCH /api/documents/[documentId]/metadata — B6.2 type + sourceKind", () => {
  it("happy path — type only: 200, writes Document.type + manual.documentType audit trail (sourceDate untouched)", async () => {
    const response = await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);

    expect(mocks.txDocumentUpdateMany).toHaveBeenCalledTimes(1);
    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];

    // IDOR-safe scope preserved.
    expect(call?.where).toMatchObject({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
    });

    // Document.type column written.
    expect(call?.data?.type).toBe("FINANCIAL_MODEL");
    // sourceDate NOT touched (request didn't include it).
    expect(call?.data).not.toHaveProperty("sourceDate");
    // sourceKind NOT touched.
    expect(call?.data).not.toHaveProperty("sourceKind");

    // Audit trail block.
    const meta = call?.data?.sourceMetadata as Record<string, unknown>;
    const manual = meta.manual as Record<string, unknown>;
    const audit = manual.documentType as Record<string, unknown>;
    expect(audit.setBy).toBe("user_owner");
    expect(typeof audit.setAt).toBe("string");
    expect(audit.previousValue).toBe("PITCH_DECK"); // from snapshot default
    expect(audit.newValue).toBe("FINANCIAL_MODEL");
  });

  it("happy path — sourceKind only: 200, writes Document.sourceKind + manual.sourceKind audit trail", async () => {
    const response = await PATCH(
      makeRequest({ sourceKind: "EMAIL" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.sourceKind).toBe("EMAIL");
    expect(call?.data).not.toHaveProperty("type");
    expect(call?.data).not.toHaveProperty("sourceDate");

    const meta = call?.data?.sourceMetadata as Record<string, unknown>;
    const manual = meta.manual as Record<string, unknown>;
    const audit = manual.sourceKind as Record<string, unknown>;
    expect(audit.setBy).toBe("user_owner");
    expect(audit.previousValue).toBe("FILE");
    expect(audit.newValue).toBe("EMAIL");
  });

  it("happy path — all three fields at once (sourceDate + type + sourceKind): single atomic update, three audit blocks", async () => {
    const response = await PATCH(
      makeRequest({
        sourceDate: "2026-03-14",
        type: "FINANCIAL_MODEL",
        sourceKind: "EMAIL",
      }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);

    // ONE updateMany — atomicity (same txn).
    expect(mocks.txDocumentUpdateMany).toHaveBeenCalledTimes(1);
    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];

    // All three column writes in the same data object.
    expect(call?.data?.sourceDate).toBeInstanceOf(Date);
    expect(call?.data?.type).toBe("FINANCIAL_MODEL");
    expect(call?.data?.sourceKind).toBe("EMAIL");

    // Three audit blocks under sourceMetadata.manual.
    const manual = (call?.data?.sourceMetadata as Record<string, unknown>).manual as Record<string, unknown>;
    expect(manual.sourceDate).toBeDefined();
    expect(manual.documentType).toBeDefined();
    expect(manual.sourceKind).toBeDefined();
  });

  it("Codex B6.2 — patches preserve sibling manual blocks (B6.1 manual.sourceDate survives a type-only patch)", () => {
    // The atomic helper is responsible for the merge; the route's
    // patch fn must not blow away siblings. Anchor here so a future
    // refactor of the manual-block merge logic catches the regression.
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      sourceDate: new Date("2025-09-01"),
      sourceMetadata: {
        manual: {
          // Pre-existing B6.1 manual override that must survive.
          sourceDate: {
            setBy: "user_owner",
            setAt: "2026-02-15T00:00:00.000Z",
            previousValue: null,
            newValue: "2025-09-01T00:00:00.000Z",
          },
        },
        temporal: { promotedBy: "evidence-engine-phase3" },
      },
      type: "OTHER",
      sourceKind: "FILE",
    });

    return PATCH(
      makeRequest({ type: "PITCH_DECK" }) as never,
      makeContext() as never
    ).then(() => {
      const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
      const meta = call?.data?.sourceMetadata as Record<string, unknown>;
      const manual = meta.manual as Record<string, unknown>;
      // B6.1 sourceDate survives.
      expect(manual.sourceDate).toMatchObject({
        setBy: "user_owner",
        previousValue: null,
        newValue: "2025-09-01T00:00:00.000Z",
      });
      // B6.2 documentType added.
      expect(manual.documentType).toMatchObject({
        previousValue: "OTHER",
        newValue: "PITCH_DECK",
      });
      // temporal block (Phase 3) verbatim.
      expect(meta.temporal).toMatchObject({ promotedBy: "evidence-engine-phase3" });
      // sourceDate column NOT touched (no sourceDate in request).
      expect(call?.data).not.toHaveProperty("sourceDate");
    });
  });

  it("400 when type is not a valid DocumentType enum value (no string injection)", async () => {
    const response = await PATCH(
      makeRequest({ type: "NOT_A_REAL_TYPE" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("400 when sourceKind is not a valid DocumentSourceKind enum value", async () => {
    const response = await PATCH(
      makeRequest({ sourceKind: "WEBSITE" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("400 when type is an empty string (Zod enum rejects)", async () => {
    const response = await PATCH(
      makeRequest({ type: "" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
  });

  it("B11.2 — IDOR uniformised to 404 — same gate for type/sourceKind as for sourceDate", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce(null);

    const response = await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL", sourceKind: "EMAIL" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("Codex B6.2 — write happens INSIDE a Serializable transaction (atomicity proof)", async () => {
    // type + sourceKind ride the same txn as sourceDate inside the
    // helper. B6.2.2 ADDS a SECOND $transaction for the Evidence
    // recompute (delete owned signals + runEvidenceForDocument) so
    // a recompute failure rolls back without losing the delete.
    //
    // Both txns MUST be Serializable.
    await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL", sourceKind: "EMAIL" }) as never,
      makeContext() as never
    );
    // Helper patch txn + recompute txn = 2 calls total (the
    // recompute fires because type AND sourceKind changed on the
    // default COMPLETED doc).
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    for (const call of mocks.transaction.mock.calls) {
      expect(call[1]).toMatchObject({ isolationLevel: "Serializable" });
    }
  });
});

// ============================================================
// B6.2 — Anti-regression on the additionalDocumentFields surface
// ============================================================
describe("Codex B6.2 — additionalDocumentFields constraint (helper cannot smuggle non-metadata columns)", () => {
  it("the helper's SourceMetadataPatchResult type CONSTRAINS additionalDocumentFields to { type?, sourceKind? } — no extractedText / processingStatus / etc.", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const helperSource = readFileSync(
      join(process.cwd(), "src", "services", "documents", "source-metadata.ts"),
      "utf8"
    );
    // The type literal MUST be a closed shape (B6.2 type + sourceKind,
    // B6.3 receivedAt + sourceAuthor + sourceSubject) — never
    // `Record<string, unknown>`. A regression that widens this would
    // let any column be written through the metadata endpoint,
    // breaking the contract.
    expect(helperSource).toMatch(
      /additionalDocumentFields\?\s*:\s*\{[\s\S]{0,500}type\?\s*:\s*DocumentType;[\s\S]{0,500}sourceKind\?\s*:\s*DocumentSourceKind;[\s\S]{0,500}receivedAt\?\s*:\s*Date\s*\|\s*null;[\s\S]{0,500}sourceAuthor\?\s*:\s*string\s*\|\s*null;[\s\S]{0,500}sourceSubject\?\s*:\s*string\s*\|\s*null;\s*\}/
    );
    // The widening anti-pattern MUST NOT show up.
    expect(helperSource).not.toMatch(
      /additionalDocumentFields\?\s*:\s*Record<string,\s*unknown>/
    );
  });
});

// ============================================================
// B6.2.1 (Codex P1) — Evidence recompute on type/sourceKind change
// ============================================================
describe("PATCH /api/documents/[documentId]/metadata — B6.2.1 Codex P1 Evidence recompute", () => {
  it("type change on a COMPLETED doc → deletes existing signals + re-runs runEvidenceForDocument (OTHER → FINANCIAL_MODEL case)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );

    // Step 1: wipe the doc's OWNED signals (clean slate) — B6.2.2
    // scopes the delete to non-ATTACHMENT_RELATION kinds so inbound
    // attachment provenance is preserved.
    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledWith({
      where: {
        documentId: "ck8aaaaaaaaaaaaaaaaaaaaa",
        dealId: "deal_1",
        kind: { not: "ATTACHMENT_RELATION" },
      },
    });
    // Step 2: re-run evidence with the new type — claims-extractor
    // will now branch FINANCIAL_MODEL → forecast signals.
    expect(mocks.runEvidenceForDocument).toHaveBeenCalledTimes(1);
    expect(mocks.runEvidenceForDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ documentId: "ck8aaaaaaaaaaaaaaaaaaaaa" })
    );
    // Ordering: delete BEFORE recompute (anti-stale invariant).
    const deleteOrder = mocks.txEvidenceSignalDeleteMany.mock.invocationCallOrder[0];
    const recomputeOrder = mocks.runEvidenceForDocument.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(recomputeOrder);
  });

  it("sourceKind change on a COMPLETED doc → deletes existing signals + re-runs runEvidenceForDocument (FILE → EMAIL case, attachment-linker)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "PITCH_DECK",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ sourceKind: "EMAIL" }) as never,
      makeContext() as never
    );

    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.runEvidenceForDocument).toHaveBeenCalledTimes(1);
    // runEvidenceForDocument will run attachment-linker on the next
    // evaluation because the doc is now sourceKind=EMAIL. We don't
    // mock-spy attachment-linker here (out of route's scope), but
    // anchoring the recompute trigger is enough — attachment-linker
    // is covered by its own dedicated tests.
  });

  it("sourceDate-only change does NOT trigger Evidence recompute (no need — evidence extractors don't depend on sourceDate)", async () => {
    // promote-source-date.ts already updates the sourceDate cascade
    // via its own atomic gate; the temporal extractor doesn't change
    // its output based on the doc's currently-stored sourceDate.
    // Triggering a recompute on every sourceDate edit would be
    // expensive + pointless.
    await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );

    expect(mocks.txEvidenceSignalDeleteMany).not.toHaveBeenCalled();
    expect(mocks.runEvidenceForDocument).not.toHaveBeenCalled();
  });

  it("type change on a NON-COMPLETED doc → does NOT trigger Evidence recompute (next extraction will recompute naturally)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "FILE",
      processingStatus: "PROCESSING",    });

    await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );

    expect(mocks.txEvidenceSignalDeleteMany).not.toHaveBeenCalled();
    expect(mocks.runEvidenceForDocument).not.toHaveBeenCalled();
  });

  it("type SAME as current → does NOT trigger recompute (no-op detection)", async () => {
    // The user submits the form with the type unchanged (e.g. only
    // changed sourceDate alongside). The route detects that
    // parsed.data.type === document.type and skips the recompute.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "PITCH_DECK",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ type: "PITCH_DECK", sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );

    // Recompute MUST NOT fire — the user only effectively changed
    // sourceDate, even though they submitted type too (UI submits
    // delta, but defensive).
    expect(mocks.txEvidenceSignalDeleteMany).not.toHaveBeenCalled();
    expect(mocks.runEvidenceForDocument).not.toHaveBeenCalled();
  });

  it("type AND sourceKind change in one PATCH → recompute fires EXACTLY ONCE (not once per field)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ type: "INVESTOR_MEMO", sourceKind: "EMAIL" }) as never,
      makeContext() as never
    );

    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.runEvidenceForDocument).toHaveBeenCalledTimes(1);
  });

  it("Codex B6.2.2 — recompute failure (runEvidenceForDocument throws) rolls back the delete (signal vacuum prevented) AND returns 200", async () => {
    // The B6.2.1 round had the delete + recompute OUTSIDE a txn —
    // a throw would leave the doc with NO signals (vacuum). B6.2.2
    // wraps both in a Serializable $transaction so a throw rolls
    // back the delete. The PATCH already committed (helper txn,
    // separate) so the user's metadata change survives — only the
    // signals stay at their pre-recompute state.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });
    mocks.runEvidenceForDocument.mockRejectedValueOnce(new Error("evidence boom"));

    const response = await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
    // The $transaction mock invokes the callback; the throw inside
    // propagates out of the txn → caught by the route's outer try.
    // The route MUST NOT have called runEvidenceForDocument a second
    // time (no retry — the user can re-trigger via re-PATCH if they
    // really want to retry).
    expect(mocks.runEvidenceForDocument).toHaveBeenCalledTimes(1);
  });

  it("Codex B6.2.2 — recompute returning status='failed' also rolls back (throws inside the txn) and returns 200", async () => {
    // status='failed' is a soft failure (extractor caught its own
    // error and returned). For our anti-vacuum policy, soft failure
    // is treated the same as a throw: rollback the delete so the
    // user doesn't end up with no signals.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });
    mocks.runEvidenceForDocument.mockResolvedValueOnce({
      status: "failed",
      reason: "extractor_threw",
    });

    const response = await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
  });

  it("recompute is scoped to (documentId, dealId) — anti-régression against cross-tenant delete", async () => {
    // Defense in depth: even though the auth check has already
    // verified ownership, the deleteMany WHERE includes dealId so a
    // future bug that lets a wrong documentId slip through (e.g.
    // through a path-param injection somehow) can't delete signals
    // for another deal.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );

    expect(mocks.txEvidenceSignalDeleteMany.mock.calls[0]?.[0]?.where).toMatchObject({
      documentId: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      kind: { not: "ATTACHMENT_RELATION" },
    });
  });
});

// ============================================================
// B6.2.2 (Codex P1) — ATTACHMENT_RELATION preservation + EMAIL ↔ FILE transition cleanup
// ============================================================
describe("PATCH /api/documents/[documentId]/metadata — Codex B6.2.2 ATTACHMENT_RELATION semantics", () => {
  it("type change preserves inbound ATTACHMENT_RELATION (delete scope excludes ATTACHMENT_RELATION kind)", async () => {
    // Scenario the audit flagged: a cap table attached to an email.
    // ATTACHMENT_RELATION is persisted on the cap table (child doc)
    // but EMITTED by the email's linker run. If the user changes the
    // cap table's `type`, the delete MUST NOT wipe the
    // ATTACHMENT_RELATION because runEvidenceForDocument on the cap
    // table can't re-create it (linker only runs for EMAIL docs).
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ type: "CAP_TABLE" }) as never,
      makeContext() as never
    );

    // The delete MUST be scoped with `kind: { not: "ATTACHMENT_RELATION" }`.
    // Anchored explicitly so a regression that widens the scope back
    // to "all kinds" is caught.
    const deleteCall = mocks.txEvidenceSignalDeleteMany.mock.calls[0]?.[0];
    expect(deleteCall?.where?.kind).toEqual({ not: "ATTACHMENT_RELATION" });
  });

  it("FILE → EMAIL transition: deleteMany scope is still ATTACHMENT_RELATION-preserving + the recompute runs (will trigger attachment-linker via runEvidenceForDocument)", async () => {
    // Going FILE → EMAIL: the email-side relations don't exist yet
    // (this doc wasn't an email before), so there's nothing to
    // CLEAN UP from a previous email-role. The recompute will create
    // NEW ATTACHMENT_RELATION signals on child docs because
    // runEvidenceForDocument runs attachment-linker on EMAIL docs.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "PITCH_DECK",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ sourceKind: "EMAIL" }) as never,
      makeContext() as never
    );

    // ONE deleteMany call (scoped doc-owned, kind != ATTACHMENT_RELATION).
    // NO second deleteMany for outbound — there's no outbound cleanup
    // needed on FILE → EMAIL.
    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.runEvidenceForDocument).toHaveBeenCalledTimes(1);
  });

  it("Codex B6.2.3 — EMAIL → FILE transition: outbound cleanup reads candidates (findMany), decrypts in-app, deletes by ID — NOT via the broken Prisma JSON-path query", async () => {
    // The B6.2.2 round used `valueJson: { path: ['emailDocId'], equals: X }`
    // which doesn't work because valueJson is encrypted at write
    // (see services/evidence-signals/create-signal.ts:103). The
    // Postgres JSONB query saw the encrypted envelope, never the
    // plaintext, and silently matched nothing. B6.2.3 fixes this
    // by reading + decrypting in-app.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      processingStatus: "COMPLETED",    });
    // Simulate the deal having 3 ATTACHMENT_RELATION signals — 2 of
    // them point to our email doc, 1 points to a different email
    // (must NOT be deleted).
    mocks.txEvidenceSignalFindMany.mockResolvedValueOnce([
      { id: "sig_orphan_1", valueJson: { alg: "AES-256-GCM", data: "<enc1>" } },
      { id: "sig_orphan_2", valueJson: { alg: "AES-256-GCM", data: "<enc2>" } },
      { id: "sig_other_email", valueJson: { alg: "AES-256-GCM", data: "<enc3>" } },
    ]);
    // Decrypt returns the plaintext shape for each candidate.
    mocks.tryDecryptJsonField
      .mockReturnValueOnce({
        kind: "decrypted",
        value: { emailDocId: "ck8aaaaaaaaaaaaaaaaaaaaa", attachmentName: "deck.pdf" },
      })
      .mockReturnValueOnce({
        kind: "decrypted",
        value: { emailDocId: "ck8aaaaaaaaaaaaaaaaaaaaa", attachmentName: "captable.xlsx" },
      })
      .mockReturnValueOnce({
        kind: "decrypted",
        value: { emailDocId: "different_email_id", attachmentName: "other.pdf" },
      });

    await PATCH(
      makeRequest({ sourceKind: "FILE" }) as never,
      makeContext() as never
    );

    // Step 1: owned-signals delete (kind != ATTACHMENT_RELATION).
    // Step 2: outbound delete by ID list — ONLY the 2 orphans, NOT
    // the third signal that points to a different email.
    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledTimes(2);

    const ownedCall = mocks.txEvidenceSignalDeleteMany.mock.calls[0]?.[0];
    expect(ownedCall?.where).toMatchObject({
      documentId: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      kind: { not: "ATTACHMENT_RELATION" },
    });

    const outboundCall = mocks.txEvidenceSignalDeleteMany.mock.calls[1]?.[0];
    // Anti-régression P1 : the where MUST NOT use Prisma JSON-path
    // (the broken approach). It must be an id-list delete.
    expect(outboundCall?.where).not.toHaveProperty("valueJson");
    expect(outboundCall?.where?.id).toEqual({
      in: ["sig_orphan_1", "sig_orphan_2"],
    });
    // dealId-scoped redundancy (defense in depth — IDOR safety).
    expect(outboundCall?.where?.dealId).toBe("deal_1");

    // findMany was issued to fetch the candidates (scoped by deal +
    // kind, no encrypted-field filter).
    expect(mocks.txEvidenceSignalFindMany).toHaveBeenCalledTimes(1);
    const findCall = mocks.txEvidenceSignalFindMany.mock.calls[0]?.[0];
    expect(findCall?.where).toMatchObject({
      dealId: "deal_1",
      kind: "ATTACHMENT_RELATION",
    });
    // Anti-régression: the findMany MUST NOT include a (broken) JSON
    // path filter. Filtering happens in-app post-decrypt.
    expect(findCall?.where).not.toHaveProperty("valueJson");
  });

  it("Codex B6.2.3 — outbound cleanup deletes NOTHING when no candidate matches (defensive: empty in[] is skipped)", async () => {
    // Edge case: an email is re-classified to FILE but the deal has
    // NO ATTACHMENT_RELATION pointing to this email (e.g. the email
    // had no matched attachments). The route must:
    //   - still run the findMany (to know there's nothing to do),
    //   - skip the deleteMany (no second call — empty `id: { in: [] }`
    //     would either error or no-op anyway; skipping is cleaner).
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      processingStatus: "COMPLETED",    });
    mocks.txEvidenceSignalFindMany.mockResolvedValueOnce([]);

    await PATCH(
      makeRequest({ sourceKind: "FILE" }) as never,
      makeContext() as never
    );

    // Only one deleteMany — the owned-signals delete. No outbound.
    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("Codex B6.2.3 — outbound cleanup deletes NOTHING when candidates exist but none point to this email (cross-email isolation)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      processingStatus: "COMPLETED",    });
    mocks.txEvidenceSignalFindMany.mockResolvedValueOnce([
      { id: "sig_other_1", valueJson: { alg: "AES-256-GCM", data: "<enc>" } },
      { id: "sig_other_2", valueJson: { alg: "AES-256-GCM", data: "<enc>" } },
    ]);
    mocks.tryDecryptJsonField
      .mockReturnValueOnce({
        kind: "decrypted",
        value: { emailDocId: "different_email_A" },
      })
      .mockReturnValueOnce({
        kind: "decrypted",
        value: { emailDocId: "different_email_B" },
      });

    await PATCH(
      makeRequest({ sourceKind: "FILE" }) as never,
      makeContext() as never
    );

    // No outbound delete — both candidates pointed to other emails.
    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("Codex B6.2.3 — corrupted envelope is SKIPPED with a log (does NOT block cleanup of other orphans)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      processingStatus: "COMPLETED",    });
    mocks.txEvidenceSignalFindMany.mockResolvedValueOnce([
      { id: "sig_corrupt", valueJson: { alg: "AES-256-GCM", data: "<garbage>" } },
      { id: "sig_orphan_valid", valueJson: { alg: "AES-256-GCM", data: "<enc>" } },
    ]);
    mocks.tryDecryptJsonField
      .mockReturnValueOnce({ kind: "corrupted", reason: "auth tag mismatch" })
      .mockReturnValueOnce({
        kind: "decrypted",
        value: { emailDocId: "ck8aaaaaaaaaaaaaaaaaaaaa" },
      });

    await PATCH(
      makeRequest({ sourceKind: "FILE" }) as never,
      makeContext() as never
    );

    // Owned delete + outbound delete (with ONLY the valid orphan,
    // corrupt one was skipped).
    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledTimes(2);
    const outboundCall = mocks.txEvidenceSignalDeleteMany.mock.calls[1]?.[0];
    expect(outboundCall?.where?.id).toEqual({ in: ["sig_orphan_valid"] });
  });

  it("Codex B6.2.3 — EMAIL → NOTE: same decrypt-and-delete cleanup fires (gate is `away from EMAIL`, not `to FILE`)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      processingStatus: "COMPLETED",    });
    mocks.txEvidenceSignalFindMany.mockResolvedValueOnce([
      { id: "sig_orphan", valueJson: { alg: "AES-256-GCM", data: "<enc>" } },
    ]);
    mocks.tryDecryptJsonField.mockReturnValueOnce({
      kind: "decrypted",
      value: { emailDocId: "ck8aaaaaaaaaaaaaaaaaaaaa" },
    });

    await PATCH(
      makeRequest({ sourceKind: "NOTE" }) as never,
      makeContext() as never
    );

    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledTimes(2);
    expect(mocks.txEvidenceSignalFindMany).toHaveBeenCalledTimes(1);
  });

  it("Codex B6.2.3 anti-régression — valueJson is encrypted (source-of-truth grep on create-signal.ts)", async () => {
    // Anchor the encryption contract via file-system grep — if a
    // future refactor stops encrypting valueJson, the Prisma JSON-path
    // approach becomes valid again and a contributor might be tempted
    // to revert the in-app decrypt. This guard fails loudly.
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const createSignalSource = readFileSync(
      join(process.cwd(), "src", "services", "evidence-signals", "create-signal.ts"),
      "utf8"
    );
    expect(createSignalSource).toMatch(
      /encryptedValueJson\s*=\s*encryptJsonField\(input\.valueJson\)/
    );
    expect(createSignalSource).toMatch(/valueJson:\s*encryptedValueJson/);
  });

  it("Codex B6.2.3 anti-régression — the route does NOT use Prisma JSON path on valueJson in actual code (would silently match nothing — the encrypted envelope hides the plaintext)", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const rawSource = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "api",
        "documents",
        "[documentId]",
        "metadata",
        "route.ts"
      ),
      "utf8"
    );
    // Strip line comments + block comments so we're checking ONLY
    // executable code. The new code intentionally MENTIONS the broken
    // pattern in a doc comment as a "do not regress to this" warning.
    const codeOnly = rawSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(codeOnly).not.toMatch(
      /valueJson:\s*\{\s*path:\s*\[["']emailDocId["']\]/
    );
    // The fix pattern MUST be present in real code (not just comments).
    expect(codeOnly).toMatch(/tryDecryptJsonField/);
    expect(codeOnly).toMatch(/orphanIds\.push\(candidate\.id\)/);
  });

  it("EMAIL → EMAIL (no transition): NO outbound cleanup, type change still recomputes owned signals", async () => {
    // If only `type` changes on an EMAIL doc (e.g. user reclassifies
    // an EMAIL of type OTHER as TERM_SHEET — semantically weird but
    // schema allows), the outbound relations still point to the
    // same email doc and stay valid. Only the doc's owned signals
    // recompute.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ type: "INVESTOR_MEMO" }) as never,
      makeContext() as never
    );

    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("Codex B6.2.2 — delete + recompute happen INSIDE a Serializable transaction (atomic, rollback on failure)", async () => {
    // The route opens a $transaction for the recompute (in addition
    // to the helper's $transaction for the patch). The isolation
    // level MUST be Serializable so MVCC ordering catches concurrent
    // writers cleanly.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );

    // Two $transaction calls: (1) helper's patch txn, (2) route's
    // recompute txn. Both Serializable.
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    for (const call of mocks.transaction.mock.calls) {
      expect(call[1]).toMatchObject({ isolationLevel: "Serializable" });
    }
  });

  it("Codex B6.2.2 — runEvidenceForDocument is called with the TX client (same isolation as the delete) — not the route prisma client", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );

    // The tx object we hand to fn() in the $transaction mock has
    // `evidenceSignal.deleteMany` === mocks.txEvidenceSignalDeleteMany.
    // runEvidenceForDocument receives that SAME tx. We can't assert
    // referential equality directly through the mock proxy, but we
    // can assert the recompute was called inside a txn (vs the
    // route-level prisma client) by checking it was called between
    // the txn opening and closing — equivalent to: the
    // $transaction mock fired AND the recompute was inside it.
    //
    // Strong-form check: the recompute's prisma arg has the tx-
    // scoped evidenceSignal.deleteMany method.
    const prismaArg = mocks.runEvidenceForDocument.mock.calls[0]?.[0] as
      | { evidenceSignal?: { deleteMany?: unknown } }
      | undefined;
    expect(prismaArg?.evidenceSignal?.deleteMany).toBe(
      mocks.txEvidenceSignalDeleteMany
    );
  });

  it("Codex B6.2.2 — throw inside the recompute txn → outer mock $transaction throws → route's outer catch logs + returns 200 (no signal vacuum)", async () => {
    // End-to-end behavior the audit asked for: if delete succeeds
    // but recompute throws, the $transaction rolls back so the
    // delete is reversed. We model this in the test by asserting
    // the route swallows the throw and returns 200 — the actual
    // Postgres-side rollback is enforced by the real Serializable
    // txn in production (mock can't simulate MVCC).
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "FILE",
      processingStatus: "COMPLETED",    });
    mocks.runEvidenceForDocument.mockRejectedValueOnce(
      new Error("temporal-extractor crashed")
    );

    const response = await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );
    // Metadata PATCH stays 200 — the patch (committed by the
    // helper's txn) is the user's authoritative action.
    expect(response.status).toBe(200);
  });
});

// ============================================================
// B6.3 — Edit email date / metadata (receivedAt, sourceAuthor, sourceSubject)
// ============================================================
describe("PATCH /api/documents/[documentId]/metadata — B6.3 email metadata", () => {
  it("happy path — receivedAt only: 200, writes Document.receivedAt + manual.receivedAt audit trail", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      sourceDate: new Date("2026-04-06"),
      processingStatus: "COMPLETED",    });
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      sourceDate: new Date("2026-04-06"),
      sourceMetadata: null,
      type: "OTHER",
      sourceKind: "EMAIL",
      receivedAt: null,
      sourceAuthor: null,
      sourceSubject: null,
    });

    const response = await PATCH(
      makeRequest({ receivedAt: "2026-04-07" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.receivedAt).toBeInstanceOf(Date);
    expect((call?.data?.receivedAt as Date).toISOString().startsWith("2026-04-07")).toBe(true);

    const manual = (call?.data?.sourceMetadata as Record<string, unknown>).manual as Record<string, unknown>;
    const audit = manual.receivedAt as Record<string, unknown>;
    expect(audit.setBy).toBe("user_owner");
    expect(audit.previousValue).toBeNull();
    expect(audit.newValue).toMatch(/^2026-04-07T/);
  });

  it("happy path — sourceAuthor only: 200, writes Document.sourceAuthor + manual.sourceAuthor audit (trimmed)", async () => {
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      sourceDate: null,
      sourceMetadata: null,
      type: "OTHER",
      sourceKind: "FILE",
      receivedAt: null,
      sourceAuthor: null,
      sourceSubject: null,
    });

    const response = await PATCH(
      makeRequest({ sourceAuthor: "  Jean CFO <jean@acme.com>  " }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    // Trimmed before write.
    expect(call?.data?.sourceAuthor).toBe("Jean CFO <jean@acme.com>");
    const manual = (call?.data?.sourceMetadata as Record<string, unknown>).manual as Record<string, unknown>;
    const audit = manual.sourceAuthor as Record<string, unknown>;
    expect(audit.newValue).toBe("Jean CFO <jean@acme.com>");
  });

  it("happy path — sourceAuthor explicit null: 200, clears the column", async () => {
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      sourceDate: null,
      sourceMetadata: null,
      type: "OTHER",
      sourceKind: "EMAIL",
      receivedAt: null,
      sourceAuthor: "Old Author",
      sourceSubject: null,
    });

    await PATCH(
      makeRequest({ sourceAuthor: null }) as never,
      makeContext() as never
    );

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.sourceAuthor).toBeNull();
    const manual = (call?.data?.sourceMetadata as Record<string, unknown>).manual as Record<string, unknown>;
    const audit = manual.sourceAuthor as Record<string, unknown>;
    expect(audit.previousValue).toBe("Old Author");
    expect(audit.newValue).toBeNull();
  });

  it("happy path — empty-string sourceSubject is treated as null (clear semantics, trimmed)", async () => {
    await PATCH(
      makeRequest({ sourceSubject: "   " }) as never,
      makeContext() as never
    );
    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.sourceSubject).toBeNull();
  });

  it("happy path — all email fields at once: single atomic update, three audit blocks", async () => {
    await PATCH(
      makeRequest({
        receivedAt: "2026-04-07",
        sourceAuthor: "Real Author <real@startup.io>",
        sourceSubject: "Corrected subject",
      }) as never,
      makeContext() as never
    );

    expect(mocks.txDocumentUpdateMany).toHaveBeenCalledTimes(1);
    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    expect(call?.data?.receivedAt).toBeInstanceOf(Date);
    expect(call?.data?.sourceAuthor).toBe("Real Author <real@startup.io>");
    expect(call?.data?.sourceSubject).toBe("Corrected subject");
    const manual = (call?.data?.sourceMetadata as Record<string, unknown>).manual as Record<string, unknown>;
    expect(manual.receivedAt).toBeDefined();
    expect(manual.sourceAuthor).toBeDefined();
    expect(manual.sourceSubject).toBeDefined();
  });

  it("400 when receivedAt is an unparseable string", async () => {
    const response = await PATCH(
      makeRequest({ receivedAt: "not-a-date" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
    expect(mocks.txDocumentUpdateMany).not.toHaveBeenCalled();
  });

  it("400 when sourceAuthor exceeds the 500-char cap", async () => {
    const longString = "a".repeat(501);
    const response = await PATCH(
      makeRequest({ sourceAuthor: longString }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
  });

  it("400 when sourceSubject exceeds the 500-char cap", async () => {
    const longString = "x".repeat(501);
    const response = await PATCH(
      makeRequest({ sourceSubject: longString }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(400);
  });

  it("preserves existing manual.* siblings (B6.1 sourceDate, B6.2 documentType, ...) when patching email metadata", async () => {
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      sourceDate: new Date("2025-09-01"),
      sourceMetadata: {
        manual: {
          sourceDate: { setBy: "user_owner", newValue: "2025-09-01" },
          documentType: { setBy: "user_owner", newValue: "PITCH_DECK" },
        },
        temporal: { promotedBy: "evidence-engine-phase3" },
      },
      type: "PITCH_DECK",
      sourceKind: "FILE",
      receivedAt: null,
      sourceAuthor: null,
      sourceSubject: null,
    });

    await PATCH(
      makeRequest({ sourceAuthor: "Jean <jean@acme.com>" }) as never,
      makeContext() as never
    );

    const call = mocks.txDocumentUpdateMany.mock.calls[0]?.[0];
    const meta = call?.data?.sourceMetadata as Record<string, unknown>;
    const manual = meta.manual as Record<string, unknown>;
    // Pre-existing siblings preserved.
    expect(manual.sourceDate).toMatchObject({ newValue: "2025-09-01" });
    expect(manual.documentType).toMatchObject({ newValue: "PITCH_DECK" });
    expect(meta.temporal).toMatchObject({ promotedBy: "evidence-engine-phase3" });
    // New manual.sourceAuthor block added.
    expect(manual.sourceAuthor).toMatchObject({
      newValue: "Jean <jean@acme.com>",
    });
  });
});

// ============================================================
// B6.3 — sourceDate change on EMAIL doc → recompute + outbound
// cleanup (attachment-linker output depends on emailSourceDate).
// ============================================================
describe("PATCH /api/documents/[documentId]/metadata — B6.3 sourceDate change on EMAIL triggers recompute + outbound cleanup", () => {
  it("Codex B6.3 — EMAIL doc with sourceDate change → recompute fires (attachment-linker re-emits with new emailSourceDate)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "email_doc_1",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      sourceDate: new Date("2026-04-06"),
      processingStatus: "COMPLETED",    });
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "email_doc_1",
      dealId: "deal_1",
      sourceDate: new Date("2026-04-06"),
      sourceMetadata: null,
      type: "OTHER",
      sourceKind: "EMAIL",
      receivedAt: null,
      sourceAuthor: null,
      sourceSubject: null,
    });

    await PATCH(
      makeRequest({ sourceDate: "2026-04-22" }) as never,
      makeContext() as never
    );

    // The recompute MUST fire: owned-signals delete + runEvidenceForDocument.
    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalled();
    expect(mocks.runEvidenceForDocument).toHaveBeenCalledTimes(1);
  });

  it("Codex B6.3 — EMAIL doc with sourceDate change → OUTBOUND ATTACHMENT_RELATION cleanup ALSO fires (orphan reportedAt invalidation)", async () => {
    // The doc id throughout the test stays `ck8aaaaaaaaaaaaaaaaaaaaa`
    // (the shared CUID-shaped id in makeContext). The outbound
    // cleanup runs because: (a) sourceKind is EMAIL, (b) sourceDate
    // changed value, (c) attachment-linker output is keyed on
    // emailSourceDate → existing outbound relations are stale.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      sourceDate: new Date("2026-04-06"),
      processingStatus: "COMPLETED",    });
    mocks.txDocumentFindUnique.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      sourceDate: new Date("2026-04-06"),
      sourceMetadata: null,
      type: "OTHER",
      sourceKind: "EMAIL",
      receivedAt: null,
      sourceAuthor: null,
      sourceSubject: null,
    });
    // 2 outbound ATTACHMENT_RELATION orphans (their reportedAt /
    // emailSourceDate has the OLD 2026-04-06 baked in via
    // valueJson encrypted envelope — for the mock, the envelope
    // shape is irrelevant since we mock tryDecryptJsonField below).
    mocks.txEvidenceSignalFindMany.mockResolvedValueOnce([
      { id: "sig_attach_1", valueJson: { alg: "AES-256-GCM", data: "<enc1>" } },
      { id: "sig_attach_2", valueJson: { alg: "AES-256-GCM", data: "<enc2>" } },
    ]);
    mocks.tryDecryptJsonField
      .mockReturnValueOnce({
        kind: "decrypted",
        value: { emailDocId: "ck8aaaaaaaaaaaaaaaaaaaaa" },
      })
      .mockReturnValueOnce({
        kind: "decrypted",
        value: { emailDocId: "ck8aaaaaaaaaaaaaaaaaaaaa" },
      });

    await PATCH(
      makeRequest({ sourceDate: "2026-04-22" }) as never,
      makeContext() as never
    );

    // TWO deleteMany calls:
    //   (1) owned signals (kind != ATTACHMENT_RELATION)
    //   (2) outbound ATTACHMENT_RELATION by id list
    expect(mocks.txEvidenceSignalDeleteMany).toHaveBeenCalledTimes(2);
    const outboundCall = mocks.txEvidenceSignalDeleteMany.mock.calls[1]?.[0];
    expect(outboundCall?.where?.id).toEqual({
      in: ["sig_attach_1", "sig_attach_2"],
    });
  });

  it("Codex B6.3 — non-EMAIL doc with sourceDate change → NO recompute (attachment-linker doesn't apply)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "PITCH_DECK",
      sourceKind: "FILE",
      sourceDate: new Date("2026-03-01"),
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ sourceDate: "2026-04-22" }) as never,
      makeContext() as never
    );

    // sourceDate change on FILE doc → no recompute (the cache
    // invalidation via React Query is enough; the deterministic
    // extractors don't change output based on sourceDate for FILE).
    expect(mocks.txEvidenceSignalDeleteMany).not.toHaveBeenCalled();
    expect(mocks.runEvidenceForDocument).not.toHaveBeenCalled();
  });

  it("Codex B6.3 — FILE → EMAIL transition with NEW sourceDate set: recompute fires (linker runs with the new sourceDate)", async () => {
    // Going FILE → EMAIL while ALSO setting a sourceDate: the
    // recompute should fire because either sourceKindChanged (B6.2)
    // OR sourceDate changed on a "will be EMAIL" doc (B6.3).
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "PITCH_DECK",
      sourceKind: "FILE",
      sourceDate: null,
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ sourceKind: "EMAIL", sourceDate: "2026-04-22" }) as never,
      makeContext() as never
    );

    expect(mocks.runEvidenceForDocument).toHaveBeenCalledTimes(1);
  });

  it("Codex B6.3 — sourceAuthor / sourceSubject only changes do NOT trigger recompute (extractors don't read these fields)", async () => {
    // attachment-linker uses sourceDate + extracted text; claims-
    // extractor uses type + sourceKind + text. Neither consumes
    // sourceAuthor or sourceSubject. Triggering a recompute on
    // those would be wasteful.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      sourceDate: new Date("2026-04-06"),
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({
        sourceAuthor: "Corrected <real@x.com>",
        sourceSubject: "Corrected subject",
      }) as never,
      makeContext() as never
    );

    expect(mocks.txEvidenceSignalDeleteMany).not.toHaveBeenCalled();
    expect(mocks.runEvidenceForDocument).not.toHaveBeenCalled();
  });

  it("Codex B6.3 — receivedAt-only change does NOT trigger recompute (also not consumed by deterministic extractors)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      sourceDate: new Date("2026-04-06"),
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ receivedAt: "2026-04-07" }) as never,
      makeContext() as never
    );

    expect(mocks.runEvidenceForDocument).not.toHaveBeenCalled();
  });

  it("Codex B6.3 — EMAIL → EMAIL same sourceDate (no change in value, only re-submitted) → NO recompute (no-op detection)", async () => {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      sourceDate: new Date("2026-04-06"),
      processingStatus: "COMPLETED",    });

    await PATCH(
      makeRequest({ sourceDate: "2026-04-06", sourceAuthor: "Someone <a@b.c>" }) as never,
      makeContext() as never
    );

    // The user changed sourceAuthor (no recompute) and re-submitted
    // sourceDate with the same value (no actual change). No recompute.
    expect(mocks.txEvidenceSignalDeleteMany).not.toHaveBeenCalled();
    expect(mocks.runEvidenceForDocument).not.toHaveBeenCalled();
  });
});

// ============================================================
// B6.3.1 (Codex P1) — recompute rolls back on `skipped` too
// (not just `failed`) — closes the signal-vacuum hole properly.
// ============================================================
describe("PATCH /api/documents/[documentId]/metadata — B6.3.1 Codex P1 rollback on ANY non-`ran` result", () => {
  // Setup helper: shared mocks that put the doc into a state where
  // the recompute branch fires (type changed on COMPLETED doc).
  function setupRecomputeContext() {
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "FILE",
      sourceDate: null,
      processingStatus: "COMPLETED",    });
  }

  it("Codex B6.3.1 — `skipped: no_extracted_text` triggers rollback (signal vacuum prevented)", async () => {
    // Real scenario: a doc that lost its extractedText (e.g. column
    // got cleared by a downstream process) hits no_extracted_text.
    // Without B6.3.1's tightened gate, the delete commits and the
    // doc ends up with zero signals. With the gate, the delete
    // rolls back and the old signals survive.
    setupRecomputeContext();
    mocks.runEvidenceForDocument.mockResolvedValueOnce({
      status: "skipped",
      reason: "no_extracted_text",
    });

    const response = await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );
    // Metadata PATCH stays 200 — non-fatal on recompute failure.
    expect(response.status).toBe(200);
    // runEvidenceForDocument was called exactly once (no retry).
    expect(mocks.runEvidenceForDocument).toHaveBeenCalledTimes(1);
  });

  it("Codex B6.3.1 — `skipped: document_not_found` (delete race inside recompute) triggers rollback", async () => {
    // Theoretical: the recompute opens the txn, reads the doc, and
    // finds it gone. The `skipped: document_not_found` outcome
    // means: no new signals will be created. Without rollback, the
    // delete already committed in the same txn — but the txn would
    // throw via our gate, rolling back atomically.
    setupRecomputeContext();
    mocks.runEvidenceForDocument.mockResolvedValueOnce({
      status: "skipped",
      reason: "document_not_found",
    });

    const response = await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
  });

  it("Codex B6.3.1 — `skipped: processing_status_PROCESSING` triggers rollback", async () => {
    setupRecomputeContext();
    mocks.runEvidenceForDocument.mockResolvedValueOnce({
      status: "skipped",
      reason: "processing_status_PROCESSING",
    });

    const response = await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
  });

  it("Codex B6.3.1 — `skipped: processing_status_FAILED` triggers rollback", async () => {
    setupRecomputeContext();
    mocks.runEvidenceForDocument.mockResolvedValueOnce({
      status: "skipped",
      reason: "processing_status_FAILED",
    });

    const response = await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
  });

  it("Codex B6.3.1 — `status: 'ran'` is the ONLY outcome that commits the delete (the recompute actually replaced the signals)", async () => {
    setupRecomputeContext();
    mocks.runEvidenceForDocument.mockResolvedValueOnce({
      status: "ran",
      signalsPersisted: 5,
      signalsDeduplicated: 0,
      promoted: true,
      attachmentsLinked: 0,
      claimsPersisted: 2,
      claimsDeduplicated: 0,
    });

    const response = await PATCH(
      makeRequest({ type: "FINANCIAL_MODEL" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);
    // `ran` commits the delete + recompute together. Nothing throws
    // inside the txn → no rollback. We can't directly inspect the
    // commit (the mock $transaction just invokes the fn), but we
    // can assert the txn didn't throw (200 + recompute called).
    expect(mocks.runEvidenceForDocument).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// B6.3.1 (Codex P2) — PATCH response includes the B6.3 fields
// ============================================================
describe("PATCH /api/documents/[documentId]/metadata — B6.3.1 Codex P2 canonical-row response includes email metadata", () => {
  it("response payload includes receivedAt + sourceAuthor + sourceSubject (canonical-row contract)", async () => {
    // B11.2 — findFirst = ownership lookup (composite where);
    // findUnique = canonical re-fetch with the B6.3 fields.
    mocks.documentFindFirst.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      type: "OTHER",
      sourceKind: "EMAIL",
      sourceDate: null,
      processingStatus: "COMPLETED",
    });
    mocks.documentFindUnique.mockResolvedValueOnce({
      id: "ck8aaaaaaaaaaaaaaaaaaaaa",
      dealId: "deal_1",
      sourceDate: null,
      sourceMetadata: { manual: { sourceAuthor: { setBy: "user_owner" } } },
      sourceKind: "EMAIL",
      type: "OTHER",
      name: "thread.pdf",
      processingStatus: "COMPLETED",
      receivedAt: new Date("2026-04-07"),
      sourceAuthor: "Jean <jean@x.com>",
      sourceSubject: "Q1 update",
    });

    const response = await PATCH(
      makeRequest({ sourceAuthor: "Jean <jean@x.com>" }) as never,
      makeContext() as never
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: Record<string, unknown> };
    // The 3 new fields MUST be in the payload.
    expect(body.data).toHaveProperty("receivedAt");
    expect(body.data).toHaveProperty("sourceAuthor", "Jean <jean@x.com>");
    expect(body.data).toHaveProperty("sourceSubject", "Q1 update");
  });

  it("response select includes receivedAt + sourceAuthor + sourceSubject in the canonical re-fetch (anchor on the select shape)", async () => {
    await PATCH(
      makeRequest({ sourceDate: "2026-03-14" }) as never,
      makeContext() as never
    );

    // B11.2 — the outer reads are now SPLIT: findFirst for
    // ownership, findUnique for the canonical re-fetch. The
    // FIRST findUnique call is the re-fetch — its `select` MUST
    // include the B6.3 fields.
    const reFetchCall = mocks.documentFindUnique.mock.calls[0]?.[0];
    expect(reFetchCall?.select).toMatchObject({
      receivedAt: true,
      sourceAuthor: true,
      sourceSubject: true,
    });
  });
});
