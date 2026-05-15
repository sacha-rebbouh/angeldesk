import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { type ProcessingStatus } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import {
  startDocumentExtractionRun,
  terminalizeExtractionRunAsFailed,
} from "@/services/documents/extraction-runs";
import { getRunningAnalysisForDeal } from "@/services/analysis/guards";
import { deductCreditAmount, refundCreditAmount } from "@/services/credits";
import { inngest } from "@/lib/inngest";

// CUID validation schema
const cuidSchema = z.string().cuid();

// Phase 4 (durable extraction): this route no longer runs smartExtract
// inline. It claims PROCESSING, deducts credits, creates an extraction
// run, and enqueues an Inngest event. The `document-extraction` function
// owns the actual extraction work, retries, and refund-on-failure.
//
// We keep `maxDuration` modest because the HTTP work is now bounded —
// only DB writes + one Inngest send. The decorative 300s of the old
// inline path is gone.
export const maxDuration = 30;

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

// POST /api/documents/[documentId]/process - Reprocess a document
export async function POST(_request: NextRequest, { params }: RouteParams) {
  let claimedDocumentId: string | null = null;
  let claimedOriginalStatus: ProcessingStatus | null = null;
  let chargedCredits = 0;
  let refundContext: { userId: string; dealId: string; documentId: string; requestId: string } | null = null;
  // Phase 4.1 fix-up (P1.3): if `startDocumentExtractionRun` succeeds but
  // `inngest.send` then throws, the run row would be left orphaned in
  // PROCESSING with no consumer. Track its id so the catch can terminalize
  // it — otherwise readiness/polling/audit see a run stuck forever.
  let orphanRunId: string | null = null;
  try {
    const user = await requireAuth();
    const { documentId } = await params;

    // Validate CUID format
    const cuidResult = cuidSchema.safeParse(documentId);
    if (!cuidResult.success) {
      return NextResponse.json({ error: "Invalid document ID format" }, { status: 400 });
    }

    // Find document and verify ownership through deal
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        deal: {
          select: { userId: true },
        },
        extractionRuns: {
          orderBy: { completedAt: "desc" },
          take: 1,
          select: { summaryMetrics: true },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    if (document.deal.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const runningAnalysis = await getRunningAnalysisForDeal(document.dealId);
    if (runningAnalysis) {
      return NextResponse.json(
        {
          error: "Une analyse est en cours sur ce deal. Finalisez-la avant de relancer l'extraction du document.",
          analysisId: runningAnalysis.id,
        },
        { status: 409 }
      );
    }

    // Only process PDFs (durable pipeline supports PDF for now; images and
    // Office docs follow in Phase 4.2/4.3).
    if (document.mimeType !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF documents can be processed" },
        { status: 400 }
      );
    }

    // The schema allows `storagePath` without `storageUrl` (local dev /
    // legacy rows). Mirror download/delete which accept either coordinate.
    const storageTarget = document.storageUrl ?? document.storagePath;
    if (!storageTarget) {
      return NextResponse.json(
        { error: "Document has no storage reference" },
        { status: 400 }
      );
    }

    // Atomic PROCESSING claim (race-condition guard for concurrent reprocess).
    const processingClaim = await prisma.document.updateMany({
      where: {
        id: documentId,
        processingStatus: { not: "PROCESSING" },
      },
      data: { processingStatus: "PROCESSING" },
    });

    if (processingClaim.count === 0) {
      const latestStatus = await prisma.document.findUnique({
        where: { id: documentId },
        select: { processingStatus: true },
      });
      return NextResponse.json(
        { error: `Document cannot be reprocessed from status "${latestStatus?.processingStatus ?? document.processingStatus}".` },
        { status: 409 }
      );
    }

    claimedDocumentId = documentId;
    claimedOriginalStatus = document.processingStatus;

    const reprocessRequestId = randomUUID();
    const estimatedCredits = extractEstimatedCredits(document.extractionRuns[0]?.summaryMetrics);
    if (estimatedCredits > 0) {
      refundContext = {
        userId: user.id,
        dealId: document.dealId,
        documentId,
        requestId: reprocessRequestId,
      };
      const deduction = await deductCreditAmount(user.id, "EXTRACTION_HIGH_PAGE", estimatedCredits, {
        dealId: document.dealId,
        documentId,
        idempotencyKey: `extraction:reprocess:${documentId}:${reprocessRequestId}`,
        description: `Enhanced document re-extraction for ${document.name}`,
      });
      if (!deduction.success) {
        await prisma.document.updateMany({
          where: { id: documentId, processingStatus: "PROCESSING" },
          data: { processingStatus: document.processingStatus },
        }).catch(() => undefined);
        return NextResponse.json(
          { error: deduction.error ?? "Credits insuffisants pour relancer l'extraction", requiredCredits: estimatedCredits },
          { status: 402 }
        );
      }
      chargedCredits = estimatedCredits;
    }

    const progressRun = await startDocumentExtractionRun({
      documentId,
      documentVersion: document.version,
      contentHash: document.contentHash,
      extractionVersion: "strict-pdf-v1",
    });
    orphanRunId = progressRun.id;

    // Enqueue the durable extraction. The event id is keyed by the
    // extractionRunId so Inngest dedupes a retry of THIS HTTP request to a
    // single function run — no double-charge, no double-extraction.
    await inngest.send({
      id: `document-extraction:${progressRun.id}`,
      name: "document/extraction.run",
      data: {
        documentId,
        extractionRunId: progressRun.id,
        userId: user.id,
        dealId: document.dealId,
        reason: "reprocess",
        creditAction: "EXTRACTION_HIGH_PAGE",
        chargedCredits,
        dispatchRefundKey: `extraction:refund:reprocess:${reprocessRequestId}`,
      },
    });
    // The event landed — the Inngest function now owns the run's lifecycle
    // (it will terminalize it on success or failure). It is no longer an
    // orphan from this route's perspective.
    orphanRunId = null;

    return NextResponse.json(
      {
        data: {
          documentId,
          extractionRunId: progressRun.id,
          processingStatus: "PROCESSING",
        },
        creditsCharged: chargedCredits,
        message: "Extraction enqueued. Poll the document status for completion.",
      },
      { status: 202 }
    );
  } catch (error) {
    // The error happened BEFORE the Inngest event landed (or while sending
    // it). Refund and revert PROCESSING so the user is not stuck.
    if (refundContext && chargedCredits > 0) {
      try {
        const refund = await refundCreditAmount(
          refundContext.userId,
          "EXTRACTION_HIGH_PAGE",
          chargedCredits,
          {
            dealId: refundContext.dealId,
            documentId: refundContext.documentId,
            idempotencyKey: `extraction:refund:reprocess:${refundContext.requestId}`,
            description: `Refund failed pre-enqueue reprocess for ${refundContext.documentId}`,
          }
        );
        if (!refund?.success) {
          console.error("[process] catch-block refund returned non-success — user remains debited", {
            userId: refundContext.userId,
            documentId: refundContext.documentId,
            amount: chargedCredits,
            error: refund?.error,
          });
        }
      } catch (refundError) {
        console.error("[process] catch-block refund threw — user remains debited", {
          userId: refundContext.userId,
          documentId: refundContext.documentId,
          amount: chargedCredits,
          error: refundError instanceof Error ? refundError.message : String(refundError),
        });
      }
    }
    if (claimedDocumentId && claimedOriginalStatus) {
      await prisma.document.updateMany({
        where: { id: claimedDocumentId, processingStatus: "PROCESSING" },
        data: { processingStatus: claimedOriginalStatus },
      }).catch(() => undefined);
    }
    // P1.3: terminalize the orphan run. `startDocumentExtractionRun`
    // created it PROCESSING; if we never got the Inngest event out, no
    // consumer will ever move it to a terminal state.
    if (orphanRunId) {
      await terminalizeExtractionRunAsFailed(
        orphanRunId,
        `Pre-enqueue failure in /process: ${error instanceof Error ? error.message : String(error)}`
      ).catch(() => undefined);
    }
    return handleApiError(error, "process document");
  }
}

function extractEstimatedCredits(summaryMetrics: unknown): number {
  if (!summaryMetrics || typeof summaryMetrics !== "object" || Array.isArray(summaryMetrics)) return 0;
  const creditEstimate = (summaryMetrics as { creditEstimate?: { estimatedCredits?: unknown } }).creditEstimate;
  const value = creditEstimate?.estimatedCredits;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.ceil(value)) : 0;
}
