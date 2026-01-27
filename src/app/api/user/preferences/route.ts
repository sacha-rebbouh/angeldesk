import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { BAPreferences } from "@/services/benchmarks";
import { DEFAULT_BA_PREFERENCES } from "@/services/benchmarks";

/**
 * GET /api/user/preferences
 * Récupère les préférences d'investissement de l'utilisateur
 */
export async function GET() {
  try {
    const user = await requireAuth();

    const preferences = user.investmentPreferences as Partial<BAPreferences> | null;

    return NextResponse.json({
      preferences: {
        ...DEFAULT_BA_PREFERENCES,
        ...preferences,
      },
    });
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/user/preferences
 * Met à jour les préférences d'investissement de l'utilisateur
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    // Valider les préférences
    const preferences: Partial<BAPreferences> = {};

    // Investment profile
    if (typeof body.typicalTicketPercent === "number") {
      preferences.typicalTicketPercent = Math.max(0.01, Math.min(1, body.typicalTicketPercent));
    }
    if (typeof body.maxTicketAmount === "number") {
      preferences.maxTicketAmount = Math.max(1000, Math.min(10000000, body.maxTicketAmount));
    }
    if (typeof body.minTicketAmount === "number") {
      preferences.minTicketAmount = Math.max(100, Math.min(1000000, body.minTicketAmount));
    }

    // Sectors
    if (Array.isArray(body.preferredSectors)) {
      preferences.preferredSectors = body.preferredSectors.filter(
        (s: unknown) => typeof s === "string"
      );
    }
    if (Array.isArray(body.excludedSectors)) {
      preferences.excludedSectors = body.excludedSectors.filter(
        (s: unknown) => typeof s === "string"
      );
    }

    // Stages
    if (Array.isArray(body.preferredStages)) {
      preferences.preferredStages = body.preferredStages.filter(
        (s: unknown) => typeof s === "string"
      );
    }

    // Geography
    if (Array.isArray(body.preferredGeographies)) {
      preferences.preferredGeographies = body.preferredGeographies.filter(
        (s: unknown) => typeof s === "string"
      );
    }

    // Risk tolerance
    if (typeof body.riskTolerance === "number") {
      preferences.riskTolerance = Math.max(1, Math.min(5, Math.round(body.riskTolerance)));
    }

    // Holding period
    if (typeof body.expectedHoldingPeriod === "number") {
      preferences.expectedHoldingPeriod = Math.max(1, Math.min(20, body.expectedHoldingPeriod));
    }

    // Merge avec les préférences existantes
    const existingPreferences = user.investmentPreferences as Partial<BAPreferences> | null;
    const updatedPreferences = {
      ...existingPreferences,
      ...preferences,
    };

    // Sauvegarder en DB
    await prisma.user.update({
      where: { id: user.id },
      data: {
        investmentPreferences: updatedPreferences,
      },
    });

    return NextResponse.json({
      success: true,
      preferences: {
        ...DEFAULT_BA_PREFERENCES,
        ...updatedPreferences,
      },
    });
  } catch (error) {
    console.error("Error updating preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
