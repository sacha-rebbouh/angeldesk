/**
 * Phase 3 — Integration tests for promoteSourceDateFromSignals against Neon.
 *
 * Covers safeguards listed in promote-source-date.ts:
 *  - never overwrite an existing sourceDate (email, manual, prior promotion)
 *  - only HIGH confidence
 *  - only kinds aligned with the docType
 *  - sourceMetadata.temporal trace is patched (existing meta keys preserved)
 *  - the bilan / cap table / deck cases from Phase 0 audit produce the right outcome
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
  describe.skip("promote-source-date integration (skipped)", () => {
    it("skipped", () => {
      expect(true).toBe(true);
    });
  });
} else {
  const { PrismaClient } = await import("@prisma/client");
  const { runTemporalExtractor, TEMPORAL_EXTRACTOR_VERSION } = await import("../temporal-extractor");
  const { persistTemporalSignals } = await import("../persist-temporal-signals");
  const { promoteSourceDateFromSignals } = await import("../promote-source-date");

  const prisma = new PrismaClient();
  const PREFIX = `__phase3_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let userId = "";
  let dealId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        clerkId: `${PREFIX}__user`,
        email: `${PREFIX}@phase3.invalid`,
        name: "Phase 3 Integration Test User",
      },
    });
    userId = user.id;
    const deal = await prisma.deal.create({ data: { name: `${PREFIX}_deal`, userId } });
    dealId = deal.id;
  }, DB_TEST_TIMEOUT);

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function setupDocWithExtraction(opts: {
    name: string;
    type: "CAP_TABLE" | "FINANCIAL_STATEMENTS" | "PITCH_DECK" | "FINANCIAL_MODEL" | "OTHER";
    text: string;
    sourceKind?: "FILE" | "EMAIL" | "NOTE";
    sourceDate?: Date | null;
    sourceMetadata?: object | null;
  }) {
    const doc = await prisma.document.create({
      data: {
        dealId,
        name: opts.name,
        type: opts.type,
        version: 1,
        sourceKind: opts.sourceKind ?? "FILE",
        sourceDate: opts.sourceDate ?? null,
        sourceMetadata: (opts.sourceMetadata ?? undefined) as object,
      },
    });
    const run = await prisma.documentExtractionRun.create({
      data: {
        documentId: doc.id,
        documentVersion: 1,
        extractionVersion: "test-v1",
        pipelineVersion: "test-v1",
      },
    });
    const signals = runTemporalExtractor({
      documentName: opts.name,
      documentType: opts.type,
      mimeType: null,
      extractedText: opts.text,
      sourceKind: opts.sourceKind ?? "FILE",
      sourceMetadata: opts.sourceMetadata ?? null,
      documentSourceDate: opts.sourceDate ?? null,
    });
    await persistTemporalSignals(prisma, {
      dealId,
      documentId: doc.id,
      documentVersion: 1,
      extractionRunId: run.id,
      extractorVersion: TEMPORAL_EXTRACTOR_VERSION,
    }, signals);
    return { docId: doc.id, runId: run.id };
  }

  describe("promotion safeguards", { timeout: DB_TEST_TIMEOUT }, () => {
    it("cap table Avekapeti → Document.sourceDate promu à 2024-09-18 (HIGH)", async () => {
      const { docId } = await setupDocWithExtraction({
        name: "Table de capi Septembre 2024 signeģe.png",
        type: "CAP_TABLE",
        text: "Table de capitalisation à jour au 18/09/2024",
      });

      const outcome = await promoteSourceDateFromSignals(prisma, {
        documentId: docId,
        dealId,
        documentType: "CAP_TABLE",
        currentSourceDate: null,
      });

      expect(outcome.promoted).toBe(true);
      if (!outcome.promoted) return;
      expect(outcome.newSourceDate.toISOString().slice(0, 10)).toBe("2024-09-18");
      expect(outcome.kind).toBe("CAP_TABLE_AS_OF");

      const doc = await prisma.document.findUnique({ where: { id: docId } });
      expect(doc?.sourceDate?.toISOString().slice(0, 10)).toBe("2024-09-18");
      const meta = doc?.sourceMetadata as { temporal?: Record<string, unknown> } | null;
      expect(meta?.temporal?.promotedBy).toBe("evidence-engine-phase3");
      expect(meta?.temporal?.kind).toBe("CAP_TABLE_AS_OF");
      expect(meta?.temporal?.confidence).toBe("HIGH");
      expect(meta?.temporal?.evidenceSignalId).toBe(outcome.signalId);
    });

    it("BP Avekapeti monthly 2025-2026 → Document.sourceDate reste null (pas d'eligible signal)", async () => {
      const { docId } = await setupDocWithExtraction({
        name: "BP Avekapeti 2026 VF.xlsx",
        type: "FINANCIAL_MODEL",
        text: `[COMPTE DE RESULTAT PREVISIONNEL SUR UN AN] Janvier 2025: février 2025 | mars 2025 | avril 2025 | mai 2025 | juin 2025
[COMPTE DE RESULTAT PREVISIONNEL SUR UN AN] Janvier 2026: février 2026 | mars 2026 | avril 2026 | mai 2026 | juin 2026`,
      });

      const outcome = await promoteSourceDateFromSignals(prisma, {
        documentId: docId,
        dealId,
        documentType: "FINANCIAL_MODEL",
        currentSourceDate: null,
      });

      expect(outcome.promoted).toBe(false);
      const doc = await prisma.document.findUnique({ where: { id: docId } });
      expect(doc?.sourceDate).toBeNull();
    });

    it("deck E4N → Document.sourceDate promu à 2026-03-01 (DOCUMENT_DATE HIGH footer)", async () => {
      const { docId } = await setupDocWithExtraction({
        name: "e4n - Confidential Presentation_BD.pdf",
        type: "PITCH_DECK",
        text: "Page 1\ne4n Confidential – March 2026\nPage 2\ne4n Confidential – March 2026",
      });

      const outcome = await promoteSourceDateFromSignals(prisma, {
        documentId: docId,
        dealId,
        documentType: "PITCH_DECK",
        currentSourceDate: null,
      });

      expect(outcome.promoted).toBe(true);
      if (!outcome.promoted) return;
      expect(outcome.kind).toBe("DOCUMENT_DATE");
      expect(outcome.newSourceDate.toISOString().slice(0, 10)).toBe("2026-03-01");
    });

    it("doc avec sourceDate déjà set (email) → NE PAS écraser (Codex round 8 safeguard)", async () => {
      const preExistingDate = new Date("2026-04-22T01:03:00Z");
      const { docId } = await setupDocWithExtraction({
        name: "Mail.pdf",
        type: "OTHER",
        sourceKind: "EMAIL",
        sourceDate: preExistingDate,
        sourceMetadata: { inferredFrom: "uploaded_file_text", confidence: "high" },
        text: "Some email body",
      });

      const outcome = await promoteSourceDateFromSignals(prisma, {
        documentId: docId,
        dealId,
        documentType: "OTHER",
        currentSourceDate: preExistingDate, // simulate the pipeline passing the existing date
      });
      expect(outcome.promoted).toBe(false);
      expect("reason" in outcome ? outcome.reason : "").toBe("source_date_already_set");

      const doc = await prisma.document.findUnique({ where: { id: docId } });
      expect(doc?.sourceDate?.toISOString()).toBe(preExistingDate.toISOString());
      // sourceMetadata.temporal must NOT have been written (no promotion).
      const meta = doc?.sourceMetadata as { temporal?: unknown } | null;
      expect(meta?.temporal).toBeUndefined();
      // existing keys preserved:
      expect((meta as { inferredFrom?: string } | null)?.inferredFrom).toBe("uploaded_file_text");
    });

    it("OTHER doctype même avec signal HIGH → pas promu (docType not eligible)", async () => {
      const { docId } = await setupDocWithExtraction({
        name: "random.pdf",
        type: "OTHER",
        text: "Table de capitalisation à jour au 18/09/2024",
      });
      const outcome = await promoteSourceDateFromSignals(prisma, {
        documentId: docId,
        dealId,
        documentType: "OTHER",
        currentSourceDate: null,
      });
      expect(outcome.promoted).toBe(false);
      expect("reason" in outcome ? outcome.reason : "").toBe("doc_type_not_eligible");
    });

    it("idempotence : 2 appels successifs avec sourceDate déjà promu = no-op (safeguard race)", async () => {
      const { docId } = await setupDocWithExtraction({
        name: "bilan_et_resultat - test.pdf",
        type: "FINANCIAL_STATEMENTS",
        text: `BILAN ACTIF
Période du 01/01/2025 au 31/12/2025 Présenté en Euros
Exercice clos le        Exercice précédent
ACTIF 31/12/2025 31/12/2024`,
      });

      const first = await promoteSourceDateFromSignals(prisma, {
        documentId: docId,
        dealId,
        documentType: "FINANCIAL_STATEMENTS",
        currentSourceDate: null,
      });
      expect(first.promoted).toBe(true);
      if (!first.promoted) return;
      expect(first.kind).toBe("BALANCE_SHEET_AS_OF");

      // Second call — currentSourceDate is now set, the in-DB check also passes.
      const second = await promoteSourceDateFromSignals(prisma, {
        documentId: docId,
        dealId,
        documentType: "FINANCIAL_STATEMENTS",
        // even passing null to simulate stale input: the in-DB re-read should catch.
        currentSourceDate: null,
      });
      expect(second.promoted).toBe(false);
      expect("reason" in second ? second.reason : "").toBe("source_date_already_set");
    });

    it("filename DOCUMENT_DATE MEDIUM ne déclenche pas la promotion", async () => {
      // PITCH_DECK with no extracted text and a filename "Sept-2025"
      // produces a DOCUMENT_DATE MEDIUM scope=filename. Promotion must skip it.
      const { docId } = await setupDocWithExtraction({
        name: "deck-Sept-2025.pdf",
        type: "PITCH_DECK",
        text: "Some content with no footer date",
      });
      const outcome = await promoteSourceDateFromSignals(prisma, {
        documentId: docId,
        dealId,
        documentType: "PITCH_DECK",
        currentSourceDate: null,
      });
      expect(outcome.promoted).toBe(false);
      expect("reason" in outcome ? outcome.reason : "").toBe("no_eligible_signal");
    });
  });
}
