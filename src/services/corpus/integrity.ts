import { prisma } from "@/lib/prisma";
import { pickCanonicalAnalysis } from "@/services/deals/canonical-read-model";

const SAMPLE_LIMIT = 10;

type IntegritySample = {
  dealId: string;
  dealName: string;
  thesisId?: string;
  analysisId?: string;
  corpusSnapshotId?: string | null;
  detail: string;
};

export interface CorpusIntegrityOverview {
  generatedAt: string;
  analyses: {
    total: number;
    withSnapshot: number;
    withoutSnapshot: number;
    withDocumentRelationsOnly: number;
    legacyArrayOnly: number;
    unresolvedScope: number;
    legacyDocumentIdsPopulated: number;
  };
  theses: {
    total: number;
    withSnapshot: number;
    withoutSnapshot: number;
    linkedAnalysisSnapshotAvailable: number;
    legacyArrayOnly: number;
    latestSnapshotScopeDrift: number;
  };
  snapshots: {
    total: number;
    membersMissingExtractionRun: number;
  };
  alignment: {
    latestThesisWithoutCanonicalAnalysis: number;
  };
  samples: {
    latestThesisWithoutCanonicalAnalysis: IntegritySample[];
    analysesLegacyArrayOnly: IntegritySample[];
    thesesLegacyArrayOnly: IntegritySample[];
    latestThesisSnapshotDrift: IntegritySample[];
  };
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function sameDocumentScope(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function buildDealName(record: { deal?: { name: string | null } | null; name?: string | null }): string {
  return record.deal?.name ?? record.name ?? "Deal inconnu";
}

export async function getCorpusIntegrityOverview(): Promise<CorpusIntegrityOverview> {
  const [
    analysesTotal,
    analysesWithSnapshot,
    analysesWithDocumentRelationsOnly,
    analysesLegacyArrayOnlyCount,
    analysesUnresolvedScopeCount,
    analysesLegacyDocumentIdsPopulated,
    analysisLegacySamples,
    thesesTotal,
    thesesWithSnapshot,
    thesesLinkedAnalysisSnapshotAvailable,
    thesesLegacyArrayOnlyCount,
    thesisLegacySamples,
    snapshotsTotal,
    snapshotMembersMissingExtractionRun,
    latestTheses,
    latestThesesWithSnapshot,
  ] = await Promise.all([
    prisma.analysis.count(),
    prisma.analysis.count({ where: { corpusSnapshotId: { not: null } } }),
    prisma.analysis.count({
      where: {
        corpusSnapshotId: null,
        documents: { some: {} },
      },
    }),
    prisma.analysis.count({
      where: {
        corpusSnapshotId: null,
        documents: { none: {} },
        documentIds: { isEmpty: false },
      },
    }),
    prisma.analysis.count({
      where: {
        corpusSnapshotId: null,
        documents: { none: {} },
        documentIds: { isEmpty: true },
      },
    }),
    prisma.analysis.count({
      where: {
        documentIds: { isEmpty: false },
      },
    }),
    prisma.analysis.findMany({
      where: {
        corpusSnapshotId: null,
        documents: { none: {} },
        documentIds: { isEmpty: false },
      },
      orderBy: { createdAt: "desc" },
      take: SAMPLE_LIMIT,
      select: {
        id: true,
        dealId: true,
        documentIds: true,
        deal: { select: { name: true } },
      },
    }),
    prisma.thesis.count(),
    prisma.thesis.count({ where: { corpusSnapshotId: { not: null } } }),
    prisma.thesis.count({
      where: {
        corpusSnapshotId: null,
        analyses: {
          some: { corpusSnapshotId: { not: null } },
        },
      },
    }),
    prisma.thesis.count({
      where: {
        corpusSnapshotId: null,
        analyses: { none: {} },
        sourceDocumentIds: { isEmpty: false },
      },
    }),
    prisma.thesis.findMany({
      where: {
        corpusSnapshotId: null,
        analyses: { none: {} },
        sourceDocumentIds: { isEmpty: false },
      },
      orderBy: { createdAt: "desc" },
      take: SAMPLE_LIMIT,
      select: {
        id: true,
        dealId: true,
        sourceDocumentIds: true,
        deal: { select: { name: true } },
      },
    }),
    prisma.corpusSnapshot.count(),
    prisma.corpusSnapshotMember.count({
      where: { extractionRunId: null },
    }),
    prisma.thesis.findMany({
      where: { isLatest: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        dealId: true,
        verdict: true,
        corpusSnapshotId: true,
        deal: { select: { name: true } },
      },
    }),
    prisma.thesis.findMany({
      where: {
        isLatest: true,
        corpusSnapshotId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        dealId: true,
        sourceHash: true,
        sourceDocumentIds: true,
        corpusSnapshotId: true,
        deal: { select: { name: true } },
        corpusSnapshot: {
          select: {
            sourceHash: true,
            members: {
              select: { documentId: true },
            },
          },
        },
      },
    }),
  ]);

  const latestDealIds = latestTheses.map((thesis) => thesis.dealId);
  const completedAnalyses = latestDealIds.length > 0
    ? await prisma.analysis.findMany({
        where: {
          dealId: { in: latestDealIds },
          status: "COMPLETED",
        },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          dealId: true,
          mode: true,
          thesisId: true,
          corpusSnapshotId: true,
          completedAt: true,
          createdAt: true,
        },
      })
    : [];

  const analysesByDealId = new Map<string, typeof completedAnalyses>();
  for (const analysis of completedAnalyses) {
    const bucket = analysesByDealId.get(analysis.dealId) ?? [];
    bucket.push(analysis);
    analysesByDealId.set(analysis.dealId, bucket);
  }

  const latestThesisWithoutCanonicalAnalysisSamples: IntegritySample[] = [];
  let latestThesisWithoutCanonicalAnalysisCount = 0;
  for (const thesis of latestTheses) {
    const selectedAnalysis = pickCanonicalAnalysis(
      {
        id: thesis.id,
        corpusSnapshotId: thesis.corpusSnapshotId,
      },
      analysesByDealId.get(thesis.dealId) ?? []
    );

    if (!selectedAnalysis) {
      latestThesisWithoutCanonicalAnalysisCount += 1;
      if (latestThesisWithoutCanonicalAnalysisSamples.length < SAMPLE_LIMIT) {
        latestThesisWithoutCanonicalAnalysisSamples.push({
          dealId: thesis.dealId,
          dealName: buildDealName(thesis),
          thesisId: thesis.id,
          detail: thesis.corpusSnapshotId
            ? `Latest thesis has snapshot ${thesis.corpusSnapshotId} but no aligned completed analysis`
            : "Latest thesis has no canonical snapshot and no linked completed analysis",
        });
      }
    }
  }

  const latestThesisSnapshotDriftSamples: IntegritySample[] = [];
  let latestThesisSnapshotDriftCount = 0;
  for (const thesis of latestThesesWithSnapshot) {
    const snapshot = thesis.corpusSnapshot;
    if (!snapshot) continue;

    const snapshotDocumentIds = dedupeStrings(
      snapshot.members.map((member) => member.documentId)
    );
    const thesisDocumentIds = dedupeStrings(thesis.sourceDocumentIds);
    const hashDrift = thesis.sourceHash !== snapshot.sourceHash;
    const scopeDrift = !sameDocumentScope(thesisDocumentIds, snapshotDocumentIds);

    if (!hashDrift && !scopeDrift) {
      continue;
    }

    latestThesisSnapshotDriftCount += 1;

    if (latestThesisSnapshotDriftSamples.length < SAMPLE_LIMIT) {
      latestThesisSnapshotDriftSamples.push({
        dealId: thesis.dealId,
        dealName: buildDealName(thesis),
        thesisId: thesis.id,
        corpusSnapshotId: thesis.corpusSnapshotId,
        detail: [
          hashDrift ? "sourceHash != snapshot.sourceHash" : null,
          scopeDrift ? "sourceDocumentIds != snapshot.members" : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" · "),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    analyses: {
      total: analysesTotal,
      withSnapshot: analysesWithSnapshot,
      withoutSnapshot: analysesTotal - analysesWithSnapshot,
      withDocumentRelationsOnly: analysesWithDocumentRelationsOnly,
      legacyArrayOnly: analysesLegacyArrayOnlyCount,
      unresolvedScope: analysesUnresolvedScopeCount,
      legacyDocumentIdsPopulated: analysesLegacyDocumentIdsPopulated,
    },
    theses: {
      total: thesesTotal,
      withSnapshot: thesesWithSnapshot,
      withoutSnapshot: thesesTotal - thesesWithSnapshot,
      linkedAnalysisSnapshotAvailable: thesesLinkedAnalysisSnapshotAvailable,
      legacyArrayOnly: thesesLegacyArrayOnlyCount,
      latestSnapshotScopeDrift: latestThesisSnapshotDriftCount,
    },
    snapshots: {
      total: snapshotsTotal,
      membersMissingExtractionRun: snapshotMembersMissingExtractionRun,
    },
    alignment: {
      latestThesisWithoutCanonicalAnalysis: latestThesisWithoutCanonicalAnalysisCount,
    },
    samples: {
      latestThesisWithoutCanonicalAnalysis: latestThesisWithoutCanonicalAnalysisSamples,
      analysesLegacyArrayOnly: analysisLegacySamples.map((analysis) => ({
        analysisId: analysis.id,
        dealId: analysis.dealId,
        dealName: buildDealName(analysis),
        detail: `${analysis.documentIds.length} legacy documentIds without AnalysisDocument relation`,
      })),
      thesesLegacyArrayOnly: thesisLegacySamples.map((thesis) => ({
        thesisId: thesis.id,
        dealId: thesis.dealId,
        dealName: buildDealName(thesis),
        detail: `${thesis.sourceDocumentIds.length} legacy sourceDocumentIds without linked analysis`,
      })),
      latestThesisSnapshotDrift: latestThesisSnapshotDriftSamples,
    },
  };
}
