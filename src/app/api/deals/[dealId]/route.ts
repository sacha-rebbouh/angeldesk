import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { isValidCuid } from "@/lib/sanitize";
import { handleApiError } from "@/lib/api-error";
import {
  loadCanonicalDealSignals,
  resolveCanonicalDealFields,
} from "@/services/deals/canonical-read-model";
import {
  buildDealUpdateData,
  buildManualFactOverrides,
  persistManualFactOverrides,
  updateDealSchema,
} from "@/services/deals/manual-fact-overrides";
import { refreshCurrentFactsView } from "@/services/fact-store/current-facts";
import { deleteFile } from "@/services/storage";
import { cleanupDealRelations } from "@/lib/deal-cleanup";

type RouteContext = {
  params: Promise<{ dealId: string }>;
};

// Project the document list so we never ship raw `storageUrl` to the client.
// The legitimate consumers (preview, download, audit) all hit dedicated
// API routes that read the URL server-side; the client only needs to know
// whether a document is preview-able (i.e. has a backing blob).
function maskDocumentStorage<T extends { storageUrl?: string | null; storagePath?: string | null }>(
  documents: T[] | undefined
): unknown[] {
  if (!documents) return [];
  return documents.map((doc) => {
    // Strip BOTH storageUrl and storagePath. We keep the semantics aligned
    // with the delete cascades (which use `storageUrl ?? storagePath`) so
    // there is exactly one truth for "does this document have a backing
    // blob?": either coordinate suffices.
    const { storageUrl, storagePath, ...rest } = doc;
    return {
      ...rest,
      hasStorage: Boolean(storageUrl ?? storagePath),
    };
  });
}

function normalizeDealDetail(deal: {
  id: string;
  companyName: string | null;
  website: string | null;
  amountRequested: unknown;
  arr: unknown;
  growthRate: unknown;
  valuationPre: unknown;
  sector: string | null;
  stage: string | null;
  instrument: string | null;
  geography: string | null;
  description: string | null;
  documents?: Array<{ storageUrl?: string | null } & Record<string, unknown>>;
}) {
  return loadCanonicalDealSignals([deal.id]).then((signals) => ({
    ...deal,
    documents: maskDocumentStorage(deal.documents),
    ...resolveCanonicalDealFields(deal.id, signals, {
      companyName: deal.companyName,
      website: deal.website,
      amountRequested:
        deal.amountRequested != null ? Number(deal.amountRequested) : null,
      arr: deal.arr != null ? Number(deal.arr) : null,
      growthRate: deal.growthRate != null ? Number(deal.growthRate) : null,
      valuationPre: deal.valuationPre != null ? Number(deal.valuationPre) : null,
      sector: deal.sector,
      stage: deal.stage,
      instrument: deal.instrument,
      geography: deal.geography,
      description: deal.description,
    }),
  }));
}

// GET /api/deals/[dealId] - Get a specific deal
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    // Validate dealId format (CUID)
    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    const deal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
      // P5 dé-scorisation : ne pas charger les colonnes de note (drop = P5-c)
      omit: {
        globalScore: true,
        fundamentalsScore: true,
        teamScore: true,
        marketScore: true,
        productScore: true,
        financialsScore: true,
        conditionsScore: true,
      },
      include: {
        founders: {
          select: {
            id: true,
            name: true,
            role: true,
            linkedinUrl: true,
            previousVentures: true,
            verifiedInfo: true,
            createdAt: true,
          },
        },
        documents: {
          select: {
            id: true,
            name: true,
            type: true,
            customType: true,
            comments: true,
            storageUrl: true,
            storagePath: true,
            mimeType: true,
            sizeBytes: true,
            processingStatus: true,
            extractionQuality: true,
            requiresOCR: true,
            ocrProcessed: true,
          },
        },
        redFlags: {
          orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
        },
        analyses: {
          select: {
            id: true,
            type: true,
            mode: true,
            status: true,
            completedAgents: true,
            totalAgents: true,
            summary: true,
            totalCost: true,
            createdAt: true,
            completedAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    return NextResponse.json({ data: await normalizeDealDetail(deal) });
  } catch (error) {
    return handleApiError(error, "fetch deal");
  }
}

// PATCH /api/deals/[dealId] - Update a deal
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    // Validate dealId format (CUID)
    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const presentKeys = new Set(Object.keys(body));

    // Verify ownership
    const existingDeal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!existingDeal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const validatedData = updateDealSchema.parse(body);
    const manualFactOverrides = buildManualFactOverrides(validatedData, presentKeys);

    const deal = await prisma.$transaction(async (tx) => {
      const updatedDeal = await tx.deal.update({
        where: { id: dealId },
        data: buildDealUpdateData(validatedData, presentKeys),
        include: {
          founders: {
            select: {
              id: true,
              name: true,
              role: true,
              linkedinUrl: true,
              previousVentures: true,
              verifiedInfo: true,
              createdAt: true,
            },
          },
          documents: {
            select: {
              id: true,
              name: true,
              type: true,
              customType: true,
              comments: true,
              storageUrl: true,
              mimeType: true,
              sizeBytes: true,
              processingStatus: true,
              extractionQuality: true,
              requiresOCR: true,
              ocrProcessed: true,
            },
          },
          redFlags: true,
          analyses: {
            select: {
              id: true,
              type: true,
              mode: true,
              status: true,
              completedAgents: true,
              totalAgents: true,
              summary: true,
              totalCost: true,
              createdAt: true,
              completedAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      await persistManualFactOverrides(tx, dealId, manualFactOverrides);

      return updatedDeal;
    });

    if (manualFactOverrides.length > 0) {
      await refreshCurrentFactsView();
    }

    return NextResponse.json({ data: await normalizeDealDetail(deal) });
  } catch (error) {
    return handleApiError(error, "update deal");
  }
}

// DELETE /api/deals/[dealId] - Delete a deal
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { dealId } = await context.params;

    // Validate dealId format (CUID)
    if (!isValidCuid(dealId)) {
      return NextResponse.json(
        { error: "Invalid deal ID format" },
        { status: 400 }
      );
    }

    // Verify ownership
    const existingDeal = await prisma.deal.findFirst({
      where: {
        id: dealId,
        userId: user.id,
      },
    });

    if (!existingDeal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Cascade-delete the underlying Blob storage for every Document on this
    // deal BEFORE we drop the rows. Once `prisma.deal.delete` cascades the
    // Document rows, we lose the storageUrl/storagePath that points to the
    // physical blob and the file becomes orphaned in Vercel Blob storage
    // (= paid-for storage with no DB pointer). We tolerate per-blob delete
    // failures (already-deleted, transient network) so a single missing
    // blob does not block the DB cleanup.
    const documents = await prisma.document.findMany({
      where: { dealId },
      select: { id: true, storageUrl: true, storagePath: true },
    });
    const blobDeletionErrors: Array<{ documentId: string; error: string }> = [];
    for (const document of documents) {
      const target = document.storageUrl ?? document.storagePath;
      if (!target) continue;
      try {
        await deleteFile(target);
      } catch (blobError) {
        blobDeletionErrors.push({
          documentId: document.id,
          error: blobError instanceof Error ? blobError.message : String(blobError),
        });
      }
    }
    if (blobDeletionErrors.length > 0) {
      console.warn(
        `[deal:delete] ${blobDeletionErrors.length} blob(s) failed to delete for deal ${dealId} — proceeding with DB cascade anyway`,
        blobDeletionErrors
      );
    }

    // Cleanup transactionnel des lignes orphelines (dealId scalaire SANS
    // cascade vers Deal — fuite RGPD sinon). Helper partagé avec la suppression
    // compte (source unique de vérité). Le deal en dernier déclenche les
    // cascades DB des relations FK (Document, Analysis, Thesis, etc.).
    await prisma.$transaction(
      async (tx) => {
        await cleanupDealRelations(tx, [dealId]);
        await tx.deal.delete({ where: { id: dealId } });
      },
      { timeout: 20_000 }
    );

    return NextResponse.json({
      message: "Deal deleted successfully",
      blobDeletionFailures: blobDeletionErrors.length,
    });
  } catch (error) {
    return handleApiError(error, "delete deal");
  }
}
