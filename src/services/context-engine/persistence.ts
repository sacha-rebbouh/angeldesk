/**
 * Context Engine Persistence
 *
 * Saves and loads Context Engine snapshots to/from database.
 * This allows reusing enriched data across sessions without re-fetching.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { DealContext } from "./types";

// Default snapshot validity: 30 days
// Context Engine data (benchmarks, competitors, funding rounds) is relatively stable
// News/sentiment may be stale but that's acceptable for most BA use cases
const DEFAULT_SNAPSHOT_TTL_DAYS = 30;

/**
 * Save a Context Engine snapshot for a deal
 *
 * Overwrites any existing snapshot for the same deal.
 */
export async function saveContextSnapshot(
  dealId: string,
  context: DealContext,
  inputData?: {
    companyName?: string;
    sector?: string;
    stage?: string;
    tagline?: string;
    competitors?: string[];
  }
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DEFAULT_SNAPSHOT_TTL_DAYS);

    // Build connector results from sources
    const connectorResults: Record<string, boolean> = {};
    for (const source of context.sources || []) {
      connectorResults[source.name] = true;
    }

    // Cast to Prisma JSON type - use Prisma.JsonNull for null values
    const toJson = <T>(value: T | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
      value ? (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue) : Prisma.JsonNull;

    await prisma.contextEngineSnapshot.upsert({
      where: { dealId },
      create: {
        dealId,
        dealIntelligence: toJson(context.dealIntelligence),
        marketData: toJson(context.marketData),
        competitiveLandscape: toJson(context.competitiveLandscape),
        newsSentiment: toJson(context.newsSentiment),
        peopleGraph: toJson(context.peopleGraph),
        completeness: Math.round((context.completeness ?? 0) * 100),
        connectorResults: toJson(connectorResults),
        inputData: toJson(inputData),
        expiresAt,
      },
      update: {
        dealIntelligence: toJson(context.dealIntelligence),
        marketData: toJson(context.marketData),
        competitiveLandscape: toJson(context.competitiveLandscape),
        newsSentiment: toJson(context.newsSentiment),
        peopleGraph: toJson(context.peopleGraph),
        completeness: Math.round((context.completeness ?? 0) * 100),
        connectorResults: toJson(connectorResults),
        inputData: toJson(inputData),
        expiresAt,
        updatedAt: new Date(),
      },
    });

    console.log(
      `[ContextEngine:Persistence] Saved snapshot for deal ${dealId} ` +
        `(completeness: ${Math.round((context.completeness ?? 0) * 100)}%, expires: ${expiresAt.toISOString()})`
    );
  } catch (error) {
    console.error("[ContextEngine:Persistence] Failed to save snapshot:", error);
    // Don't throw - persistence is best-effort
  }
}

/**
 * Load a Context Engine snapshot for a deal
 *
 * Returns null if:
 * - No snapshot exists
 * - Snapshot has expired
 * - Input data has changed significantly
 */
export async function loadContextSnapshot(
  dealId: string,
  currentInputData?: {
    companyName?: string;
    sector?: string;
    stage?: string;
    tagline?: string;
  }
): Promise<DealContext | null> {
  try {
    const snapshot = await prisma.contextEngineSnapshot.findUnique({
      where: { dealId },
    });

    if (!snapshot) {
      return null;
    }

    // Check if expired
    if (snapshot.expiresAt < new Date()) {
      console.log(
        `[ContextEngine:Persistence] Snapshot expired for deal ${dealId} ` +
          `(expired: ${snapshot.expiresAt.toISOString()})`
      );
      return null;
    }

    // Check if input data has changed significantly
    if (currentInputData && snapshot.inputData) {
      const savedInput = snapshot.inputData as {
        companyName?: string;
        sector?: string;
        stage?: string;
        tagline?: string;
      };

      const hasChanged =
        (currentInputData.companyName &&
          savedInput.companyName &&
          currentInputData.companyName.toLowerCase() !== savedInput.companyName.toLowerCase()) ||
        (currentInputData.sector &&
          savedInput.sector &&
          currentInputData.sector.toLowerCase() !== savedInput.sector.toLowerCase());

      if (hasChanged) {
        console.log(
          `[ContextEngine:Persistence] Input data changed for deal ${dealId}, snapshot invalid`
        );
        return null;
      }
    }

    // Rebuild DealContext from snapshot
    // Use unknown first for safe type casting from Prisma JSON
    const context: DealContext = {
      dealIntelligence: snapshot.dealIntelligence as unknown as DealContext["dealIntelligence"],
      marketData: snapshot.marketData as unknown as DealContext["marketData"],
      competitiveLandscape: snapshot.competitiveLandscape as unknown as DealContext["competitiveLandscape"],
      newsSentiment: snapshot.newsSentiment as unknown as DealContext["newsSentiment"],
      peopleGraph: snapshot.peopleGraph as unknown as DealContext["peopleGraph"],
      enrichedAt: snapshot.updatedAt.toISOString(),
      completeness: snapshot.completeness / 100,
      sources: [], // Sources are reconstructed from connectorResults
    };

    // Rebuild sources from connectorResults
    const connectorResults = snapshot.connectorResults as Record<string, boolean> | null;
    if (connectorResults) {
      for (const [name, success] of Object.entries(connectorResults)) {
        if (success) {
          context.sources.push({
            type: "database", // Type not stored, use a valid generic type
            name,
            retrievedAt: snapshot.updatedAt.toISOString(),
            confidence: 0.85,
          });
        }
      }
    }

    console.log(
      `[ContextEngine:Persistence] Loaded snapshot for deal ${dealId} ` +
        `(completeness: ${snapshot.completeness}%, age: ${Math.round((Date.now() - snapshot.updatedAt.getTime()) / 1000 / 60)}min)`
    );

    return context;
  } catch (error) {
    console.error("[ContextEngine:Persistence] Failed to load snapshot:", error);
    return null;
  }
}

/**
 * Check if a valid snapshot exists for a deal
 */
export async function hasValidSnapshot(dealId: string): Promise<boolean> {
  try {
    const snapshot = await prisma.contextEngineSnapshot.findUnique({
      where: { dealId },
      select: { expiresAt: true },
    });

    if (!snapshot) {
      return false;
    }

    return snapshot.expiresAt >= new Date();
  } catch (error) {
    console.error("[ContextEngine:Persistence] Failed to check snapshot:", error);
    return false;
  }
}

/**
 * Delete a snapshot for a deal
 */
export async function deleteContextSnapshot(dealId: string): Promise<void> {
  try {
    await prisma.contextEngineSnapshot.delete({
      where: { dealId },
    });
    console.log(`[ContextEngine:Persistence] Deleted snapshot for deal ${dealId}`);
  } catch (error) {
    // Ignore if not found
    if ((error as { code?: string }).code !== "P2025") {
      console.error("[ContextEngine:Persistence] Failed to delete snapshot:", error);
    }
  }
}

/**
 * Get snapshot stats for a deal
 */
export async function getSnapshotStats(dealId: string): Promise<{
  exists: boolean;
  completeness: number;
  age: number; // ms
  expiresIn: number; // ms
  connectors: string[];
} | null> {
  try {
    const snapshot = await prisma.contextEngineSnapshot.findUnique({
      where: { dealId },
    });

    if (!snapshot) {
      return null;
    }

    const connectorResults = snapshot.connectorResults as Record<string, boolean> | null;
    const connectors = connectorResults
      ? Object.entries(connectorResults)
          .filter(([, success]) => success)
          .map(([name]) => name)
      : [];

    return {
      exists: true,
      completeness: snapshot.completeness,
      age: Date.now() - snapshot.updatedAt.getTime(),
      expiresIn: snapshot.expiresAt.getTime() - Date.now(),
      connectors,
    };
  } catch (error) {
    console.error("[ContextEngine:Persistence] Failed to get stats:", error);
    return null;
  }
}

/**
 * Cleanup expired snapshots (call periodically)
 */
export async function cleanupExpiredSnapshots(): Promise<number> {
  try {
    const result = await prisma.contextEngineSnapshot.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      console.log(`[ContextEngine:Persistence] Cleaned up ${result.count} expired snapshots`);
    }

    return result.count;
  } catch (error) {
    console.error("[ContextEngine:Persistence] Failed to cleanup snapshots:", error);
    return 0;
  }
}
