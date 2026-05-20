/**
 * Phase 4 — Integration test for attachment-linker against Neon.
 *
 * Covers the Codex Phase 4 gates :
 *   - Avekapeti Mail.pdf mentioning the cap table is linked to the cap table doc.
 *   - The cap table's own sourceDate (CAP_TABLE_AS_OF promotion) coexists with
 *     the ATTACHMENT_RELATION signal (reportedAt = email's sentAt).
 *   - Cross-tenant isolation : an email in deal A cannot link to a doc in deal B.
 *
 * SKIP via env: SKIP_DB_TESTS=1
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local" });

const TEST_KEY = "a".repeat(64);
process.env.DOCUMENT_ENCRYPTION_KEY ??= TEST_KEY;

const skipDbTests = process.env.SKIP_DB_TESTS === "1" || !process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 30_000;

if (skipDbTests) {
  describe.skip("attachment-linker integration (skipped)", () => {
    it("skipped", () => {
      expect(true).toBe(true);
    });
  });
} else {
  const { PrismaClient } = await import("@prisma/client");
  const { linkEmailAttachments, ATTACHMENT_LINKER_VERSION } = await import("../attachment-linker");
  const { runEvidenceForDocument } = await import("../run-evidence-for-document");

  const prisma = new PrismaClient();
  const PREFIX = `__phase4_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let userId = "";
  let dealAId = "";
  let dealBId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        clerkId: `${PREFIX}__user`,
        email: `${PREFIX}@phase4.invalid`,
        name: "Phase 4 Test User",
      },
    });
    userId = user.id;
    const [dealA, dealB] = await prisma.$transaction([
      prisma.deal.create({ data: { name: `${PREFIX}_dealA`, userId } }),
      prisma.deal.create({ data: { name: `${PREFIX}_dealB`, userId } }),
    ]);
    dealAId = dealA.id;
    dealBId = dealB.id;
  }, DB_TEST_TIMEOUT);

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  describe("attachment-linker DB end-to-end", { timeout: DB_TEST_TIMEOUT }, () => {
    it("Codex Phase 4 gate — Avekapeti Mail.pdf → cap table linké, scope source_metadata, confidence HIGH", async () => {
      // Setup : cap table doc + email doc, in the same deal.
      const capTable = await prisma.document.create({
        data: {
          dealId: dealAId,
          name: "Table de capi Septembre 2024 signeģe.png",
          type: "CAP_TABLE",
          version: 1,
        },
      });
      const email = await prisma.document.create({
        data: {
          dealId: dealAId,
          name: "Mail.pdf",
          type: "OTHER",
          version: 1,
          sourceKind: "EMAIL",
          sourceDate: new Date("2026-04-22T01:03:00Z"),
        },
      });

      const emailText = `Cher Eryck,
Ci-joint la cap table mise à jour. Bien cordialement, Fati.
Table de capi Septembre 2024 signeģe.png  136K
https://mail.google.com/...`;

      const result = await linkEmailAttachments(prisma, {
        emailDocumentId: email.id,
        emailDealId: dealAId,
        emailDocumentVersion: 1,
        emailExtractedText: emailText,
        emailSourceDate: new Date("2026-04-22T01:03:00Z"),
      });

      expect(result.matched).toBe(1);
      expect(result.persisted).toBe(1);

      const sig = await prisma.evidenceSignal.findFirst({
        where: { documentId: capTable.id, kind: "ATTACHMENT_RELATION" },
      });
      expect(sig).toBeTruthy();
      expect(sig!.signalScopeKey).toBe("source_metadata");
      expect(sig!.extractionRunId).toBeNull();
      expect(sig!.confidence).toBe("HIGH");
      expect(sig!.reportedAt?.toISOString()).toBe("2026-04-22T01:03:00.000Z");
      expect(sig!.extractorVersion).toBe(ATTACHMENT_LINKER_VERSION);
    });

    it("Codex Phase 4 invariant — la cap table sourceDate (asOf) cohabite avec ATTACHMENT_RELATION (transmittedAt)", async () => {
      const capTable = await prisma.document.create({
        data: {
          dealId: dealAId,
          name: "Cap2.png",
          type: "CAP_TABLE",
          version: 1,
        },
      });
      // Simulate Phase 3 promotion having set sourceDate from CAP_TABLE_AS_OF.
      await prisma.document.update({
        where: { id: capTable.id },
        data: {
          sourceDate: new Date("2024-09-18T00:00:00Z"),
          sourceMetadata: { temporal: { promotedBy: "evidence-engine-phase3", kind: "CAP_TABLE_AS_OF" } } as object,
        },
      });
      const email = await prisma.document.create({
        data: {
          dealId: dealAId,
          name: "Mail-cap2.pdf",
          type: "OTHER",
          version: 1,
          sourceKind: "EMAIL",
          sourceDate: new Date("2026-04-22T01:03:00Z"),
        },
      });

      await linkEmailAttachments(prisma, {
        emailDocumentId: email.id,
        emailDealId: dealAId,
        emailDocumentVersion: 1,
        emailExtractedText: `Voir Cap2.png en pièce jointe.`,
        emailSourceDate: new Date("2026-04-22T01:03:00Z"),
      });

      // Invariant : Document.sourceDate (asOf 2024-09-18) NOT overwritten.
      const refreshed = await prisma.document.findUnique({ where: { id: capTable.id } });
      expect(refreshed?.sourceDate?.toISOString()).toBe("2024-09-18T00:00:00.000Z");
      // The temporal trace from Phase 3 is preserved.
      const meta = refreshed?.sourceMetadata as { temporal?: { kind?: string } } | null;
      expect(meta?.temporal?.kind).toBe("CAP_TABLE_AS_OF");

      // ATTACHMENT_RELATION exists separately with the email's sentAt as reportedAt.
      const sig = await prisma.evidenceSignal.findFirst({
        where: { documentId: capTable.id, kind: "ATTACHMENT_RELATION" },
      });
      expect(sig).toBeTruthy();
      expect(sig!.reportedAt?.toISOString()).toBe("2026-04-22T01:03:00.000Z");
    });

    it("CROSS-TENANT — email du deal A ne link PAS un doc du deal B (même nom)", async () => {
      const docInB = await prisma.document.create({
        data: { dealId: dealBId, name: "shared-filename.pdf", type: "OTHER", version: 1 },
      });
      const emailInA = await prisma.document.create({
        data: { dealId: dealAId, name: "Mail-cross.pdf", type: "OTHER", version: 1, sourceKind: "EMAIL" },
      });

      const result = await linkEmailAttachments(prisma, {
        emailDocumentId: emailInA.id,
        emailDealId: dealAId,
        emailDocumentVersion: 1,
        emailExtractedText: "Voir shared-filename.pdf en pièce jointe.",
        emailSourceDate: null,
      });

      expect(result.matched).toBe(0);
      const orphan = await prisma.evidenceSignal.findFirst({
        where: { documentId: docInB.id, kind: "ATTACHMENT_RELATION" },
      });
      expect(orphan).toBeNull();
    });

    it("IDEMPOTENCE — re-linking le même email retourne deduplicated, pas de nouvelles rows", async () => {
      const child = await prisma.document.create({
        data: { dealId: dealAId, name: "Idempotent.pdf", type: "OTHER", version: 1 },
      });
      const email = await prisma.document.create({
        data: { dealId: dealAId, name: "Mail-idem.pdf", type: "OTHER", version: 1, sourceKind: "EMAIL", sourceDate: new Date("2026-04-22T01:03:00Z") },
      });

      const first = await linkEmailAttachments(prisma, {
        emailDocumentId: email.id,
        emailDealId: dealAId,
        emailDocumentVersion: 1,
        emailExtractedText: "Voir Idempotent.pdf en pièce jointe.",
        emailSourceDate: new Date("2026-04-22T01:03:00Z"),
      });
      const second = await linkEmailAttachments(prisma, {
        emailDocumentId: email.id,
        emailDealId: dealAId,
        emailDocumentVersion: 1,
        emailExtractedText: "Voir Idempotent.pdf en pièce jointe.",
        emailSourceDate: new Date("2026-04-22T01:03:00Z"),
      });

      expect(first.persisted).toBe(1);
      expect(first.deduplicated).toBe(0);
      expect(second.persisted).toBe(0);
      expect(second.deduplicated).toBe(1);

      const sigs = await prisma.evidenceSignal.findMany({
        where: { documentId: child.id, kind: "ATTACHMENT_RELATION" },
      });
      expect(sigs).toHaveLength(1);
    });

    it("runEvidenceForDocument auto-link via wiring (sourceKind=EMAIL trigger)", async () => {
      const child = await prisma.document.create({
        data: { dealId: dealAId, name: "Wired.pdf", type: "OTHER", version: 1 },
      });
      const email = await prisma.document.create({
        data: {
          dealId: dealAId,
          name: "Wire-mail.pdf",
          type: "OTHER",
          version: 1,
          sourceKind: "EMAIL",
          sourceDate: new Date("2026-04-22T01:03:00Z"),
          processingStatus: "COMPLETED",
        },
      });
      const run = await prisma.documentExtractionRun.create({
        data: { documentId: email.id, documentVersion: 1, extractionVersion: "test", pipelineVersion: "test" },
      });

      const outcome = await runEvidenceForDocument(prisma, {
        documentId: email.id,
        extractedTextPlaintext: "Voir Wired.pdf en pièce jointe.",
        extractionRunId: run.id,
      });

      expect(outcome.status).toBe("ran");
      expect(outcome.attachmentsLinked).toBe(1);

      const sig = await prisma.evidenceSignal.findFirst({
        where: { documentId: child.id, kind: "ATTACHMENT_RELATION" },
      });
      expect(sig).toBeTruthy();
    });

    it("FILE doc → runEvidenceForDocument N'appelle PAS le linker (attachmentsLinked=0)", async () => {
      const child = await prisma.document.create({
        data: { dealId: dealAId, name: "Other.pdf", type: "OTHER", version: 1 },
      });
      const fileDoc = await prisma.document.create({
        data: {
          dealId: dealAId,
          name: "Not-an-email.pdf",
          type: "OTHER",
          version: 1,
          sourceKind: "FILE",
          processingStatus: "COMPLETED",
        },
      });
      const run = await prisma.documentExtractionRun.create({
        data: { documentId: fileDoc.id, documentVersion: 1, extractionVersion: "test", pipelineVersion: "test" },
      });

      const outcome = await runEvidenceForDocument(prisma, {
        documentId: fileDoc.id,
        extractedTextPlaintext: "Voir Other.pdf en pièce jointe (mais pas un email).",
        extractionRunId: run.id,
      });

      expect(outcome.status).toBe("ran");
      expect(outcome.attachmentsLinked).toBe(0);

      const sig = await prisma.evidenceSignal.findFirst({
        where: { documentId: child.id, kind: "ATTACHMENT_RELATION" },
      });
      expect(sig).toBeNull();
    });

    it("Codex round 13 P1 — Document.corpusParentDocumentId N'EST PAS muté (lineage immutable, signal-only)", async () => {
      const child = await prisma.document.create({
        data: { dealId: dealAId, name: "NoMutate.pdf", type: "OTHER", version: 1 },
      });
      const email = await prisma.document.create({
        data: {
          dealId: dealAId, name: "Email-no-mutate.pdf", type: "OTHER", version: 1,
          sourceKind: "EMAIL", sourceDate: new Date("2026-04-22T01:03:00Z"),
        },
      });
      const result = await linkEmailAttachments(prisma, {
        emailDocumentId: email.id,
        emailDealId: dealAId,
        emailDocumentVersion: 1,
        emailExtractedText: "Voir NoMutate.pdf en pièce jointe.",
        emailSourceDate: new Date("2026-04-22T01:03:00Z"),
      });
      expect(result.matched).toBe(1);

      // Signal IS persisted on the child.
      const sig = await prisma.evidenceSignal.findFirst({
        where: { documentId: child.id, kind: "ATTACHMENT_RELATION" },
      });
      expect(sig).toBeTruthy();

      // Document.corpusParentDocumentId stays null (Phase 5 read-path will surface the signal).
      const refreshedChild = await prisma.document.findUnique({ where: { id: child.id } });
      expect(refreshedChild?.corpusParentDocumentId).toBeNull();
      // sourceMetadata is unchanged (the trace lives in the signal itself).
      expect(refreshedChild?.sourceMetadata).toBeNull();
    });

    it("Codex round 13 P1 — corpusParentDocumentId déjà set (user manual) → ne touche pas", async () => {
      const existingParent = await prisma.document.create({
        data: { dealId: dealAId, name: "ExistingParent.pdf", type: "OTHER", version: 1 },
      });
      const child = await prisma.document.create({
        data: {
          dealId: dealAId, name: "AlreadyLinked.pdf", type: "OTHER", version: 1,
          corpusParentDocumentId: existingParent.id,
        },
      });
      const email = await prisma.document.create({
        data: {
          dealId: dealAId, name: "Email-no-touch.pdf", type: "OTHER", version: 1,
          sourceKind: "EMAIL", sourceDate: new Date("2026-04-22T01:03:00Z"),
        },
      });
      const result = await linkEmailAttachments(prisma, {
        emailDocumentId: email.id,
        emailDealId: dealAId,
        emailDocumentVersion: 1,
        emailExtractedText: "Voir AlreadyLinked.pdf en pièce jointe.",
        emailSourceDate: new Date("2026-04-22T01:03:00Z"),
      });
      expect(result.matched).toBe(1);

      const refreshedChild = await prisma.document.findUnique({ where: { id: child.id } });
      expect(refreshedChild?.corpusParentDocumentId).toBe(existingParent.id);
    });

    it("Codex round 12 P1 — old version (isLatest=false) NE peut PAS être matchée", async () => {
      // Setup: same filename, two versions. The old one has isLatest=false.
      const oldChild = await prisma.document.create({
        data: {
          dealId: dealAId, name: "Versioned.pdf", type: "OTHER", version: 1,
          isLatest: false,
        },
      });
      const newChild = await prisma.document.create({
        data: {
          dealId: dealAId, name: "Versioned.pdf", type: "OTHER", version: 2,
          isLatest: true,
        },
      });
      const email = await prisma.document.create({
        data: {
          dealId: dealAId, name: "Email-versioned.pdf", type: "OTHER", version: 1,
          sourceKind: "EMAIL", sourceDate: new Date("2026-04-22T01:03:00Z"),
        },
      });
      const result = await linkEmailAttachments(prisma, {
        emailDocumentId: email.id,
        emailDealId: dealAId,
        emailDocumentVersion: 1,
        emailExtractedText: "Voir Versioned.pdf en pièce jointe.",
        emailSourceDate: new Date("2026-04-22T01:03:00Z"),
      });
      expect(result.matched).toBe(1);

      // Signal goes on the LATEST version, not the old one.
      const sigOnNew = await prisma.evidenceSignal.findFirst({
        where: { documentId: newChild.id, kind: "ATTACHMENT_RELATION" },
      });
      const sigOnOld = await prisma.evidenceSignal.findFirst({
        where: { documentId: oldChild.id, kind: "ATTACHMENT_RELATION" },
      });
      expect(sigOnNew).toBeTruthy();
      expect(sigOnOld).toBeNull();
    });

    it("Codex round 12 P1 — FAILED doc NE peut PAS être matché", async () => {
      const failedChild = await prisma.document.create({
        data: {
          dealId: dealAId, name: "FailedDoc.pdf", type: "OTHER", version: 1,
          processingStatus: "FAILED",
        },
      });
      const email = await prisma.document.create({
        data: {
          dealId: dealAId, name: "Email-failed.pdf", type: "OTHER", version: 1,
          sourceKind: "EMAIL",
        },
      });
      const result = await linkEmailAttachments(prisma, {
        emailDocumentId: email.id,
        emailDealId: dealAId,
        emailDocumentVersion: 1,
        emailExtractedText: "Voir FailedDoc.pdf en pièce jointe.",
        emailSourceDate: null,
      });
      expect(result.matched).toBe(0);

      const sig = await prisma.evidenceSignal.findFirst({
        where: { documentId: failedChild.id, kind: "ATTACHMENT_RELATION" },
      });
      expect(sig).toBeNull();
    });
  });
}
