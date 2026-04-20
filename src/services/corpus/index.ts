import { createHash } from "crypto";

import { safeDecrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

type CorpusRun = {
  id: string;
  status: string;
  readyForAnalysis: boolean;
  corpusTextHash?: string | null;
  pages?: Array<unknown>;
};

export type CorpusDocument = {
  id: string;
  isLatest?: boolean;
  extractedText?: string | null;
  processingStatus?: string;
  uploadedAt?: Date;
  extractionRuns?: CorpusRun[];
};

export interface CorpusSnapshotMaterialization {
  id: string;
  dealId: string;
  sourceHash: string;
  documentIds: string[];
  extractionRunIds: string[];
  createdAt: Date;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function hashExtractedText(text?: string | null): string | null {
  if (!text) return null;
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function getLatestReadyRun(document: CorpusDocument): CorpusRun | null {
  const latestRun = document.extractionRuns?.[0] ?? null;
  return latestRun?.readyForAnalysis ? latestRun : null;
}

function buildDocumentSignature(document: CorpusDocument) {
  const latestReadyRun = getLatestReadyRun(document);

  return {
    id: document.id,
    uploadedAt: document.uploadedAt?.toISOString() ?? null,
    latestReadyRun: latestReadyRun
      ? {
          id: latestReadyRun.id,
          status: latestReadyRun.status,
          corpusTextHash: latestReadyRun.corpusTextHash ?? null,
          pageCount: latestReadyRun.pages?.length ?? 0,
        }
      : null,
    extractedTextHash: hashExtractedText(document.extractedText),
  };
}

function normalizeDocuments(
  documents: CorpusDocument[],
  options: { allowSupersededDocuments?: boolean } = {}
): CorpusDocument[] {
  return documents
    .filter(
      (document) =>
        document.processingStatus === "COMPLETED" &&
        (options.allowSupersededDocuments === true || document.isLatest !== false)
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function computeCorpusSourceHash(
  documents: CorpusDocument[],
  options: { allowSupersededDocuments?: boolean } = {}
): {
  sourceHash: string;
  documentIds: string[];
  extractionRunIds: string[];
} {
  const normalizedDocuments = normalizeDocuments(documents, options);
  const signatures = normalizedDocuments.map(buildDocumentSignature);
  const sourceHash = createHash("sha256")
    .update(JSON.stringify(signatures))
    .digest("hex");

  return {
    sourceHash,
    documentIds: normalizedDocuments.map((document) => document.id),
    extractionRunIds: normalizedDocuments
      .map((document) => getLatestReadyRun(document)?.id ?? null)
      .filter((runId): runId is string => typeof runId === "string"),
  };
}

export async function ensureCorpusSnapshot(params: {
  dealId: string;
  documents: CorpusDocument[];
  allowSupersededDocuments?: boolean;
}): Promise<CorpusSnapshotMaterialization | null> {
  const normalizedDocuments = normalizeDocuments(params.documents, {
    allowSupersededDocuments: params.allowSupersededDocuments,
  });
  if (normalizedDocuments.length === 0) {
    return null;
  }

  const { sourceHash, documentIds, extractionRunIds } = computeCorpusSourceHash(normalizedDocuments, {
    allowSupersededDocuments: params.allowSupersededDocuments,
  });
  const snapshotMembers = normalizedDocuments.map((document) => ({
    documentId: document.id,
    extractionRunId: getLatestReadyRun(document)?.id ?? null,
  }));

  const existing = await prisma.corpusSnapshot.findUnique({
    where: {
      dealId_sourceHash: {
        dealId: params.dealId,
        sourceHash,
      },
    },
    select: {
      id: true,
      dealId: true,
      sourceHash: true,
      createdAt: true,
    },
  });

  if (existing) {
    return {
      ...existing,
      documentIds,
      extractionRunIds,
    };
  }

  let created: {
    id: string;
    dealId: string;
    sourceHash: string;
    createdAt: Date;
  };

  try {
    created = await prisma.corpusSnapshot.create({
      data: {
        dealId: params.dealId,
        sourceHash,
        members: {
          create: snapshotMembers,
        },
      },
      select: {
        id: true,
        dealId: true,
        sourceHash: true,
        createdAt: true,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const concurrentSnapshot = await prisma.corpusSnapshot.findUnique({
        where: {
          dealId_sourceHash: {
            dealId: params.dealId,
            sourceHash,
          },
        },
        select: {
          id: true,
          dealId: true,
          sourceHash: true,
          createdAt: true,
        },
      });

      if (!concurrentSnapshot) {
        throw error;
      }

      return {
        ...concurrentSnapshot,
        documentIds,
        extractionRunIds,
      };
    }

    throw error;
  }

  return {
    ...created,
    documentIds,
    extractionRunIds,
  };
}

export async function ensureCorpusSnapshotForDeal(params: {
  dealId: string;
  documentIds?: string[];
}): Promise<CorpusSnapshotMaterialization | null> {
  const requestedDocumentIds = params.documentIds?.length ? params.documentIds : null;

  const documents = await prisma.document.findMany({
    where: {
      dealId: params.dealId,
      ...(requestedDocumentIds
        ? { id: { in: requestedDocumentIds } }
        : { isLatest: true }),
    },
    select: {
      id: true,
      isLatest: true,
      extractedText: true,
      processingStatus: true,
      uploadedAt: true,
      extractionRuns: {
        orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
        take: 1,
        select: {
          id: true,
          status: true,
          readyForAnalysis: true,
          corpusTextHash: true,
          pages: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (requestedDocumentIds) {
    const currentDocumentIds = new Set(
      documents.filter((document) => document.isLatest).map((document) => document.id)
    );
    const rejectedDocumentIds = requestedDocumentIds.filter(
      (documentId) => !currentDocumentIds.has(documentId)
    );

    if (rejectedDocumentIds.length > 0) {
      logger.warn(
        {
          dealId: params.dealId,
          requestedDocumentIds,
          rejectedDocumentIds,
        },
        "Refusing to materialize a corpus snapshot that references missing or superseded documents"
      );
      return null;
    }
  }

  const hydratedDocuments: CorpusDocument[] = documents.map((document) => ({
    ...document,
    extractedText: document.extractedText ? safeDecrypt(document.extractedText) : null,
  }));

  if (requestedDocumentIds) {
    const documentOrder = new Map(requestedDocumentIds.map((documentId, index) => [documentId, index]));
    hydratedDocuments.sort(
      (left, right) =>
        (documentOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (documentOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  return ensureCorpusSnapshot({
    dealId: params.dealId,
    documents: hydratedDocuments,
  });
}

export async function loadCorpusSnapshot(snapshotId: string): Promise<CorpusSnapshotMaterialization | null> {
  const snapshot = await prisma.corpusSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      id: true,
      dealId: true,
      sourceHash: true,
      createdAt: true,
      members: {
        select: {
          documentId: true,
          extractionRunId: true,
        },
        orderBy: { documentId: "asc" },
      },
    },
  });

  if (!snapshot) {
    return null;
  }

  return {
    id: snapshot.id,
    dealId: snapshot.dealId,
    sourceHash: snapshot.sourceHash,
    createdAt: snapshot.createdAt,
    documentIds: snapshot.members.map((member) => member.documentId),
    extractionRunIds: snapshot.members
      .map((member) => member.extractionRunId)
      .filter((runId): runId is string => typeof runId === "string"),
  };
}

export async function getCorpusSnapshotDocumentIds(snapshotId: string): Promise<string[]> {
  const snapshot = await loadCorpusSnapshot(snapshotId);
  return snapshot?.documentIds ?? [];
}
