/**
 * Database integration tests for EvidenceSignal — covers §6.1 (intégrité DB)
 * and §6.3 (lifecycle) from docs-private/evidence-engine-phase1-schema.md.
 *
 * Hits the actual Postgres (Neon) via DATABASE_URL/DIRECT_URL. Tests create
 * disposable Deal + Document + ExtractionRun rows under a "<dealNamePrefix>"
 * prefix and clean up via cascade in afterAll.
 *
 * SKIP via env: SKIP_DB_TESTS=1 vitest
 * The userId is hardcoded to a stable test user that is created if missing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

import { shouldSkipDbTests } from "@/lib/test-db-guard";

config({ path: ".env.local" });

// Neon round-trips can be slow on cold endpoints (>5s default vitest timeout).
const DB_TEST_TIMEOUT = 30_000;

const TEST_KEY = "a".repeat(64);
process.env.DOCUMENT_ENCRYPTION_KEY ??= TEST_KEY;

const skipDbTests = shouldSkipDbTests().skip;

if (skipDbTests) {
  describe.skip("EvidenceSignal — DB integration (skipped: SKIP_DB_TESTS=1 or no DB)", () => {
    it("skipped", () => {
      expect(true).toBe(true);
    });
  });
} else {
  const { PrismaClient, Prisma } = await import("@prisma/client");
  const { createEvidenceSignal, validateSignalScopeKey } = await import("../create-signal");
  const { computeSignalHash } = await import("../signal-hash");

  const prisma = new PrismaClient();
  const DEAL_PREFIX = `__evidence_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const TEST_USER_CLERK_ID = `${DEAL_PREFIX}__user`;
  let testUserId = "";
  let dealAId = "";
  let dealBId = "";
  let docAId = "";
  let docBId = "";
  let runOfDocAId = "";
  let runOfDocBId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        clerkId: TEST_USER_CLERK_ID,
        email: `${DEAL_PREFIX}@evidence-test.invalid`,
        name: "Evidence Engine Test User",
      },
    });
    testUserId = user.id;

    const [dealA, dealB] = await prisma.$transaction([
      prisma.deal.create({ data: { name: `${DEAL_PREFIX}_dealA`, userId: testUserId } }),
      prisma.deal.create({ data: { name: `${DEAL_PREFIX}_dealB`, userId: testUserId } }),
    ]);
    dealAId = dealA.id;
    dealBId = dealB.id;

    const [docA, docB] = await prisma.$transaction([
      prisma.document.create({
        data: { dealId: dealAId, name: "test-doc-A.pdf", type: "OTHER", version: 1 },
      }),
      prisma.document.create({
        data: { dealId: dealBId, name: "test-doc-B.pdf", type: "OTHER", version: 1 },
      }),
    ]);
    docAId = docA.id;
    docBId = docB.id;

    const [runA, runB] = await prisma.$transaction([
      prisma.documentExtractionRun.create({
        data: {
          documentId: docAId,
          documentVersion: 1,
          extractionVersion: "test-v1",
          pipelineVersion: "test-pipeline-v1",
        },
      }),
      prisma.documentExtractionRun.create({
        data: {
          documentId: docBId,
          documentVersion: 1,
          extractionVersion: "test-v1",
          pipelineVersion: "test-pipeline-v1",
        },
      }),
    ]);
    runOfDocAId = runA.id;
    runOfDocBId = runB.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  function baseInput(overrides: Partial<Parameters<typeof createEvidenceSignal>[1]> = {}) {
    return {
      dealId: dealAId,
      documentId: docAId,
      documentVersion: 1,
      signalScopeKey: `run:${runOfDocAId}`,
      extractionRunId: runOfDocAId,
      extractorVersion: "test-extractor@v1",
      kind: "CAP_TABLE_AS_OF" as const,
      valueJson: { asOf: "2024-09-18", testTag: DEAL_PREFIX },
      confidence: "HIGH" as const,
      sourceMethod: "DETERMINISTIC" as const,
      asOfDate: new Date("2024-09-18T00:00:00Z"),
      precision: "DAY" as const,
      ...overrides,
    };
  }

  describe("§6.1 Intégrité — contraintes DB + idempotence", { timeout: DB_TEST_TIMEOUT }, () => {
    it("test 1 — idempotence scope 'run:<id>' (Codex round 4 P1: same payload → returns existing row, no throw)", async () => {
      const input = baseInput({
        valueJson: { test: 1, ts: Date.now() }, // unique to avoid colliding with other tests
      });
      const first = await createEvidenceSignal(prisma, input);
      expect(first.deduplicated).toBe(false);
      const second = await createEvidenceSignal(prisma, input);
      expect(second.deduplicated).toBe(true);
      expect(second.signal.id).toBe(first.signal.id);
    });

    it("test 2 — idempotence scope 'filename' (P1 Codex round 2 NULL≠NULL bypass + round 4 idempotence)", async () => {
      const input = baseInput({
        signalScopeKey: "filename",
        extractionRunId: null,
        valueJson: { test: 2, ts: Date.now() },
      });
      const first = await createEvidenceSignal(prisma, input);
      const second = await createEvidenceSignal(prisma, input);
      expect(second.deduplicated).toBe(true);
      expect(second.signal.id).toBe(first.signal.id);
    });

    it("test 3a — idempotence scope 'human:<id>' (NULL-safe + idempotent)", async () => {
      const humanId = `c${"x".repeat(24)}`;
      const input = baseInput({
        signalScopeKey: `human:${humanId}`,
        extractionRunId: null,
        sourceMethod: "HUMAN_OVERRIDE",
        valueJson: { test: "3a", ts: Date.now() },
      });
      const first = await createEvidenceSignal(prisma, input);
      const second = await createEvidenceSignal(prisma, input);
      expect(second.deduplicated).toBe(true);
      expect(second.signal.id).toBe(first.signal.id);
    });

    it("test 3b — idempotence scope 'import:<batch>'", async () => {
      const input = baseInput({
        signalScopeKey: "import:batch-test-3b",
        extractionRunId: null,
        sourceMethod: "IMPORT",
        valueJson: { test: "3b", ts: Date.now() },
      });
      const first = await createEvidenceSignal(prisma, input);
      const second = await createEvidenceSignal(prisma, input);
      expect(second.deduplicated).toBe(true);
      expect(second.signal.id).toBe(first.signal.id);
    });

    it("test 4 — Cross-tenant FK refuse (documentId=docA, dealId=dealB)", async () => {
      const input = baseInput({
        documentId: docAId,
        dealId: dealBId, // mismatch !
        signalScopeKey: "filename",
        extractionRunId: null,
        valueJson: { attack: "cross-tenant" },
      });
      await expect(createEvidenceSignal(prisma, input)).rejects.toMatchObject({
        code: "P2003", // Prisma FK violation
      });
    });

    it("test 5 — Cross-document run FK refuse (documentId=docA, extractionRunId=runOfDocB)", async () => {
      const scopeKey = `run:${runOfDocBId}`;
      // We bypass validateSignalScopeKey because the service guard would reject earlier.
      // Direct insert via Prisma to test the DB-level FK only.
      await expect(
        prisma.evidenceSignal.create({
          data: {
            dealId: dealAId,
            documentId: docAId,
            documentVersion: 1,
            signalScopeKey: scopeKey,
            extractionRunId: runOfDocBId, // run of doc B, not doc A !
            extractorVersion: "test@v1",
            kind: "CAP_TABLE_AS_OF",
            valueJson: { attack: "cross-doc-run" } as object,
            confidence: "HIGH",
            sourceMethod: "DETERMINISTIC",
            signalHash: "deadbeef".repeat(8),
          },
        })
      ).rejects.toMatchObject({ code: "P2003" });
    });

    it("test 6 — extractionRunId=NULL accepté (MATCH SIMPLE NULL-safe)", async () => {
      const result = await createEvidenceSignal(prisma, baseInput({
        signalScopeKey: "filename",
        extractionRunId: null,
        valueJson: { test: 6, ts: Date.now() },
      }));
      expect(result.signal.id).toBeTruthy();
      expect(result.signal.extractionRunId).toBeNull();
      expect(result.deduplicated).toBe(false);
    });

    it("test 9 — Cascade ExtractionRun: supprimer le run supprime ses signaux, mais pas les autres", async () => {
      const tmpRun = await prisma.documentExtractionRun.create({
        data: {
          documentId: docAId,
          documentVersion: 1,
          extractionVersion: "test-cascade",
          pipelineVersion: "test-cascade",
        },
      });
      const result = await createEvidenceSignal(prisma, baseInput({
        signalScopeKey: `run:${tmpRun.id}`,
        extractionRunId: tmpRun.id,
        valueJson: { test: 9, ts: Date.now() },
      }));
      await prisma.documentExtractionRun.delete({ where: { id: tmpRun.id } });
      const found = await prisma.evidenceSignal.findUnique({ where: { id: result.signal.id } });
      expect(found).toBeNull();
    });

    it("test 10 — signal sans extractionRunId survit aux re-runs", async () => {
      const humanId = `c${"y".repeat(24)}`;
      const result = await createEvidenceSignal(prisma, baseInput({
        signalScopeKey: `human:${humanId}`,
        extractionRunId: null,
        sourceMethod: "HUMAN_OVERRIDE",
        valueJson: { test: 10, ts: Date.now() },
      }));
      const tmpRun = await prisma.documentExtractionRun.create({
        data: {
          documentId: docAId,
          documentVersion: 1,
          extractionVersion: "test-rerun",
          pipelineVersion: "test-rerun",
        },
      });
      await prisma.documentExtractionRun.delete({ where: { id: tmpRun.id } });
      const found = await prisma.evidenceSignal.findUnique({ where: { id: result.signal.id } });
      expect(found?.id).toBe(result.signal.id);
    });

    it("test 1b — idempotence : 3 appels concurrents avec même payload → 1 row, 2 dédup", async () => {
      const input = baseInput({
        valueJson: { test: "1b-concurrent", ts: Date.now(), nonce: Math.random() },
      });
      const [r1, r2, r3] = await Promise.all([
        createEvidenceSignal(prisma, input),
        createEvidenceSignal(prisma, input),
        createEvidenceSignal(prisma, input),
      ]);
      const ids = new Set([r1.signal.id, r2.signal.id, r3.signal.id]);
      expect(ids.size).toBe(1);
      const dedupCount = [r1, r2, r3].filter((r) => r.deduplicated).length;
      // Au moins 2 des 3 ont été dédupliqués (le 1er gagne, les 2 autres tombent dans le P2002→findUnique).
      expect(dedupCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("§6.2 Confidentialité — aucune fuite en clair", { timeout: DB_TEST_TIMEOUT }, () => {
    it("test 13 — dump SQL brut ne contient pas la string sensible", async () => {
      const evidenceText = `SECRET_NEEDLE_${Date.now()}_${Math.random()}`;
      const result = await createEvidenceSignal(prisma, baseInput({
        signalScopeKey: "filename",
        extractionRunId: null,
        evidenceText,
        valueJson: { secretMarker: evidenceText },
      }));
      const raw = await prisma.evidenceSignal.findUnique({ where: { id: result.signal.id } });
      const rawString = JSON.stringify(raw);
      expect(rawString).not.toContain(evidenceText);
      // evidenceText column = base64 envelope
      expect(typeof raw?.evidenceText).toBe("string");
      expect(raw?.evidenceText).toMatch(/^[A-Za-z0-9+/=]+$/);
      // valueJson column = envelope object
      const valueJsonRaw = raw?.valueJson as { _enc?: unknown } | null;
      expect(valueJsonRaw && typeof valueJsonRaw === "object" && "_enc" in valueJsonRaw).toBe(true);
    });

    it("test 15 — metadata Zod validator rejette payload sensible avant insert (parserDebug strict whitelist)", async () => {
      await expect(
        createEvidenceSignal(prisma, baseInput({
          signalScopeKey: "filename",
          extractionRunId: null,
          valueJson: { test: 15 },
          metadata: { parserDebug: { rawOcr: "leak attempt" } } as never,
        }))
      ).rejects.toThrow(/Unrecognized key|rawOcr|sensitive content rejected/i);
    });
  });

  describe("§6.3 Lifecycle — re-extraction", { timeout: DB_TEST_TIMEOUT }, () => {
    it("test 17 — re-extraction même extractorVersion, nouveau run → 2 rows distinctes", async () => {
      const runX = await prisma.documentExtractionRun.create({
        data: { documentId: docAId, documentVersion: 1, extractionVersion: "test-17a", pipelineVersion: "test" },
      });
      const runY = await prisma.documentExtractionRun.create({
        data: { documentId: docAId, documentVersion: 1, extractionVersion: "test-17b", pipelineVersion: "test" },
      });
      const valueJson = { test: 17, ts: Date.now() };
      const sigX = await createEvidenceSignal(prisma, baseInput({
        signalScopeKey: `run:${runX.id}`,
        extractionRunId: runX.id,
        valueJson,
      }));
      const sigY = await createEvidenceSignal(prisma, baseInput({
        signalScopeKey: `run:${runY.id}`,
        extractionRunId: runY.id,
        valueJson,
      }));
      expect(sigX.signal.id).not.toBe(sigY.signal.id);
      expect(sigX.signal.signalHash).toBe(sigY.signal.signalHash); // same content → same hash
      expect(sigX.deduplicated).toBe(false);
      expect(sigY.deduplicated).toBe(false);
    });

    it("test 18 — re-extraction extractorVersion upgrade, même run → 2 rows distinctes (hash change)", async () => {
      const runZ = await prisma.documentExtractionRun.create({
        data: { documentId: docAId, documentVersion: 1, extractionVersion: "test-18", pipelineVersion: "test" },
      });
      const valueJson = { test: 18, ts: Date.now() };
      const sigOld = await createEvidenceSignal(prisma, baseInput({
        signalScopeKey: `run:${runZ.id}`,
        extractionRunId: runZ.id,
        extractorVersion: "parser@v1",
        valueJson,
      }));
      const sigNew = await createEvidenceSignal(prisma, baseInput({
        signalScopeKey: `run:${runZ.id}`,
        extractionRunId: runZ.id,
        extractorVersion: "parser@v2",
        valueJson,
      }));
      expect(sigOld.signal.id).not.toBe(sigNew.signal.id);
      expect(sigOld.signal.signalHash).not.toBe(sigNew.signal.signalHash);
      expect(sigOld.deduplicated).toBe(false);
      expect(sigNew.deduplicated).toBe(false);
    });
  });
}
