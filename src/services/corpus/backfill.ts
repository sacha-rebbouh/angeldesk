import { prisma } from "@/lib/prisma";
import { ensureCorpusSnapshotForDeal } from "@/services/corpus";

type LegacyAnalysisRecord = {
  id: string;
  dealId: string;
  createdAt: Date;
  mode: string | null;
  status: string;
  documentIds: string[];
  documents: Array<{ documentId: string }>;
};

type LegacyThesisRecord = {
  id: string;
  dealId: string;
  createdAt: Date;
  isLatest: boolean;
  verdict: string;
  sourceDocumentIds: string[];
  analyses: Array<{
    id: string;
    corpusSnapshotId: string | null;
    documentIds: string[];
    documents: Array<{ documentId: string }>;
  }>;
};

export interface CorpusBackfillCandidate {
  id: string;
  name: string;
  dealId: string;
  dealName: string;
  companyName: string | null;
  sector: string | null;
  stage: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  processedDocumentCount: number;
  eligible: boolean;
  reasons: string[];
  missingAnalyses: number;
  missingTheses: number;
  latestMissingAnalysisAt: string | null;
  latestMissingThesisAt: string | null;
}

export interface BackfillRecordResult {
  id: string;
  dealId: string;
  kind: "analysis" | "thesis";
  status:
    | "updated"
    | "would_update"
    | "skipped_no_documents"
    | "skipped_no_snapshot";
  documentIds: string[];
  snapshotId: string | null;
}

export interface CorpusBackfillRunResult {
  dryRun: boolean;
  scannedAnalyses: number;
  scannedTheses: number;
  updatedAnalyses: number;
  updatedTheses: number;
  skippedAnalyses: number;
  skippedTheses: number;
  results: BackfillRecordResult[];
}

function getLatestIso(records: Array<{ createdAt: Date }>): string | null {
  if (records.length === 0) return null;

  const latest = records.reduce((current, candidate) =>
    candidate.createdAt.getTime() > current.createdAt.getTime() ? candidate : current
  );

  return latest.createdAt.toISOString();
}

function mergeDocumentIds(...groups: Array<Array<string | null | undefined> | undefined>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const group of groups) {
    for (const documentId of group ?? []) {
      if (!documentId || seen.has(documentId)) continue;
      seen.add(documentId);
      merged.push(documentId);
    }
  }

  return merged;
}

function resolveLegacyAnalysisDocumentIds(analysis: {
  documentIds: string[];
  documents: Array<{ documentId: string }>;
}): string[] {
  return mergeDocumentIds(
    analysis.documents.map((document) => document.documentId),
    analysis.documentIds
  );
}

function resolveLegacyThesisDocumentIds(thesis: LegacyThesisRecord): string[] {
  const linkedAnalysis = thesis.analyses[0];
  return mergeDocumentIds(
    linkedAnalysis?.documents.map((document) => document.documentId),
    linkedAnalysis?.documentIds,
    thesis.sourceDocumentIds
  );
}

async function backfillAnalysisRecord(
  analysis: LegacyAnalysisRecord,
  dryRun: boolean
): Promise<BackfillRecordResult> {
  const documentIds = resolveLegacyAnalysisDocumentIds(analysis);
  if (documentIds.length === 0) {
    return {
      id: analysis.id,
      dealId: analysis.dealId,
      kind: "analysis",
      status: "skipped_no_documents",
      documentIds: [],
      snapshotId: null,
    };
  }

  const snapshot = await ensureCorpusSnapshotForDeal({
    dealId: analysis.dealId,
    documentIds,
  });

  if (!snapshot) {
    return {
      id: analysis.id,
      dealId: analysis.dealId,
      kind: "analysis",
      status: "skipped_no_snapshot",
      documentIds,
      snapshotId: null,
    };
  }

  if (!dryRun) {
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: { corpusSnapshotId: snapshot.id },
    });
  }

  return {
    id: analysis.id,
    dealId: analysis.dealId,
    kind: "analysis",
    status: dryRun ? "would_update" : "updated",
    documentIds: snapshot.documentIds,
    snapshotId: snapshot.id,
  };
}

async function backfillThesisRecord(
  thesis: LegacyThesisRecord,
  dryRun: boolean
): Promise<BackfillRecordResult> {
  const linkedAnalysis = thesis.analyses[0];
  const documentIds = resolveLegacyThesisDocumentIds(thesis);

  if (linkedAnalysis?.corpusSnapshotId) {
    if (!dryRun) {
      await prisma.thesis.update({
        where: { id: thesis.id },
        data: { corpusSnapshotId: linkedAnalysis.corpusSnapshotId },
      });
    }

    return {
      id: thesis.id,
      dealId: thesis.dealId,
      kind: "thesis",
      status: dryRun ? "would_update" : "updated",
      documentIds,
      snapshotId: linkedAnalysis.corpusSnapshotId,
    };
  }

  if (documentIds.length === 0) {
    return {
      id: thesis.id,
      dealId: thesis.dealId,
      kind: "thesis",
      status: "skipped_no_documents",
      documentIds: [],
      snapshotId: null,
    };
  }

  return {
    id: thesis.id,
    dealId: thesis.dealId,
    kind: "thesis",
    status: "skipped_no_snapshot",
    documentIds,
    snapshotId: null,
  };
}

export async function listCorpusBackfillCandidates(params: {
  take?: number;
  dealId?: string;
} = {}): Promise<CorpusBackfillCandidate[]> {
  const take = Math.max(1, Math.min(params.take ?? 200, 500));

  const [analyses, theses] = await Promise.all([
    prisma.analysis.findMany({
      where: {
        corpusSnapshotId: null,
        ...(params.dealId ? { dealId: params.dealId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        dealId: true,
        createdAt: true,
      },
      take: take * 5,
    }),
    prisma.thesis.findMany({
      where: {
        corpusSnapshotId: null,
        ...(params.dealId ? { dealId: params.dealId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        dealId: true,
        createdAt: true,
      },
      take: take * 5,
    }),
  ]);

  const dealIds = [...new Set([...analyses.map((analysis) => analysis.dealId), ...theses.map((thesis) => thesis.dealId)])];
  if (dealIds.length === 0) {
    return [];
  }

  const deals = await prisma.deal.findMany({
    where: { id: { in: dealIds } },
    select: {
      id: true,
      name: true,
      companyName: true,
      sector: true,
      stage: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          documents: true,
        },
      },
      documents: {
        where: {
          processingStatus: "COMPLETED",
        },
        select: { id: true },
      },
    },
  });

  const analysesByDeal = new Map<string, Array<{ id: string; createdAt: Date }>>();
  for (const analysis of analyses) {
    const bucket = analysesByDeal.get(analysis.dealId) ?? [];
    bucket.push(analysis);
    analysesByDeal.set(analysis.dealId, bucket);
  }

  const thesesByDeal = new Map<string, Array<{ id: string; createdAt: Date }>>();
  for (const thesis of theses) {
    const bucket = thesesByDeal.get(thesis.dealId) ?? [];
    bucket.push(thesis);
    thesesByDeal.set(thesis.dealId, bucket);
  }

  return deals
    .map((deal) => {
      const missingAnalyses = analysesByDeal.get(deal.id) ?? [];
      const missingTheses = thesesByDeal.get(deal.id) ?? [];
      return {
        id: deal.id,
        name: deal.name,
        dealId: deal.id,
        dealName: deal.name,
        companyName: deal.companyName,
        sector: deal.sector,
        stage: deal.stage,
        userId: deal.userId,
        createdAt: deal.createdAt.toISOString(),
        updatedAt: deal.updatedAt.toISOString(),
        documentCount: deal._count.documents,
        processedDocumentCount: deal.documents.length,
        eligible: deal.documents.length > 0 && (missingAnalyses.length > 0 || missingTheses.length > 0),
        reasons: deal.documents.length > 0 ? [] : ["Pas de documents traités"],
        missingAnalyses: missingAnalyses.length,
        missingTheses: missingTheses.length,
        latestMissingAnalysisAt: getLatestIso(missingAnalyses),
        latestMissingThesisAt: getLatestIso(missingTheses),
      } satisfies CorpusBackfillCandidate;
    })
    .sort((left, right) => {
      const rightTs = Math.max(
        right.latestMissingAnalysisAt ? Date.parse(right.latestMissingAnalysisAt) : 0,
        right.latestMissingThesisAt ? Date.parse(right.latestMissingThesisAt) : 0
      );
      const leftTs = Math.max(
        left.latestMissingAnalysisAt ? Date.parse(left.latestMissingAnalysisAt) : 0,
        left.latestMissingThesisAt ? Date.parse(left.latestMissingThesisAt) : 0
      );
      return rightTs - leftTs;
    })
    .slice(0, take);
}

export async function backfillCorpusSnapshots(params: {
  dealId?: string;
  limit?: number;
  dryRun?: boolean;
} = {}): Promise<CorpusBackfillRunResult> {
  const limit = Math.max(1, Math.min(params.limit ?? 100, 1000));
  const dryRun = params.dryRun ?? false;

  const [analyses, theses] = await Promise.all([
    prisma.analysis.findMany({
      where: {
        corpusSnapshotId: null,
        ...(params.dealId ? { dealId: params.dealId } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        dealId: true,
        createdAt: true,
        mode: true,
        status: true,
        documentIds: true,
        documents: {
          select: { documentId: true },
        },
      },
    }),
    prisma.thesis.findMany({
      where: {
        corpusSnapshotId: null,
        ...(params.dealId ? { dealId: params.dealId } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        dealId: true,
        createdAt: true,
        isLatest: true,
        verdict: true,
        sourceDocumentIds: true,
        analyses: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
            corpusSnapshotId: true,
            documentIds: true,
            documents: {
              select: { documentId: true },
            },
          },
        },
      },
    }),
  ]);

  const results: BackfillRecordResult[] = [];

  for (const analysis of analyses as LegacyAnalysisRecord[]) {
    results.push(await backfillAnalysisRecord(analysis, dryRun));
  }

  for (const thesis of theses as LegacyThesisRecord[]) {
    results.push(await backfillThesisRecord(thesis, dryRun));
  }

  return {
    dryRun,
    scannedAnalyses: analyses.length,
    scannedTheses: theses.length,
    updatedAnalyses: results.filter((result) => result.kind === "analysis" && (result.status === "updated" || result.status === "would_update")).length,
    updatedTheses: results.filter((result) => result.kind === "thesis" && (result.status === "updated" || result.status === "would_update")).length,
    skippedAnalyses: results.filter((result) => result.kind === "analysis" && result.status.startsWith("skipped_")).length,
    skippedTheses: results.filter((result) => result.kind === "thesis" && result.status.startsWith("skipped_")).length,
    results,
  };
}
