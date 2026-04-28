/**
 * POST /api/documents/text — ingestion of text-only corpus pieces (emails, notes).
 *
 * The binary upload pipeline (/api/documents/upload) is reserved for files
 * that need OCR/credits. This route is JSON-only, gratuit, and synchronous —
 * no progress polling, no shadow run.
 *
 * Mirrors the security envelope of the upload route:
 *   - requireAuth + deal ownership.
 *   - Distributed rate limit (30/min — text payloads are lighter than uploads).
 *   - getRunningAnalysisForDeal guard (409 while an analysis is in flight).
 *   - Anti-IDOR: when linkedQuestion.redFlagId is provided, the RedFlag MUST
 *     belong to the same deal AND the same user. Verified server-side here
 *     so the ingestion service can trust its inputs.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { checkRateLimitDistributed } from "@/lib/sanitize";
import { getRunningAnalysisForDeal, isPendingThesisReview } from "@/services/analysis/guards";
import {
  ingestTextCorpusItem,
  textIngestionInputSchema,
} from "@/services/documents/text-ingestion";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Rate limit: 30 ingestions/min per user. More generous than the file
    // upload route (10/min) because text payloads are cheap.
    const rateLimit = await checkRateLimitDistributed(`text-ingest:${user.id}`, {
      maxRequests: 30,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        { status: 429, headers: { "Retry-After": String(rateLimit.resetIn) } }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = textIngestionInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Verify deal ownership.
    const deal = await prisma.deal.findFirst({
      where: { id: input.dealId, userId: user.id },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Block while an analysis is running on the deal — corpus mutations would
    // race the analyzer's snapshot.
    const runningAnalysis = await getRunningAnalysisForDeal(input.dealId);
    if (runningAnalysis) {
      return NextResponse.json(
        {
          error: isPendingThesisReview(runningAnalysis)
            ? "Une revue de thèse est en attente. Finalisez-la avant d'ajouter une pièce au corpus."
            : "Une analyse est déjà en cours sur ce deal. Attendez sa fin avant de modifier le corpus documentaire.",
          pendingAnalysisId: runningAnalysis.id,
          pendingThesisId: runningAnalysis.thesisId,
        },
        { status: 409 }
      );
    }

    // Anti-IDOR: a linked RedFlag must belong to this deal AND this user.
    // Check before calling the service — keeps the service side trust-free.
    if (input.linkedQuestion?.redFlagId) {
      const redFlag = await prisma.redFlag.findFirst({
        where: {
          id: input.linkedQuestion.redFlagId,
          dealId: input.dealId,
          deal: { userId: user.id },
        },
        select: { id: true },
      });
      if (!redFlag) {
        return NextResponse.json(
          { error: "Linked red flag not found on this deal" },
          { status: 404 }
        );
      }
    }

    const result = await ingestTextCorpusItem(input, { userId: user.id });

    if (result.kind === "duplicate") {
      return NextResponse.json(
        {
          error: "Pièce identique déjà au corpus",
          existingDocument: {
            id: result.existingDocumentId,
            name: result.existingDocumentName,
            sameDeal: result.sameDeal,
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        data: {
          id: result.document.id,
          dealId: result.document.dealId,
          name: result.document.name,
          type: result.document.type,
          mimeType: result.document.mimeType,
          processingStatus: result.document.processingStatus,
          extractionQuality: result.document.extractionQuality,
          sourceKind: result.document.sourceKind,
          corpusRole: result.document.corpusRole,
          sourceDate: result.document.sourceDate?.toISOString() ?? null,
          receivedAt: result.document.receivedAt?.toISOString() ?? null,
          sourceAuthor: result.document.sourceAuthor,
          sourceSubject: result.document.sourceSubject,
          linkedQuestionSource: result.document.linkedQuestionSource,
          linkedQuestionText: result.document.linkedQuestionText,
          linkedRedFlagId: result.document.linkedRedFlagId,
          uploadedAt: result.document.uploadedAt.toISOString(),
          extractionRunId: result.extractionRunId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "ingest text corpus item");
  }
}
