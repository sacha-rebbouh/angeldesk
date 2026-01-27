/**
 * Analysis Versioning Service
 *
 * Detects when analyses become stale due to new documents being added.
 * Provides utilities to compare analysis document state vs current deal state.
 */

import { prisma } from "@/lib/prisma";

/**
 * Information about analysis staleness
 */
export interface AnalysisStalenessInfo {
  /** Whether the analysis is stale (new docs exist that weren't analyzed) */
  isStale: boolean;
  /** IDs of documents that were in the analysis */
  analyzedDocumentIds: string[];
  /** IDs of all current COMPLETED documents in the deal */
  currentDocumentIds: string[];
  /** IDs of new documents not included in the analysis */
  newDocumentIds: string[];
  /** IDs of documents that were analyzed but no longer exist */
  removedDocumentIds: string[];
  /** Number of new documents */
  newDocumentCount: number;
  /** Formatted message for UI display */
  message: string | null;
}

/**
 * Check if an analysis is stale compared to current deal documents
 *
 * An analysis is considered stale if:
 * - New documents have been added to the deal since the analysis
 * - Documents have been removed (less critical, but tracked)
 *
 * @param analysisId - The analysis ID to check
 * @returns Staleness information, or null if analysis not found
 */
export async function getAnalysisStaleness(
  analysisId: string
): Promise<AnalysisStalenessInfo | null> {
  try {
    // Get the analysis with its documentIds
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: {
        id: true,
        dealId: true,
        documentIds: true,
        createdAt: true,
      },
    });

    if (!analysis) {
      return null;
    }

    // Get current documents for the deal
    const deal = await prisma.deal.findUnique({
      where: { id: analysis.dealId },
      include: {
        documents: {
          where: { processingStatus: "COMPLETED" },
          select: { id: true, name: true, uploadedAt: true },
          orderBy: { uploadedAt: "desc" },
        },
      },
    });

    if (!deal) {
      return null;
    }

    const analyzedDocumentIds = analysis.documentIds || [];
    const currentDocumentIds = deal.documents.map((d) => d.id);

    // Find new documents (in current but not in analyzed)
    const newDocumentIds = currentDocumentIds.filter(
      (id) => !analyzedDocumentIds.includes(id)
    );

    // Find removed documents (in analyzed but not in current)
    const removedDocumentIds = analyzedDocumentIds.filter(
      (id) => !currentDocumentIds.includes(id)
    );

    const isStale = newDocumentIds.length > 0;
    const newDocumentCount = newDocumentIds.length;

    // Generate user-friendly message
    let message: string | null = null;
    if (isStale) {
      if (newDocumentCount === 1) {
        message = "1 nouveau document non analysé";
      } else {
        message = `${newDocumentCount} nouveaux documents non analysés`;
      }
    }

    return {
      isStale,
      analyzedDocumentIds,
      currentDocumentIds,
      newDocumentIds,
      removedDocumentIds,
      newDocumentCount,
      message,
    };
  } catch (error) {
    console.error("[AnalysisVersioning] Failed to check staleness:", error);
    return null;
  }
}

/**
 * Check staleness for multiple analyses at once (batch operation)
 *
 * More efficient than calling getAnalysisStaleness for each analysis
 * when loading a list of analyses (e.g., deal history page).
 *
 * @param analysisIds - Array of analysis IDs to check
 * @returns Map of analysisId -> staleness info
 */
export async function getAnalysesStaleness(
  analysisIds: string[]
): Promise<Map<string, AnalysisStalenessInfo>> {
  const results = new Map<string, AnalysisStalenessInfo>();

  if (analysisIds.length === 0) {
    return results;
  }

  try {
    // Batch fetch all analyses
    const analyses = await prisma.analysis.findMany({
      where: { id: { in: analysisIds } },
      select: {
        id: true,
        dealId: true,
        documentIds: true,
      },
    });

    // Get unique deal IDs
    const dealIds = [...new Set(analyses.map((a) => a.dealId))];

    // Batch fetch all deals with their documents
    const deals = await prisma.deal.findMany({
      where: { id: { in: dealIds } },
      include: {
        documents: {
          where: { processingStatus: "COMPLETED" },
          select: { id: true },
        },
      },
    });

    // Create a map of dealId -> current document IDs
    const dealDocumentsMap = new Map<string, string[]>();
    for (const deal of deals) {
      dealDocumentsMap.set(
        deal.id,
        deal.documents.map((d) => d.id)
      );
    }

    // Calculate staleness for each analysis
    for (const analysis of analyses) {
      const analyzedDocumentIds = analysis.documentIds || [];
      const currentDocumentIds = dealDocumentsMap.get(analysis.dealId) || [];

      const newDocumentIds = currentDocumentIds.filter(
        (id) => !analyzedDocumentIds.includes(id)
      );
      const removedDocumentIds = analyzedDocumentIds.filter(
        (id) => !currentDocumentIds.includes(id)
      );

      const isStale = newDocumentIds.length > 0;
      const newDocumentCount = newDocumentIds.length;

      let message: string | null = null;
      if (isStale) {
        if (newDocumentCount === 1) {
          message = "1 nouveau document non analysé";
        } else {
          message = `${newDocumentCount} nouveaux documents non analysés`;
        }
      }

      results.set(analysis.id, {
        isStale,
        analyzedDocumentIds,
        currentDocumentIds,
        newDocumentIds,
        removedDocumentIds,
        newDocumentCount,
        message,
      });
    }

    return results;
  } catch (error) {
    console.error("[AnalysisVersioning] Failed to check batch staleness:", error);
    return results;
  }
}

/**
 * Get the latest analysis for a deal and check if it's stale
 *
 * Useful for the deal detail page to show a warning banner.
 *
 * @param dealId - The deal ID
 * @returns Latest analysis staleness info, or null if no analysis exists
 */
export async function getLatestAnalysisStaleness(
  dealId: string
): Promise<(AnalysisStalenessInfo & { analysisId: string; analysisType: string }) | null> {
  try {
    // Get the latest completed analysis for this deal
    const latestAnalysis = await prisma.analysis.findFirst({
      where: {
        dealId,
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        documentIds: true,
      },
    });

    if (!latestAnalysis) {
      return null;
    }

    const staleness = await getAnalysisStaleness(latestAnalysis.id);

    if (!staleness) {
      return null;
    }

    return {
      ...staleness,
      analysisId: latestAnalysis.id,
      analysisType: latestAnalysis.type,
    };
  } catch (error) {
    console.error("[AnalysisVersioning] Failed to get latest staleness:", error);
    return null;
  }
}

/**
 * Get documents that have not been analyzed yet
 *
 * Returns details about which specific documents are new.
 *
 * @param dealId - The deal ID
 * @param analysisId - Optional specific analysis ID (defaults to latest)
 */
export async function getUnanalyzedDocuments(
  dealId: string,
  analysisId?: string
): Promise<Array<{ id: string; name: string; type: string; uploadedAt: Date }>> {
  try {
    // Get the analysis to compare against
    let analysis;
    if (analysisId) {
      analysis = await prisma.analysis.findUnique({
        where: { id: analysisId },
        select: { documentIds: true },
      });
    } else {
      analysis = await prisma.analysis.findFirst({
        where: { dealId, status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        select: { documentIds: true },
      });
    }

    if (!analysis) {
      // No analysis exists - all documents are "unanalyzed"
      const allDocs = await prisma.document.findMany({
        where: { dealId, processingStatus: "COMPLETED" },
        select: { id: true, name: true, type: true, uploadedAt: true },
        orderBy: { uploadedAt: "desc" },
      });
      return allDocs.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        uploadedAt: d.uploadedAt,
      }));
    }

    const analyzedDocumentIds = new Set(analysis.documentIds || []);

    // Get documents not in the analyzed set
    const unanalyzedDocs = await prisma.document.findMany({
      where: {
        dealId,
        processingStatus: "COMPLETED",
        id: { notIn: [...analyzedDocumentIds] },
      },
      select: { id: true, name: true, type: true, uploadedAt: true },
      orderBy: { uploadedAt: "desc" },
    });

    return unanalyzedDocs.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      uploadedAt: d.uploadedAt,
    }));
  } catch (error) {
    console.error("[AnalysisVersioning] Failed to get unanalyzed documents:", error);
    return [];
  }
}
