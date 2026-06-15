/**
 * Phase 6.3 — Integration tests for claims extractor against Neon.
 *
 * Covers the 3 Codex Phase 6 gates end-to-end:
 *   1. CA 2025 ≠ forecast 2026 (period accuracy in persisted signal)
 *   2. EMAIL → classification "claim" (never "actual")
 *   3. FINANCIAL_MODEL → default "forecast"
 *
 * Also exercises the full pipeline runEvidenceForDocument → persist.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

import { shouldSkipDbTests } from "@/lib/test-db-guard";

config({ path: ".env.local" });

const TEST_KEY = "a".repeat(64);
process.env.DOCUMENT_ENCRYPTION_KEY ??= TEST_KEY;

const skipDbTests = shouldSkipDbTests().skip;
const DB_TEST_TIMEOUT = 30_000;

if (skipDbTests) {
  describe.skip("claims-extractor integration (skipped)", () => {
    it("skipped", () => {
      expect(true).toBe(true);
    });
  });
} else {
  const { PrismaClient } = await import("@prisma/client");
  const { runEvidenceForDocument } = await import("../run-evidence-for-document");
  const { safeDecryptJsonField } = await import("@/lib/encryption");

  const prisma = new PrismaClient();
  const PREFIX = `__phase6_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let userId = "";
  let dealId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { clerkId: `${PREFIX}__user`, email: `${PREFIX}@phase6.invalid`, name: "Phase 6 Test" },
    });
    userId = user.id;
    const deal = await prisma.deal.create({ data: { name: `${PREFIX}_deal`, userId } });
    dealId = deal.id;
  }, DB_TEST_TIMEOUT);

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  describe("Codex Phase 6 gates (DB end-to-end)", { timeout: DB_TEST_TIMEOUT }, () => {
    it("Gate 1 — CA 2025 vs forecast 2026 : périodes correctes, pas confondues", async () => {
      const doc = await prisma.document.create({
        data: {
          dealId, name: "Deck-gate1.pdf", type: "PITCH_DECK", version: 1,
          processingStatus: "COMPLETED",
        },
      });
      const run = await prisma.documentExtractionRun.create({
        data: { documentId: doc.id, documentVersion: 1, extractionVersion: "test", pipelineVersion: "test", status: "READY" },
      });
      await runEvidenceForDocument(prisma, {
        documentId: doc.id,
        extractedTextPlaintext: "Traction: CA 2025 = 3M€. Forecast 2026: ARR 2026 = 7M€.",
        extractionRunId: run.id,
      });
      const sigs = await prisma.evidenceSignal.findMany({
        where: { documentId: doc.id, kind: { in: ["METRIC_CLAIM", "VALUATION_CLAIM"] } },
      });
      const ca2025 = sigs.find((s) => {
        const v = safeDecryptJsonField<{ metric?: string; year?: number }>(s.valueJson);
        return v?.metric === "CA" && v?.year === 2025;
      });
      expect(ca2025).toBeDefined();
      expect(ca2025!.dateStart?.toISOString().slice(0, 10)).toBe("2025-01-01");
      expect(ca2025!.dateEnd?.toISOString().slice(0, 10)).toBe("2025-12-31");

      const arr2026 = sigs.find((s) => {
        const v = safeDecryptJsonField<{ metric?: string; year?: number }>(s.valueJson);
        return v?.metric === "ARR" && v?.year === 2026;
      });
      expect(arr2026).toBeDefined();
      expect(arr2026!.dateStart?.toISOString().slice(0, 10)).toBe("2026-01-01");
      expect(arr2026!.dateEnd?.toISOString().slice(0, 10)).toBe("2026-12-31");
    });

    it("Gate 2 — Email Avekapeti '3M€ CA 2025' → classification='claim' (jamais actual)", async () => {
      const doc = await prisma.document.create({
        data: {
          dealId, name: "Mail-gate2.pdf", type: "OTHER", version: 1,
          sourceKind: "EMAIL", sourceDate: new Date("2026-04-22T01:03:00Z"),
          processingStatus: "COMPLETED",
        },
      });
      const run = await prisma.documentExtractionRun.create({
        data: { documentId: doc.id, documentVersion: 1, extractionVersion: "test", pipelineVersion: "test", status: "READY" },
      });
      await runEvidenceForDocument(prisma, {
        documentId: doc.id,
        extractedTextPlaintext: "Subject: 3M€ CA 2025 rentable. Body: nous avons réalisé 3M€ de CA 2025 audited.",
        extractionRunId: run.id,
      });
      const sigs = await prisma.evidenceSignal.findMany({
        where: { documentId: doc.id, kind: "METRIC_CLAIM" },
      });
      const ca = sigs.find((s) => {
        const v = safeDecryptJsonField<{ metric?: string }>(s.valueJson);
        return v?.metric === "CA";
      });
      expect(ca).toBeDefined();
      const decoded = safeDecryptJsonField<{ classification?: string }>(ca!.valueJson);
      // Even with "réalisé" + "audited" in the email body, classification stays "claim".
      expect(decoded?.classification).toBe("claim");
    });

    it("Gate 3 — BP (FINANCIAL_MODEL) avec 'CA 2026 = 3M€' → classification='forecast'", async () => {
      const doc = await prisma.document.create({
        data: {
          dealId, name: "BP-gate3.xlsx", type: "FINANCIAL_MODEL", version: 1,
          processingStatus: "COMPLETED",
        },
      });
      const run = await prisma.documentExtractionRun.create({
        data: { documentId: doc.id, documentVersion: 1, extractionVersion: "test", pipelineVersion: "test", status: "READY" },
      });
      await runEvidenceForDocument(prisma, {
        documentId: doc.id,
        extractedTextPlaintext: "Compte de résultat prévisionnel. CA 2026 = 3M€.",
        extractionRunId: run.id,
      });
      const sigs = await prisma.evidenceSignal.findMany({
        where: { documentId: doc.id, kind: "METRIC_CLAIM" },
      });
      const ca = sigs.find((s) => {
        const v = safeDecryptJsonField<{ metric?: string; year?: number }>(s.valueJson);
        return v?.metric === "CA" && v?.year === 2026;
      });
      expect(ca).toBeDefined();
      const decoded = safeDecryptJsonField<{ classification?: string }>(ca!.valueJson);
      expect(decoded?.classification).toBe("forecast");
    });

    it("VALUATION_CLAIM 'valorisation 6M€' persisté correctement", async () => {
      const doc = await prisma.document.create({
        data: {
          dealId, name: "Deck-val.pdf", type: "PITCH_DECK", version: 1,
          processingStatus: "COMPLETED",
        },
      });
      const run = await prisma.documentExtractionRun.create({
        data: { documentId: doc.id, documentVersion: 1, extractionVersion: "test", pipelineVersion: "test", status: "READY" },
      });
      await runEvidenceForDocument(prisma, {
        documentId: doc.id,
        extractedTextPlaintext: "Tour de table: notre valorisation est de 6M€ pre-money.",
        extractionRunId: run.id,
      });
      const sigs = await prisma.evidenceSignal.findMany({
        where: { documentId: doc.id, kind: "VALUATION_CLAIM" },
      });
      expect(sigs.length).toBeGreaterThanOrEqual(1);
      const decoded = safeDecryptJsonField<{ amount?: number; currency?: string; classification?: string }>(sigs[0].valueJson);
      expect(decoded?.amount).toBe(6_000_000);
      expect(decoded?.currency).toBe("EUR");
      expect(decoded?.classification).toBe("claim"); // PITCH_DECK → claim
    });

    it("Idempotence : re-run même text → claims dédupliqués via signalHash", async () => {
      const doc = await prisma.document.create({
        data: {
          dealId, name: "Idempotent-deck.pdf", type: "PITCH_DECK", version: 1,
          processingStatus: "COMPLETED",
        },
      });
      const run = await prisma.documentExtractionRun.create({
        data: { documentId: doc.id, documentVersion: 1, extractionVersion: "test", pipelineVersion: "test", status: "READY" },
      });
      const text = "Traction: CA 2025 = 5M€. ARR 2026 = 1.5M€.";

      const first = await runEvidenceForDocument(prisma, {
        documentId: doc.id, extractedTextPlaintext: text, extractionRunId: run.id,
      });
      const second = await runEvidenceForDocument(prisma, {
        documentId: doc.id, extractedTextPlaintext: text, extractionRunId: run.id,
      });

      expect(first.claimsPersisted).toBeGreaterThanOrEqual(2);
      // Second call must dedupe.
      expect(second.claimsPersisted).toBe(0);
      expect(second.claimsDeduplicated).toBeGreaterThanOrEqual(2);
    });
  });
}
