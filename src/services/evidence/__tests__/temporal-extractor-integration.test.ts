/**
 * Phase 2 — End-to-end integration test for the temporal extractor pipeline.
 *
 * Wires runTemporalExtractor → persistTemporalSignals → DB read-back.
 * Hits the real Neon database (same pattern as
 * src/services/evidence-signals/__tests__/db-integration.test.ts).
 *
 * SKIP via env: SKIP_DB_TESTS=1 vitest
 *
 * Invariants verified:
 *  1. EvidenceSignal rows are written with the correct scope keys
 *     ("run:<id>" for extracted_text signals, "filename" for filename/email).
 *  2. evidenceText + valueJson are stored encrypted (no plaintext leak).
 *  3. Document.sourceDate / Document.sourceKind are NEVER mutated by Phase 2.
 *  4. Re-running the same extraction is idempotent (returns deduplicated rows).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local" });

const TEST_KEY = "a".repeat(64);
process.env.DOCUMENT_ENCRYPTION_KEY ??= TEST_KEY;

const skipDbTests = process.env.SKIP_DB_TESTS === "1" || !process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 30_000;

if (skipDbTests) {
  describe.skip("temporal-extractor integration (skipped: SKIP_DB_TESTS=1 or no DB)", () => {
    it("skipped", () => {
      expect(true).toBe(true);
    });
  });
} else {
  const { PrismaClient } = await import("@prisma/client");
  const { runTemporalExtractor, TEMPORAL_EXTRACTOR_VERSION } = await import("../temporal-extractor");
  const { persistTemporalSignals } = await import("../persist-temporal-signals");

  const prisma = new PrismaClient();
  const PREFIX = `__phase2_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let userId = "";
  let dealId = "";
  let docCapTableId = "";
  let docEmailId = "";
  let docDeckId = "";
  let runCapTableId = "";
  let runDeckId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        clerkId: `${PREFIX}__user`,
        email: `${PREFIX}@phase2-test.invalid`,
        name: "Phase 2 Integration Test User",
      },
    });
    userId = user.id;

    const deal = await prisma.deal.create({
      data: { name: `${PREFIX}_deal`, userId },
    });
    dealId = deal.id;

    const [capTable, email, deck] = await prisma.$transaction([
      prisma.document.create({
        data: { dealId, name: "Table de capi Septembre 2024 signeģe.png", type: "CAP_TABLE", version: 1 },
      }),
      prisma.document.create({
        data: { dealId, name: "Mail.pdf", type: "OTHER", version: 1, sourceKind: "EMAIL" },
      }),
      prisma.document.create({
        data: { dealId, name: "e4n - Confidential Presentation_BD.pdf", type: "PITCH_DECK", version: 1 },
      }),
    ]);
    docCapTableId = capTable.id;
    docEmailId = email.id;
    docDeckId = deck.id;

    const [runCap, runDeck] = await prisma.$transaction([
      prisma.documentExtractionRun.create({
        data: { documentId: docCapTableId, documentVersion: 1, extractionVersion: "test-v1", pipelineVersion: "test-v1" },
      }),
      prisma.documentExtractionRun.create({
        data: { documentId: docDeckId, documentVersion: 1, extractionVersion: "test-v1", pipelineVersion: "test-v1" },
      }),
    ]);
    runCapTableId = runCap.id;
    runDeckId = runDeck.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  describe("end-to-end pipeline", { timeout: DB_TEST_TIMEOUT }, () => {
    it("cap table Avekapeti → CAP_TABLE_AS_OF persisté avec scope 'run:<id>' et encryption", async () => {
      const signals = runTemporalExtractor({
        documentName: "Table de capi Septembre 2024 signeģe.png",
        documentType: "CAP_TABLE",
        mimeType: "image/png",
        extractedText: "Table de capitalisation à jour au 18/09/2024",
        sourceKind: "FILE",
        sourceMetadata: null,
        documentSourceDate: null,
      });

      const result = await persistTemporalSignals(
        prisma,
        {
          dealId,
          documentId: docCapTableId,
          documentVersion: 1,
          extractionRunId: runCapTableId,
          extractorVersion: TEMPORAL_EXTRACTOR_VERSION,
        },
        signals
      );
      expect(result.skipped).toBe(0);
      expect(result.persisted).toBeGreaterThanOrEqual(1);

      const rows = await prisma.evidenceSignal.findMany({
        where: { documentId: docCapTableId, kind: "CAP_TABLE_AS_OF" },
      });
      expect(rows.length).toBe(1);

      const capRow = rows[0];
      expect(capRow.signalScopeKey).toBe(`run:${runCapTableId}`);
      expect(capRow.extractionRunId).toBe(runCapTableId);
      expect(capRow.confidence).toBe("HIGH");
      expect(capRow.precision).toBe("DAY");
      expect(capRow.asOfDate?.toISOString().slice(0, 10)).toBe("2024-09-18");

      // Encryption invariants (test #13 du Phase 1 schema):
      expect(typeof capRow.evidenceText).toBe("string");
      expect(capRow.evidenceText).toMatch(/^[A-Za-z0-9+/=]+$/);
      const valueJsonRaw = capRow.valueJson as { _enc?: unknown } | null;
      expect(valueJsonRaw && typeof valueJsonRaw === "object" && "_enc" in valueJsonRaw).toBe(true);
      const rawDump = JSON.stringify(capRow);
      expect(rawDump).not.toContain("18/09/2024");
      expect(rawDump).not.toContain("à jour au");
    });

    it("idempotence Phase 2 — re-extraire le même doc retourne deduplicated:true (Codex round 4 P1)", async () => {
      const signals = runTemporalExtractor({
        documentName: "Table de capi Septembre 2024 signeģe.png",
        documentType: "CAP_TABLE",
        mimeType: "image/png",
        extractedText: "Table de capitalisation à jour au 18/09/2024",
        sourceKind: "FILE",
        sourceMetadata: null,
        documentSourceDate: null,
      });
      const result = await persistTemporalSignals(
        prisma,
        {
          dealId,
          documentId: docCapTableId,
          documentVersion: 1,
          extractionRunId: runCapTableId,
          extractorVersion: TEMPORAL_EXTRACTOR_VERSION,
        },
        signals
      );
      expect(result.persisted).toBe(0);
      expect(result.deduplicated).toBeGreaterThanOrEqual(1);
    });

    it("email Avekapeti → EMAIL_SENT_AT persisté avec scope 'source_metadata' (Codex round 7 P2) et extractionRunId=null", async () => {
      const signals = runTemporalExtractor({
        documentName: "Mail.pdf",
        documentType: "OTHER",
        mimeType: "application/pdf",
        extractedText: "17/05/2026 15:01 Gmail - Tr : Re : Avekapeti",
        sourceKind: "EMAIL",
        sourceMetadata: {
          threadMessages: [
            { from: "Eryck Rebbouh", sentAt: "2026-04-22T01:03:00Z", subject: "Tr : Re : Avekapeti" },
          ],
        },
        documentSourceDate: new Date("2026-04-22T01:03:00Z"),
      });

      const result = await persistTemporalSignals(
        prisma,
        {
          dealId,
          documentId: docEmailId,
          documentVersion: 1,
          extractionRunId: null, // emails often have no run; the persister must accept this
          extractorVersion: TEMPORAL_EXTRACTOR_VERSION,
        },
        signals
      );
      expect(result.persisted).toBeGreaterThanOrEqual(1);

      const emailRows = await prisma.evidenceSignal.findMany({
        where: { documentId: docEmailId, kind: "EMAIL_SENT_AT" },
      });
      expect(emailRows.length).toBe(1);
      expect(emailRows[0].signalScopeKey).toBe("source_metadata");
      expect(emailRows[0].extractionRunId).toBeNull();
      expect(emailRows[0].reportedAt?.toISOString()).toBe("2026-04-22T01:03:00.000Z");
    });

    it("deck E4N → DOCUMENT_DATE HIGH from footer persisté ; PAS de DOCUMENT_DATE MEDIUM from filename (anti-shadow)", async () => {
      const signals = runTemporalExtractor({
        documentName: "e4n - Confidential Presentation_BD.pdf",
        documentType: "PITCH_DECK",
        mimeType: "application/pdf",
        extractedText: "Page 1\ne4n Confidential – March 2026\nPage 2\n2 e4n Confidential – March 2026",
        sourceKind: "FILE",
        sourceMetadata: null,
        documentSourceDate: null,
      });

      const result = await persistTemporalSignals(
        prisma,
        {
          dealId,
          documentId: docDeckId,
          documentVersion: 1,
          extractionRunId: runDeckId,
          extractorVersion: TEMPORAL_EXTRACTOR_VERSION,
        },
        signals
      );
      expect(result.persisted).toBeGreaterThanOrEqual(1);

      const docDates = await prisma.evidenceSignal.findMany({
        where: { documentId: docDeckId, kind: "DOCUMENT_DATE" },
      });
      expect(docDates.length).toBe(1);
      expect(docDates[0].confidence).toBe("HIGH");
      expect(docDates[0].signalScopeKey).toBe(`run:${runDeckId}`);
      expect(docDates[0].asOfDate?.toISOString().slice(0, 7)).toBe("2026-03");
    });

    it("invariant Phase 2: Document.sourceDate et Document.sourceKind NE SONT PAS mutés par l'extraction", async () => {
      const capTableDoc = await prisma.document.findUnique({ where: { id: docCapTableId } });
      const emailDoc = await prisma.document.findUnique({ where: { id: docEmailId } });
      const deckDoc = await prisma.document.findUnique({ where: { id: docDeckId } });

      // CAP_TABLE: was created with sourceDate=null, sourceKind=FILE (default).
      expect(capTableDoc?.sourceDate).toBeNull();
      expect(capTableDoc?.sourceKind).toBe("FILE");

      // EMAIL doc: was created with sourceKind=EMAIL but sourceDate=null
      // (caller hadn't run email-source-inference; Phase 2 must NOT fill it).
      expect(emailDoc?.sourceDate).toBeNull();
      expect(emailDoc?.sourceKind).toBe("EMAIL");

      // PITCH_DECK: was created with sourceDate=null. Phase 2 does NOT promote
      // the DOCUMENT_DATE HIGH signal into Document.sourceDate (that's Phase 3).
      expect(deckDoc?.sourceDate).toBeNull();
      expect(deckDoc?.sourceKind).toBe("FILE");
    });

    it("extracted_text signal sans extractionRunId est skippé (pas un throw, retour propre)", async () => {
      const signals = runTemporalExtractor({
        documentName: "Table de capi Septembre 2024 signeģe.png",
        documentType: "CAP_TABLE",
        mimeType: "image/png",
        extractedText: "Table de capitalisation à jour au 18/09/2024",
        sourceKind: "FILE",
        sourceMetadata: null,
        documentSourceDate: null,
      });
      const result = await persistTemporalSignals(
        prisma,
        {
          dealId,
          documentId: docEmailId, // borrow email doc
          documentVersion: 1,
          extractionRunId: null, // no run → extracted_text signals are skipped
          extractorVersion: TEMPORAL_EXTRACTOR_VERSION,
        },
        signals
      );
      expect(result.skipped).toBeGreaterThanOrEqual(1);
      expect(result.skippedReasons[0].reason).toContain("extracted_text signal requires extractionRunId");
    });
  });
}
