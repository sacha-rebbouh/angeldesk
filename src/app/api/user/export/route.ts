/**
 * GET /api/user/export
 *
 * RGPD Art. 20 — Data portability.
 * Returns a JSON file containing all user data in a structured, machine-readable format.
 *
 * Includes: profile, deals (with founders, documents metadata, red flags, analyses metadata),
 * credit balance & transactions, API keys (masked).
 *
 * Excludes (for size/security): analysis results blobs, document extractedText/ocrText,
 * full API key values, document file contents.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-error";
import { loadResults } from "@/services/analysis-results/load-results";
import { extractAnalysisScores } from "@/services/analysis-results/score-extraction";
import { getCurrentFactsFromView } from "@/services/fact-store/current-facts";
import type { CurrentFact } from "@/services/fact-store/types";
import { pickCanonicalAnalysis } from "@/services/deals/canonical-read-model";

function buildCurrentFactMap(currentFacts: CurrentFact[]): Map<string, CurrentFact> {
  return new Map(currentFacts.map((fact) => [fact.factKey, fact]));
}

function getCurrentFactString(
  factMap: Map<string, CurrentFact>,
  factKey: string
): string | null {
  const fact = factMap.get(factKey);
  if (!fact) return null;
  if (typeof fact.currentValue === "string") return fact.currentValue;
  if (typeof fact.currentDisplayValue === "string" && fact.currentDisplayValue.length > 0) {
    return fact.currentDisplayValue;
  }
  return null;
}

function getCurrentFactNumber(
  factMap: Map<string, CurrentFact>,
  factKey: string
): number | null {
  const fact = factMap.get(factKey);
  if (!fact) return null;
  if (typeof fact.currentValue === "number" && Number.isFinite(fact.currentValue)) {
    return fact.currentValue;
  }
  if (typeof fact.currentValue === "string") {
    const parsed = Number(fact.currentValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function GET() {
  try {
    const user = await requireAuth();
    const userId = user.id;

    // Parallel queries for independent data
    const [userProfile, deals, creditBalance, creditTransactions, apiKeys, latestTheses] =
      await Promise.all([
        // 1. User profile
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            subscriptionStatus: true,
            investmentPreferences: true,
            createdAt: true,
            updatedAt: true,
          },
        }),

        // 2. All deals with related data
        prisma.deal.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            companyName: true,
            website: true,
            description: true,
            sector: true,
            stage: true,
            instrument: true,
            geography: true,
            arr: true,
            growthRate: true,
            amountRequested: true,
            valuationPre: true,
            status: true,
            globalScore: true,
            fundamentalsScore: true,
            conditionsScore: true,
            teamScore: true,
            marketScore: true,
            productScore: true,
            financialsScore: true,
            createdAt: true,
            updatedAt: true,
            // Founders
            founders: {
              select: {
                id: true,
                name: true,
                role: true,
                linkedinUrl: true,
                createdAt: true,
              },
            },
            // Documents — metadata only (no extractedText, no file content)
            documents: {
              select: {
                id: true,
                name: true,
                type: true,
                customType: true,
                comments: true,
                mimeType: true,
                sizeBytes: true,
                processingStatus: true,
                version: true,
                isLatest: true,
                uploadedAt: true,
              },
            },
            // Red flags
            redFlags: {
              select: {
                id: true,
                category: true,
                title: true,
                description: true,
                severity: true,
                confidenceScore: true,
                evidence: true,
                questionsToAsk: true,
                status: true,
                detectedAt: true,
              },
            },
            // Analyses — metadata only (no results blob)
            analyses: {
              select: {
                id: true,
                type: true,
                mode: true,
                status: true,
                thesisId: true,
                thesisBypass: true,
                corpusSnapshotId: true,
                totalAgents: true,
                completedAgents: true,
                summary: true,
                startedAt: true,
                completedAt: true,
                totalCost: true,
                totalTimeMs: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
        }),

        // 3. Credit balance
        prisma.userCreditBalance.findUnique({
          where: { userId },
          select: {
            balance: true,
            totalPurchased: true,
            lastPackName: true,
            freeCreditsGranted: true,
            autoRefill: true,
            autoRefillPackName: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),

        // 4. Credit transactions
        prisma.creditTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amount: true,
            balanceAfter: true,
            action: true,
            description: true,
            dealId: true,
            packName: true,
            createdAt: true,
            // Excludes stripePaymentId for security
          },
        }),

        // 5. API keys — masked (only prefix visible, no hash)
        prisma.apiKey.findMany({
          where: { userId },
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            lastUsedAt: true,
            expiresAt: true,
            revokedAt: true,
            createdAt: true,
          },
        }),

        prisma.thesis.findMany({
          where: {
            deal: { userId },
            isLatest: true,
          },
          select: {
            id: true,
            dealId: true,
            corpusSnapshotId: true,
          },
        }),
      ]);

    const latestThesisByDealId = new Map(
      latestTheses.map((thesis) => [thesis.dealId, thesis])
    );

    const analysisIds = deals.flatMap((deal) =>
      deal.analyses
        .filter((analysis) => analysis.completedAt != null)
        .map((analysis) => analysis.id)
    );

    const [resultsEntries, currentFactsEntries] = await Promise.all([
      Promise.all(
        analysisIds.map(async (analysisId) => [
          analysisId,
          await loadResults(analysisId),
        ] as const)
      ),
      Promise.all(
        deals.map(async (deal) => [
          deal.id,
          await getCurrentFactsFromView(deal.id),
        ] as const)
      ),
    ]);

    const resultsByAnalysisId = new Map(resultsEntries);
    const currentFactsByDealId = new Map(currentFactsEntries);

    const serializedDeals = deals.map((deal) => {
      const latestThesis = latestThesisByDealId.get(deal.id) ?? null;
      const canonicalAnalysis = pickCanonicalAnalysis(
        latestThesis,
        deal.analyses.map((analysis) => ({
          ...analysis,
          dealId: deal.id,
        }))
      );
      const canonicalScores = canonicalAnalysis
        ? extractAnalysisScores(resultsByAnalysisId.get(canonicalAnalysis.id))
        : null;
      const factMap = buildCurrentFactMap(currentFactsByDealId.get(deal.id) ?? []);

      return {
        ...deal,
        companyName: getCurrentFactString(factMap, "company.name") ?? deal.companyName,
        website: getCurrentFactString(factMap, "other.website") ?? deal.website,
        arr:
          getCurrentFactNumber(factMap, "financial.arr") ??
          (deal.arr != null ? Number(deal.arr) : null),
        growthRate:
          getCurrentFactNumber(factMap, "financial.revenue_growth_yoy") ??
          (deal.growthRate != null ? Number(deal.growthRate) : null),
        amountRequested:
          getCurrentFactNumber(factMap, "financial.amount_raising") ??
          (deal.amountRequested != null ? Number(deal.amountRequested) : null),
        valuationPre:
          getCurrentFactNumber(factMap, "financial.valuation_pre") ??
          (deal.valuationPre != null ? Number(deal.valuationPre) : null),
        globalScore: canonicalScores?.globalScore ?? deal.globalScore,
        teamScore: canonicalScores?.teamScore ?? deal.teamScore,
        marketScore: canonicalScores?.marketScore ?? deal.marketScore,
        productScore: canonicalScores?.productScore ?? deal.productScore,
        financialsScore:
          canonicalScores?.financialsScore ?? deal.financialsScore,
        canonicalAnalysisId: canonicalAnalysis?.id ?? null,
        canonicalThesisId: latestThesis?.id ?? null,
        redFlags: deal.redFlags.map((rf) => ({
          ...rf,
          confidenceScore:
            rf.confidenceScore != null ? Number(rf.confidenceScore) : null,
        })),
        analyses: deal.analyses.map((analysis) => ({
          ...analysis,
          totalCost: analysis.totalCost != null ? Number(analysis.totalCost) : null,
          scores:
            analysis.completedAt != null
              ? extractAnalysisScores(resultsByAnalysisId.get(analysis.id))
              : null,
        })),
      };
    });

    const maskedApiKeys = apiKeys.map((key) => ({
      ...key,
      keyPrefix: key.keyPrefix ? `${key.keyPrefix}...` : null,
    }));

    const exportData = {
      _meta: {
        exportedAt: new Date().toISOString(),
        format: "AngelDesk RGPD Art. 20 Export",
        version: "1.1",
        userId,
      },
      profile: userProfile,
      deals: serializedDeals,
      credits: {
        balance: creditBalance,
        transactions: creditTransactions,
      },
      apiKeys: maskedApiKeys,
    };

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `angeldesk-export-${userId}-${dateStr}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Auth failure from requireAuth throws "Unauthorized"
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(error, "export user data");
  }
}
