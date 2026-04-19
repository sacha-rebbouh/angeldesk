import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { safeDecrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { calculateArtifactCompleteness, getBlockingPageNumbersFromStoredPages } from "@/services/documents/extraction-runs";
import type { DocumentPageArtifact } from "@/services/pdf";

const cuidSchema = z.string().cuid();

type RouteParams = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_request: NextRequest, context: RouteParams) {
  try {
    const user = await requireAuth();
    const { documentId } = await context.params;

    const idCheck = cuidSchema.safeParse(documentId);
    if (!idCheck.success) {
      return NextResponse.json({ error: "Invalid document ID format" }, { status: 400 });
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, deal: { userId: user.id } },
      select: {
        id: true,
        name: true,
        type: true,
        mimeType: true,
        processingStatus: true,
        extractionQuality: true,
        extractionMetrics: true,
        extractionWarnings: true,
        requiresOCR: true,
        ocrProcessed: true,
        extractedText: true,
        extractionRuns: {
          orderBy: [{ startedAt: "desc" }, { completedAt: "desc" }],
          take: 1,
          include: {
            pages: { orderBy: { pageNumber: "asc" } },
            overrides: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const extractedText = document.extractedText ? safeDecrypt(document.extractedText) : "";
    const latestRun = document.extractionRuns[0] ?? null;
    const textByPage = splitExtractedTextByPage(extractedText);
    const pageQualityPlan = latestRun ? extractPageQualityPlan(latestRun.summaryMetrics) : new Map<number, PageQualityPlan>();
    const creditEstimate = latestRun ? extractCreditEstimate(latestRun.summaryMetrics) : null;
    const blockingPages = latestRun
      ? new Set(getBlockingPageNumbersFromStoredPages(latestRun.pages))
      : new Set<number>();

    return NextResponse.json({
      data: {
        document: {
          id: document.id,
          name: document.name,
          type: document.type,
          mimeType: document.mimeType,
          processingStatus: document.processingStatus,
          extractionQuality: document.extractionQuality,
          extractionMetrics: document.extractionMetrics,
          extractionWarnings: document.extractionWarnings,
          requiresOCR: document.requiresOCR,
          ocrProcessed: document.ocrProcessed,
          excelModelAudit: extractExcelModelAudit(document.extractionMetrics),
        },
        corpus: {
          text: extractedText,
          charCount: extractedText.length,
          wordCount: extractedText.split(/\s+/).filter(Boolean).length,
          parsedPages: textByPage.length,
        },
        latestRun: latestRun
          ? {
              id: latestRun.id,
              status: latestRun.status,
              readyForAnalysis: latestRun.readyForAnalysis,
              pageCount: latestRun.pageCount,
              pagesProcessed: latestRun.pagesProcessed,
              pagesSucceeded: latestRun.pagesSucceeded,
              pagesFailed: latestRun.pagesFailed,
              pagesSkipped: latestRun.pagesSkipped,
              coverageRatio: Number(latestRun.coverageRatio),
              qualityScore: latestRun.qualityScore,
              blockedReason: latestRun.blockedReason,
              extractionVersion: latestRun.extractionVersion,
              pipelineVersion: latestRun.pipelineVersion,
              contentHash: latestRun.contentHash,
              corpusTextHash: latestRun.corpusTextHash,
              creditEstimate,
              startedAt: latestRun.startedAt.toISOString(),
              completedAt: latestRun.completedAt?.toISOString() ?? null,
              pages: latestRun.pages.map((page) => {
                const pageOverride = latestRun.overrides.find(
                  (override) => override.pageNumber === page.pageNumber && override.approvedAt
                );
                const qualityPlan = pageQualityPlan.get(page.pageNumber);
                const evidenceSummary = buildPageEvidenceSummary(page.artifact, page.status, page.hasTables, page.hasCharts);
                return {
                  id: page.id,
                  pageNumber: page.pageNumber,
                  status: page.status,
                  method: page.method,
                  charCount: page.charCount,
                  wordCount: page.wordCount,
                  qualityScore: page.qualityScore,
                  confidence: page.confidence,
                  hasTables: page.hasTables,
                  hasCharts: page.hasCharts,
                  hasFinancialKeywords: page.hasFinancialKeywords,
                  hasTeamKeywords: page.hasTeamKeywords,
                  hasMarketKeywords: page.hasMarketKeywords,
                  requiresOCR: page.requiresOCR,
                  ocrProcessed: page.ocrProcessed,
                  errorMessage: page.errorMessage,
                  textPreview: page.textPreview,
                  artifactVersion: page.artifactVersion,
                  artifact: page.artifact,
                  provider: extractArtifactProvider(page.artifact),
                  verification: extractArtifactVerification(page.artifact),
                  evidenceSummary,
                  pageImageHash: page.pageImageHash,
                  blocksAnalysis: blockingPages.has(page.pageNumber),
                  needsInspection: !pageOverride && (
                    page.status === "NEEDS_REVIEW" ||
                    page.status === "FAILED"
                  ),
                  extractionTier: qualityPlan?.extractionTier ?? null,
                  visualRiskScore: qualityPlan?.visualRiskScore ?? null,
                  visualRiskReasons: qualityPlan?.visualRiskReasons ?? [],
                  semanticAssessment: extractSemanticAssessment(page.artifact, qualityPlan),
                  extractedText: textByPage.find((entry) => entry.pageNumber === page.pageNumber)?.text ?? "",
                  override: pageOverride
                    ? {
                        id: pageOverride.id,
                        overrideType: pageOverride.overrideType,
                        reason: pageOverride.reason,
                        approvedAt: pageOverride.approvedAt?.toISOString() ?? null,
                      }
                    : null,
                };
              }),
              overrides: latestRun.overrides.map((override) => ({
                id: override.id,
                pageNumber: override.pageNumber,
                overrideType: override.overrideType,
                reason: override.reason,
                payload: override.payload,
                approvedAt: override.approvedAt?.toISOString() ?? null,
                createdAt: override.createdAt.toISOString(),
              })),
            }
          : null,
      },
    });
  } catch (error) {
    return handleApiError(error, "fetch document extraction audit");
  }
}

interface PageQualityPlan {
  pageNumber: number;
  extractionTier: string;
  visualRiskScore: number;
  visualRiskReasons: string[];
  pageClass?: string | null;
  structureDependency?: string | null;
  semanticSufficiency?: string | null;
  labelValueIntegrity?: string | null;
  visualNoiseScore?: number | null;
  analyticalValueScore?: number | null;
}

function extractPageQualityPlan(summaryMetrics: unknown): Map<number, PageQualityPlan> {
  if (!summaryMetrics || typeof summaryMetrics !== "object" || Array.isArray(summaryMetrics)) {
    return new Map();
  }
  const plan = (summaryMetrics as { pageQualityPlan?: unknown }).pageQualityPlan;
  if (!Array.isArray(plan)) return new Map();

  const entries = plan
    .filter((entry): entry is PageQualityPlan => (
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as PageQualityPlan).pageNumber === "number" &&
      typeof (entry as PageQualityPlan).extractionTier === "string" &&
      typeof (entry as PageQualityPlan).visualRiskScore === "number" &&
      Array.isArray((entry as PageQualityPlan).visualRiskReasons)
    ))
    .map((entry) => [entry.pageNumber, entry] as const);
  return new Map(entries);
}

function extractCreditEstimate(summaryMetrics: unknown): unknown {
  if (!summaryMetrics || typeof summaryMetrics !== "object" || Array.isArray(summaryMetrics)) {
    return null;
  }
  return (summaryMetrics as { creditEstimate?: unknown }).creditEstimate ?? null;
}

function extractExcelModelAudit(extractionMetrics: unknown) {
  if (!extractionMetrics || typeof extractionMetrics !== "object" || Array.isArray(extractionMetrics)) {
    return null;
  }
  const record = extractionMetrics as Record<string, unknown>;
  return {
    workbookAudit: record.workbookAudit ?? null,
    modelIntelligence: record.modelIntelligence ?? null,
    financialAudit: record.financialAudit ?? null,
    analystReport: record.analystReport ?? null,
  };
}

function extractSemanticAssessment(artifact: unknown, qualityPlan?: PageQualityPlan) {
  if (artifact && typeof artifact === "object" && !Array.isArray(artifact)) {
    const candidate = (artifact as { semanticAssessment?: unknown }).semanticAssessment;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate;
    }
  }

  if (!qualityPlan?.pageClass) return null;

  return {
    pageClass: qualityPlan.pageClass,
    structureDependency: qualityPlan.structureDependency ?? null,
    semanticSufficiency: qualityPlan.semanticSufficiency ?? null,
    labelValueIntegrity: qualityPlan.labelValueIntegrity ?? null,
    visualNoiseScore: qualityPlan.visualNoiseScore ?? null,
    analyticalValueScore: qualityPlan.analyticalValueScore ?? null,
  };
}

function extractArtifactProvider(artifact: unknown) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return null;
  const candidate = (artifact as { provider?: unknown }).provider;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate;
}

function extractArtifactVerification(artifact: unknown) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return null;
  const candidate = (artifact as { verification?: unknown }).verification;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate;
}

function buildPageEvidenceSummary(
  artifact: unknown,
  status: string,
  hasTables: boolean,
  hasCharts: boolean
) {
  const record = artifact && typeof artifact === "object" && !Array.isArray(artifact)
    ? artifact as Record<string, unknown>
    : {};
  const visualBlocks = Array.isArray(record.visualBlocks) ? record.visualBlocks.length : 0;
  const tables = Array.isArray(record.tables) ? record.tables.length : 0;
  const charts = Array.isArray(record.charts) ? record.charts.length : 0;
  const numericClaims = Array.isArray(record.numericClaims) ? record.numericClaims.length : 0;
  const unreadableRegions = Array.isArray(record.unreadableRegions) ? record.unreadableRegions.length : 0;
  const needsHumanReview = record.needsHumanReview === true || status === "NEEDS_REVIEW" || status === "FAILED";
  const provider = extractArtifactProvider(record);
  const verification = extractArtifactVerification(record);
  const missingExpectedStructure = (hasTables && tables === 0) || (hasCharts && charts === 0 && numericClaims < 3);
  const completeness = calculateArtifactCompleteness({
    hasTables,
    hasCharts,
    artifact: isDocumentPageArtifact(record) ? record as unknown as DocumentPageArtifact : null,
  });

  return {
    visualBlocks,
    tables,
    charts,
    numericClaims,
    unreadableRegions,
    confidence: typeof record.confidence === "string" ? record.confidence : null,
    needsHumanReview,
    providerKind: provider && typeof provider === "object" && "kind" in provider ? (provider as { kind?: unknown }).kind ?? null : null,
    providerModelId: provider && typeof provider === "object" && "modelId" in provider ? (provider as { modelId?: unknown }).modelId ?? null : null,
    verificationState: verification && typeof verification === "object" && "state" in verification ? (verification as { state?: unknown }).state ?? null : null,
    verificationIssueCount: verification && typeof verification === "object" && Array.isArray((verification as { issues?: unknown[] }).issues)
      ? ((verification as { issues?: unknown[] }).issues?.length ?? 0)
      : 0,
    verificationEvidenceCount: verification && typeof verification === "object" && Array.isArray((verification as { evidence?: unknown[] }).evidence)
      ? ((verification as { evidence?: unknown[] }).evidence?.length ?? 0)
      : 0,
    missingExpectedStructure,
    artifactCompleteness: completeness.score,
    expectedVisualBlocks: completeness.expectedVisualBlocks,
    extractedVisualBlocks: completeness.extractedVisualBlocks,
    missingVisualEvidence: completeness.missing,
    recommendedAction: status === "FAILED"
      ? "RETRY_PAGE"
      : missingExpectedStructure
        ? "RETRY_OR_REVIEW_PAGE"
        : needsHumanReview
          ? "REVIEW_PAGE"
          : "NONE",
  };
}

function isDocumentPageArtifact(value: Record<string, unknown>): boolean {
  return (value.version === "document-page-artifact-v1" || value.version === "document-page-artifact-v2") &&
    typeof value.text === "string" &&
    Array.isArray(value.visualBlocks) &&
    Array.isArray(value.tables) &&
    Array.isArray(value.charts) &&
    Array.isArray(value.unreadableRegions) &&
    Array.isArray(value.numericClaims);
}

function splitExtractedTextByPage(text: string): Array<{ pageNumber: number; text: string }> {
  if (!text.trim()) return [];

  const marker = /\[Page (\d+) - [^\]]+\]/g;
  const matches = [...text.matchAll(marker)];
  if (matches.length === 0) {
    return [{ pageNumber: 1, text }];
  }

  const pageChunks = new Map<number, string[]>();
  for (const [index, match] of matches.entries()) {
    const pageNumber = Number(match[1]);
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? text.length;
    const pageText = text.slice(start, end).trim();
    pageChunks.set(pageNumber, [...(pageChunks.get(pageNumber) ?? []), pageText]);
  }

  return [...pageChunks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([pageNumber, chunks]) => ({
      pageNumber,
      text: chunks.join("\n\n"),
    }));
}
