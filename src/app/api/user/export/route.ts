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

export async function GET() {
  try {
    const user = await requireAuth();
    const userId = user.id;

    // Parallel queries for independent data
    const [userProfile, deals, creditBalance, creditTransactions, apiKeys] =
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
      ]);

    // Convert Decimal fields to numbers for JSON serialization
    const serializedDeals = deals.map((deal) => ({
      ...deal,
      arr: deal.arr != null ? Number(deal.arr) : null,
      growthRate: deal.growthRate != null ? Number(deal.growthRate) : null,
      amountRequested:
        deal.amountRequested != null ? Number(deal.amountRequested) : null,
      valuationPre:
        deal.valuationPre != null ? Number(deal.valuationPre) : null,
      redFlags: deal.redFlags.map((rf) => ({
        ...rf,
        confidenceScore:
          rf.confidenceScore != null ? Number(rf.confidenceScore) : null,
      })),
      analyses: deal.analyses.map((a) => ({
        ...a,
        totalCost: a.totalCost != null ? Number(a.totalCost) : null,
      })),
    }));

    const maskedApiKeys = apiKeys.map((key) => ({
      ...key,
      keyPrefix: key.keyPrefix ? `${key.keyPrefix}...` : null,
    }));

    const exportData = {
      _meta: {
        exportedAt: new Date().toISOString(),
        format: "AngelDesk RGPD Art. 20 Export",
        version: "1.0",
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
