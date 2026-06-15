/**
 * Phase 5.4 — Integration test for buildDealEvidenceContext against Neon.
 *
 * Avekapeti gate : cap table + email + ATTACHMENT_RELATION + stale warning,
 * end-to-end through createEvidenceSignal + linkEmailAttachments +
 * buildDealEvidenceContext.
 *
 * SKIP via env: SKIP_DB_TESTS=1
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
  describe.skip("buildDealEvidenceContext integration (skipped)", () => {
    it("skipped", () => {
      expect(true).toBe(true);
    });
  });
} else {
  const { PrismaClient } = await import("@prisma/client");
  const { buildDealEvidenceContext } = await import("../build-evidence-context");
  const { linkEmailAttachments } = await import("../attachment-linker");
  const { createEvidenceSignal } = await import("../../evidence-signals/create-signal");

  const prisma = new PrismaClient();
  const PREFIX = `__phase5_ec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let userId = "";
  let dealId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { clerkId: `${PREFIX}__user`, email: `${PREFIX}@phase5.invalid`, name: "Phase 5 Test" },
    });
    userId = user.id;
    const deal = await prisma.deal.create({ data: { name: `${PREFIX}_deal`, userId } });
    dealId = deal.id;
  }, DB_TEST_TIMEOUT);

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  describe("buildDealEvidenceContext integration (Codex Phase 5 Avekapeti gate)", { timeout: DB_TEST_TIMEOUT }, () => {
    it("cap table + ATTACHMENT_RELATION → context montre asOf + parent email + stale warning", async () => {
      const capTable = await prisma.document.create({
        data: { dealId, name: "Cap-context.png", type: "CAP_TABLE", version: 1 },
      });
      const email = await prisma.document.create({
        data: {
          dealId, name: "Mail-context.pdf", type: "OTHER", version: 1,
          sourceKind: "EMAIL", sourceDate: new Date("2026-04-22T01:03:00Z"),
        },
      });
      const capRun = await prisma.documentExtractionRun.create({
        data: { documentId: capTable.id, documentVersion: 1, extractionVersion: "test", pipelineVersion: "test" },
      });
      await createEvidenceSignal(prisma, {
        dealId,
        documentId: capTable.id,
        documentVersion: 1,
        signalScopeKey: `run:${capRun.id}`,
        extractionRunId: capRun.id,
        extractorVersion: "test-extractor@v1",
        kind: "CAP_TABLE_AS_OF",
        valueJson: { asOf: "2024-09-18" },
        asOfDate: new Date("2024-09-18T00:00:00Z"),
        precision: "DAY",
        confidence: "HIGH",
        sourceMethod: "DETERMINISTIC",
        evidenceText: "Table de capitalisation à jour au 18/09/2024",
      });
      await linkEmailAttachments(prisma, {
        emailDocumentId: email.id,
        emailDealId: dealId,
        emailDocumentVersion: 1,
        emailExtractedText: "Voir Cap-context.png en pièce jointe.",
        emailSourceDate: new Date("2026-04-22T01:03:00Z"),
      });

      const today = new Date("2026-05-18T12:00:00Z");
      const ctxMap = await buildDealEvidenceContext(prisma, dealId, { today });
      const ctx = ctxMap[capTable.id];
      expect(ctx).toBeDefined();

      expect(ctx.asOf?.signalKind).toBe("CAP_TABLE_AS_OF");
      expect(ctx.asOf?.date.toISOString().slice(0, 10)).toBe("2024-09-18");
      expect(ctx.asOf?.confidence).toBe("HIGH");
      expect(ctx.asOf?.evidenceText).toContain("Table de capitalisation");

      expect(ctx.detectedAttachments).toHaveLength(1);
      expect(ctx.detectedAttachments[0].emailDocName).toBe("Mail-context.pdf");
      expect(ctx.detectedAttachments[0].matchMethod).toBe("exact");

      const stale = ctx.staleWarnings.find((w) => w.kind === "cap_table_stale");
      expect(stale).toBeDefined();
      expect(stale?.message).toMatch(/months old/);
    });

    it("Codex round 17 P2 — latest-run filter exercé sur Postgres réel : ancien HIGH + nouveau MEDIUM → nouveau wins", async () => {
      // Setup: cap table doc + TWO terminal-success extraction runs (oldRun + newRun).
      // The SQL DISTINCT ON ("documentId") ORDER BY startedAt DESC must pick newRun.
      const capTable = await prisma.document.create({
        data: { dealId, name: "LatestRun-cap.png", type: "CAP_TABLE", version: 1 },
      });
      const oldRun = await prisma.documentExtractionRun.create({
        data: {
          documentId: capTable.id,
          documentVersion: 1,
          extractionVersion: "test-v1",
          pipelineVersion: "test-v1",
          status: "READY", // ← terminal so the SQL picks it up
          startedAt: new Date("2026-05-10T10:00:00Z"),
        },
      });
      const newRun = await prisma.documentExtractionRun.create({
        data: {
          documentId: capTable.id,
          documentVersion: 1,
          extractionVersion: "test-v1",
          pipelineVersion: "test-v1",
          status: "READY_WITH_WARNINGS", // ← also terminal
          startedAt: new Date("2026-05-18T10:00:00Z"), // strictly later
        },
      });

      // Insert TWO signals: an old-run HIGH that would "win" the picker on
      // confidence/precision/scope alone, and a new-run MEDIUM that should win
      // ONLY because the run-filter drops the old-run signal first.
      await createEvidenceSignal(prisma, {
        dealId,
        documentId: capTable.id,
        documentVersion: 1,
        signalScopeKey: `run:${oldRun.id}`,
        extractionRunId: oldRun.id,
        extractorVersion: "test-extractor@v1",
        kind: "CAP_TABLE_AS_OF",
        valueJson: { asOf: "2024-08-18" }, // wrong! (08 vs 09 typo from old OCR)
        asOfDate: new Date("2024-08-18T00:00:00Z"),
        precision: "DAY",
        confidence: "HIGH",
        sourceMethod: "DETERMINISTIC",
        evidenceText: "Table de capitalisation à jour au 18/08/2024 (old OCR misread)",
      });
      await createEvidenceSignal(prisma, {
        dealId,
        documentId: capTable.id,
        documentVersion: 1,
        signalScopeKey: `run:${newRun.id}`,
        extractionRunId: newRun.id,
        extractorVersion: "test-extractor@v1",
        kind: "CAP_TABLE_AS_OF",
        valueJson: { asOf: "2024-09-18" }, // correct!
        asOfDate: new Date("2024-09-18T00:00:00Z"),
        precision: "DAY",
        confidence: "MEDIUM", // lower confidence on purpose
        sourceMethod: "DETERMINISTIC",
        evidenceText: "Table de capitalisation à jour au 18/09/2024",
      });

      const today = new Date("2026-05-18T12:00:00Z");
      const ctx = (await buildDealEvidenceContext(prisma, dealId, { today }))[capTable.id];
      expect(ctx).toBeDefined();

      // The new-run MEDIUM must win even though the old-run HIGH would
      // outrank it on confidence alone. This proves the SQL latest-run
      // filter runs end-to-end on real Postgres.
      expect(ctx.asOf?.date.toISOString().slice(0, 10)).toBe("2024-09-18");
      expect(ctx.asOf?.confidence).toBe("MEDIUM");
      expect(ctx.asOf?.signalScopeKey).toBe(`run:${newRun.id}`);
    });

    it("Codex round 17 P2 — runs PENDING/PROCESSING/FAILED ne comptent PAS comme 'latest' → run terminal antérieur reste l'autoritaire", async () => {
      const capTable = await prisma.document.create({
        data: { dealId, name: "TerminalOnly-cap.png", type: "CAP_TABLE", version: 1 },
      });
      // Older terminal run (READY).
      const terminalRun = await prisma.documentExtractionRun.create({
        data: {
          documentId: capTable.id,
          documentVersion: 1,
          extractionVersion: "test-v1",
          pipelineVersion: "test-v1",
          status: "READY",
          startedAt: new Date("2026-05-10T10:00:00Z"),
        },
      });
      // Newer PENDING run (started later but not terminal yet).
      await prisma.documentExtractionRun.create({
        data: {
          documentId: capTable.id,
          documentVersion: 1,
          extractionVersion: "test-v2",
          pipelineVersion: "test-v2",
          status: "PENDING",
          startedAt: new Date("2026-05-18T10:00:00Z"),
        },
      });

      await createEvidenceSignal(prisma, {
        dealId,
        documentId: capTable.id,
        documentVersion: 1,
        signalScopeKey: `run:${terminalRun.id}`,
        extractionRunId: terminalRun.id,
        extractorVersion: "test-extractor@v1",
        kind: "CAP_TABLE_AS_OF",
        valueJson: { asOf: "2024-09-18" },
        asOfDate: new Date("2024-09-18T00:00:00Z"),
        precision: "DAY",
        confidence: "HIGH",
        sourceMethod: "DETERMINISTIC",
      });

      const ctx = (await buildDealEvidenceContext(prisma, dealId))[capTable.id];
      expect(ctx).toBeDefined();
      // The terminal READY signal wins because the PENDING run is filtered out.
      expect(ctx.asOf?.signalScopeKey).toBe(`run:${terminalRun.id}`);
      expect(ctx.asOf?.date.toISOString().slice(0, 10)).toBe("2024-09-18");
    });

    it("BP avec FINANCIAL_PERIOD_FORECAST 2026-2030 → context montre forecast + warning historical", async () => {
      const bp = await prisma.document.create({
        data: { dealId, name: "BP-context.xlsx", type: "FINANCIAL_MODEL", version: 1 },
      });
      const bpRun = await prisma.documentExtractionRun.create({
        data: { documentId: bp.id, documentVersion: 1, extractionVersion: "test", pipelineVersion: "test" },
      });
      await createEvidenceSignal(prisma, {
        dealId,
        documentId: bp.id,
        documentVersion: 1,
        signalScopeKey: `run:${bpRun.id}`,
        extractionRunId: bpRun.id,
        extractorVersion: "test-extractor@v1",
        kind: "FINANCIAL_PERIOD_FORECAST",
        valueJson: { start: "2026-01-01", end: "2030-12-31", yearsCovered: [2026, 2027, 2028, 2029, 2030] },
        dateStart: new Date("2026-01-01T00:00:00Z"),
        dateEnd: new Date("2030-12-31T00:00:00Z"),
        precision: "RANGE",
        confidence: "HIGH",
        sourceMethod: "DETERMINISTIC",
      });

      const today = new Date("2026-05-18T12:00:00Z");
      const ctx = (await buildDealEvidenceContext(prisma, dealId, { today }))[bp.id];
      expect(ctx.forecast).toBeDefined();
      expect(ctx.forecast?.yearsCovered).toEqual([2026, 2027, 2028, 2029, 2030]);

      // 2026 has started (today is 2026-05-18) → warning historical for 2026
      const histo = ctx.staleWarnings.find((w) => w.kind === "forecast_now_historical");
      expect(histo).toBeDefined();
      expect(histo?.message).toMatch(/2026/);
    });
  });
}
