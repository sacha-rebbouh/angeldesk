import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { isValidCuid } from "@/lib/sanitize";
import {
  backfillCorpusSnapshots,
  listCorpusBackfillCandidates,
} from "@/services/corpus/backfill";

const backfillSchema = z.object({
  dealId: z.string().optional(),
  dealIds: z.array(z.string()).optional(),
  dryRun: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(1000).optional().default(100),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const searchParams = request.nextUrl.searchParams;
    const dealId = searchParams.get("dealId");
    const take = Number(searchParams.get("take") ?? "200");

    if (dealId && !isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    const candidates = await listCorpusBackfillCandidates({
      ...(dealId ? { dealId } : {}),
      take: Number.isFinite(take) ? take : 200,
    });

    const totals = candidates.reduce(
      (acc, candidate) => {
        acc.missingAnalyses += candidate.missingAnalyses;
        acc.missingTheses += candidate.missingTheses;
        acc.eligibleCount += candidate.eligible ? 1 : 0;
        acc.missingDocumentsCount += candidate.processedDocumentCount === 0 ? 1 : 0;
        return acc;
      },
      { missingAnalyses: 0, missingTheses: 0, eligibleCount: 0, missingDocumentsCount: 0 }
    );

    return NextResponse.json({
      data: {
        admin: { id: admin.id },
        candidates,
        totalDeals: candidates.length,
        total: candidates.length,
        existingSnapshotCount: 0,
        ...totals,
      },
    });
  } catch (error) {
    return handleApiError(error, "list corpus backfill candidates");
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = backfillSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { dealId, dealIds, dryRun, limit } = parsed.data;

    if (dealId && !isValidCuid(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }
    if (dealIds?.some((id) => !isValidCuid(id))) {
      return NextResponse.json({ error: "Invalid deal ID format" }, { status: 400 });
    }

    const targetDealIds = dealIds?.length
      ? [...new Set(dealIds)]
      : dealId
        ? [dealId]
        : [];

    if (targetDealIds.length > 0) {
      const batchResults = [];
      for (const targetDealId of targetDealIds) {
        batchResults.push(await backfillCorpusSnapshots({
          dealId: targetDealId,
          dryRun,
          limit,
        }));
      }

      const aggregated = batchResults.reduce(
        (acc, current) => {
          acc.scannedAnalyses += current.scannedAnalyses;
          acc.scannedTheses += current.scannedTheses;
          acc.updatedAnalyses += current.updatedAnalyses;
          acc.updatedTheses += current.updatedTheses;
          acc.skippedAnalyses += current.skippedAnalyses;
          acc.skippedTheses += current.skippedTheses;
          acc.results.push(...current.results);
          return acc;
        },
        {
          dryRun,
          scannedAnalyses: 0,
          scannedTheses: 0,
          updatedAnalyses: 0,
          updatedTheses: 0,
          skippedAnalyses: 0,
          skippedTheses: 0,
          results: [] as Awaited<ReturnType<typeof backfillCorpusSnapshots>>["results"],
        }
      );

      return NextResponse.json({
        data: {
          admin: { id: admin.id },
          ...aggregated,
          processedCount: targetDealIds.length,
          targetedDealIds: targetDealIds,
        },
      });
    }

    const result = await backfillCorpusSnapshots({
      dryRun,
      limit,
    });

    return NextResponse.json({
      data: {
        admin: { id: admin.id },
        ...result,
      },
    });
  } catch (error) {
    return handleApiError(error, "run corpus backfill");
  }
}
