"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clipboard,
  ExternalLink,
  FileSearch,
  Loader2,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ExtractionAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    name: string;
  } | null;
}

interface AuditPage {
  id: string;
  pageNumber: number;
  status: "READY" | "READY_WITH_WARNINGS" | "NEEDS_REVIEW" | "FAILED" | "SKIPPED";
  method: "NATIVE_TEXT" | "OCR" | "HYBRID" | "SKIPPED";
  charCount: number;
  wordCount: number;
  qualityScore: number | null;
  hasTables: boolean;
  hasCharts: boolean;
  hasFinancialKeywords: boolean;
  hasTeamKeywords: boolean;
  hasMarketKeywords: boolean;
  requiresOCR: boolean;
  ocrProcessed: boolean;
  extractionTier: "native_only" | "standard_ocr" | "high_fidelity" | "supreme" | null;
  visualRiskScore: number | null;
  visualRiskReasons: string[];
  semanticAssessment?: {
    pageClass?: string | null;
    structureDependency?: string | null;
    semanticSufficiency?: string | null;
    labelValueIntegrity?: string | null;
    visualNoiseScore?: number | null;
    analyticalValueScore?: number | null;
    minimumEvidence?: string[];
    rationale?: string[];
  } | null;
  errorMessage: string | null;
  artifactVersion: string | null;
  artifact: {
    visualBlocks?: Array<{ type: string; title?: string; description: string; confidence: string }>;
    tables?: Array<{ title?: string; markdown?: string; confidence: string }>;
    charts?: Array<{ title?: string; chartType?: string; description: string; confidence: string }>;
    unreadableRegions?: Array<{ reason: string; severity: string }>;
    numericClaims?: Array<{ label: string; value: string; unit?: string; confidence: string }>;
    confidence?: string;
    needsHumanReview?: boolean;
  } | null;
  provider?: {
    kind?: string | null;
    modelId?: string | null;
    mode?: string | null;
    providerVersion?: string | null;
    schemaVersion?: string | null;
    promptVersion?: string | null;
    transport?: string | null;
  } | null;
  verification?: {
    state?: string | null;
    evidence?: string[];
    issues?: string[];
  } | null;
  evidenceSummary?: {
    visualBlocks: number;
    tables: number;
    charts: number;
    numericClaims: number;
    unreadableRegions: number;
    confidence: string | null;
    needsHumanReview: boolean;
    missingExpectedStructure: boolean;
    artifactCompleteness: number;
    expectedVisualBlocks: number;
    extractedVisualBlocks: number;
    missingVisualEvidence: string[];
    recommendedAction: "NONE" | "REVIEW_PAGE" | "RETRY_PAGE" | "RETRY_OR_REVIEW_PAGE";
  };
  pageImageHash: string | null;
  blocksAnalysis: boolean;
  needsInspection: boolean;
  extractedText: string;
  override: {
    id: string;
    overrideType: "BYPASS_PAGE" | "EXCLUDE_PAGE" | string;
    reason: string;
    approvedAt: string | null;
  } | null;
}

interface ExtractionAuditResponse {
  data: {
    document: {
      id: string;
      name: string;
      type?: string;
      mimeType?: string | null;
      processingStatus: string;
      extractionQuality: number | null;
      excelModelAudit?: ExcelModelAuditPayload | null;
    };
    corpus: {
      text: string;
      charCount: number;
      wordCount: number;
      parsedPages: number;
    };
    latestRun: {
      id: string;
      status: string;
      readyForAnalysis: boolean;
      pageCount: number;
      pagesProcessed: number;
      pagesSucceeded: number;
      pagesFailed: number;
      pagesSkipped: number;
      coverageRatio: number;
      qualityScore: number | null;
      blockedReason: string | null;
      corpusTextHash: string | null;
      creditEstimate: {
        estimatedCredits: number;
        estimatedUsd: number;
        pagesByTier: Record<string, number>;
      } | null;
      extractionVersion?: string;
      pipelineVersion?: string;
      startedAt?: string | null;
      completedAt: string | null;
      pages: AuditPage[];
      overrides: Array<{
        id: string;
        pageNumber: number | null;
        overrideType: string;
        reason: string;
        approvedAt: string | null;
      }>;
    } | null;
  };
}

interface ExcelWorkbookAudit {
  hiddenSheets?: string[];
  assumptionSheets?: string[];
  outputSheets?: string[];
  calcSheets?: string[];
  criticalSheets?: string[];
  formulaHeavySheets?: string[];
  warningFlags?: string[];
}

interface ExcelDriverSignal {
  sheet: string;
  cell: string;
  label: string;
  value: string;
  kind: string;
  confidence: string;
}

interface ExcelOutputSignal {
  sheet: string;
  cell: string;
  label: string;
  value: string;
  supportingRefs?: string[];
  confidence: string;
}

interface ExcelHardcodeSignal {
  sheet: string;
  cell: string;
  label: string;
  value: string;
  severity: "low" | "medium" | "high";
  reason: string;
}

interface ExcelHiddenStructureSignal {
  type: string;
  sheet: string;
  index?: number;
  reason: string;
}

interface ExcelDisconnectedCalcSignal {
  sheet: string;
  cell: string;
  formula: string;
  reason: string;
}

interface ExcelCriticalDependency {
  output: string;
  precedentCount: number;
  hardcodedPrecedentCount: number;
  crossSheetPrecedentCount: number;
}

interface ExcelModelIntelligencePayload {
  workbookMap?: {
    sheetCount?: number;
    hiddenSheets?: string[];
    roles?: Array<{
      name: string;
      role: string;
      classification: string;
      hidden: boolean;
      formulaDensity: number;
    }>;
  };
  lineage?: {
    nodes?: number;
    edges?: number;
    crossSheetEdges?: number;
    lineageSamples?: Array<{
      target: string;
      formula: string;
      precedents: string[];
      precedentDepthEstimate: number;
    }>;
  };
  drivers?: { count?: number; top?: ExcelDriverSignal[] };
  outputs?: { count?: number; top?: ExcelOutputSignal[] };
  hardcodes?: { count?: number; highSeverityCount?: number; top?: ExcelHardcodeSignal[] };
  hiddenStructures?: ExcelHiddenStructureSignal[];
  disconnectedCalcs?: ExcelDisconnectedCalcSignal[];
  criticalDependencies?: ExcelCriticalDependency[];
  warnings?: string[];
}

interface ExcelFinancialAuditFlag {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  message: string;
  evidence: string[];
}

interface ExcelFinancialAuditPayload {
  consistencyFlags?: ExcelFinancialAuditFlag[];
  reconciliationFlags?: ExcelFinancialAuditFlag[];
  plausibilityFlags?: ExcelFinancialAuditFlag[];
  heroicAssumptionFlags?: ExcelFinancialAuditFlag[];
  dependencyFlags?: ExcelFinancialAuditFlag[];
  greenFlags?: ExcelFinancialAuditFlag[];
  keyMetrics?: Array<{
    label: string;
    value: string;
    sheet: string;
    category: string;
  }>;
  topSensitivities?: Array<{
    driver: string;
    reason: string;
    sensitivity: "high" | "medium" | "low";
  }>;
  overallRisk?: "low" | "medium" | "high" | "critical";
  warnings?: string[];
}

interface ExcelAnalystReport {
  executiveSummary: string;
  topRedFlags: string[];
  topGreenFlags: string[];
  keyQuestions: string[];
  priorityChecks: string[];
  confidence: "low" | "medium" | "high";
  reasoningNotes: string[];
}

interface ExcelModelAuditPayload {
  workbookAudit?: ExcelWorkbookAudit | null;
  modelIntelligence?: ExcelModelIntelligencePayload | null;
  financialAudit?: ExcelFinancialAuditPayload | null;
  analystReport?: { report?: ExcelAnalystReport; cost?: number } | ExcelAnalystReport | null;
}

type ExtractionDecisionAction = "BYPASS_PAGE" | "EXCLUDE_PAGE";

type ExtractionDecisionParams = {
  pageNumber: number;
  action: ExtractionDecisionAction;
  reason: string;
};

type PageRetryParams = {
  pageNumber: number;
};

function pageRequiresDecision(page: AuditPage) {
  return !page.override && (
    page.status === "NEEDS_REVIEW" ||
    page.status === "FAILED"
  );
}

function pageNeedsInspection(page: AuditPage) {
  return !page.override && (
    page.status === "NEEDS_REVIEW" ||
    page.status === "FAILED"
  );
}

async function fetchExtractionAudit(documentId: string): Promise<ExtractionAuditResponse> {
  const response = await fetch(`/api/documents/${documentId}/extraction-audit`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Audit extraction indisponible" }));
    throw new Error(error.error ?? "Audit extraction indisponible");
  }
  return response.json();
}

export const DocumentExtractionAuditDialog = memo(function DocumentExtractionAuditDialog({
  open,
  onOpenChange,
  document,
}: ExtractionAuditDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [reprocessStartedAt, setReprocessStartedAt] = useState<number | null>(null);
  const [retryingPageNumber, setRetryingPageNumber] = useState<number | null>(null);
  const [batchRetryProgress, setBatchRetryProgress] = useState<{ done: number; total: number } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const queryClient = useQueryClient();
  const router = useRouter();
  const auditQueryKey = useMemo(
    () => ["document-extraction-audit", document?.id] as const,
    [document?.id]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: auditQueryKey,
    queryFn: () => fetchExtractionAudit(document?.id ?? ""),
    enabled: open && Boolean(document?.id),
  });

  const audit = data?.data;
  const excelModelAudit = audit?.document.excelModelAudit ?? null;
  const isPdfDocument = audit?.document.mimeType === "application/pdf";
  const pages = useMemo(() => audit?.latestRun?.pages ?? [], [audit?.latestRun?.pages]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPages = useMemo(() => {
    if (!normalizedQuery) return pages;
    return pages.filter((page) => page.extractedText.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, pages]);

  const pageToInspect = useMemo(() => {
    if (selectedPage === null) return filteredPages[0] ?? pages[0] ?? null;
    return pages.find((page) => page.pageNumber === selectedPage) ?? filteredPages[0] ?? null;
  }, [filteredPages, pages, selectedPage]);
  const reviewPages = useMemo(() => pages.filter(pageRequiresDecision), [pages]);
  const inspectionPages = useMemo(() => pages.filter(pageNeedsInspection), [pages]);
  const reviewPageToInspect = useMemo(() => {
    if (reviewPages.length === 0) return null;
    return reviewPages.find((page) => page.pageNumber === selectedPage) ?? reviewPages[0];
  }, [reviewPages, selectedPage]);
  const reviewPageIndex = reviewPageToInspect
    ? reviewPages.findIndex((page) => page.pageNumber === reviewPageToInspect.pageNumber)
    : -1;

  const copyCorpus = async () => {
    if (!audit?.corpus.text) return;
    await navigator.clipboard.writeText(audit.corpus.text);
    toast.success("Corpus extrait copie");
  };

  const decisionMutation = useMutation({
    mutationFn: async (params: ExtractionDecisionParams) => {
      if (!document || !audit?.latestRun) throw new Error("Extraction run indisponible");
      const response = await fetch(`/api/documents/${document.id}/extraction-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: audit.latestRun.id,
          pageNumber: params.pageNumber,
          action: params.action,
          reason: params.reason,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Decision impossible" }));
        throw new Error(error.error ?? "Decision impossible");
      }
      return response.json();
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: auditQueryKey });
      const previousAudit = queryClient.getQueryData<ExtractionAuditResponse>(auditQueryKey);
      const optimisticOverride = {
        id: `optimistic-${params.pageNumber}-${params.action}`,
        pageNumber: params.pageNumber,
        overrideType: params.action,
        reason: params.reason,
        approvedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<ExtractionAuditResponse>(auditQueryKey, (current) => {
        if (!current?.data.latestRun) return current;
        return {
          ...current,
          data: {
            ...current.data,
            latestRun: {
              ...current.data.latestRun,
              pages: current.data.latestRun.pages.map((page) => (
                page.pageNumber === params.pageNumber
                  ? { ...page, override: optimisticOverride }
                  : page
              )),
              overrides: [
                optimisticOverride,
                ...current.data.latestRun.overrides.filter(
                  (override) => override.pageNumber !== params.pageNumber
                ),
              ],
            },
          },
        };
      });

      return { previousAudit };
    },
    onSuccess: () => {
      toast.success("Decision enregistree");
    },
    onError: (error: Error, _params, context) => {
      if (context?.previousAudit) {
        queryClient.setQueryData(auditQueryKey, context.previousAudit);
      }
      toast.error(error.message);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: auditQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["deal-document-readiness"] }),
      ]);
      router.refresh();
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async () => {
      if (!document) throw new Error("Document indisponible");
      const response = await fetch(`/api/documents/${document.id}/process`, { method: "POST" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Relance extraction impossible" }));
        throw new Error(error.error ?? "Relance extraction impossible");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Extraction renforcee terminee");
      queryClient.invalidateQueries({ queryKey: ["document-extraction-audit", document?.id] });
      queryClient.invalidateQueries({ queryKey: ["deal-document-readiness"] });
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      setReprocessStartedAt(null);
      setElapsedSeconds(0);
    },
  });

  const pageRetryMutation = useMutation({
    mutationFn: async (params: PageRetryParams) => {
      if (!document) throw new Error("Document indisponible");
      const response = await fetch(
        `/api/documents/${document.id}/extraction-pages/${params.pageNumber}/retry`,
        { method: "POST" }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Retry page impossible" }));
        throw new Error(error.error ?? "Retry page impossible");
      }
      return response.json();
    },
    onSuccess: (_data, params) => {
      toast.success(`Page ${params.pageNumber} retraitee`);
      queryClient.invalidateQueries({ queryKey: auditQueryKey });
      queryClient.invalidateQueries({ queryKey: ["deal-document-readiness"] });
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      setRetryingPageNumber(null);
      setReprocessStartedAt(null);
      setElapsedSeconds(0);
    },
  });

  const batchRetryMutation = useMutation({
    mutationFn: async (pagesToRetry: AuditPage[]) => {
      if (!document) throw new Error("Document indisponible");
      setBatchRetryProgress({ done: 0, total: pagesToRetry.length });
      for (const [index, page] of pagesToRetry.entries()) {
        setRetryingPageNumber(page.pageNumber);
        const response = await fetch(
          `/api/documents/${document.id}/extraction-pages/${page.pageNumber}/retry`,
          { method: "POST" }
        );
        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: `Retry page ${page.pageNumber} impossible` }));
          throw new Error(error.error ?? `Retry page ${page.pageNumber} impossible`);
        }
        setBatchRetryProgress({ done: index + 1, total: pagesToRetry.length });
        await queryClient.invalidateQueries({ queryKey: auditQueryKey });
      }
    },
    onSuccess: async () => {
      toast.success("Pages retraitees");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: auditQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["deal-document-readiness"] }),
      ]);
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      setRetryingPageNumber(null);
      setBatchRetryProgress(null);
      setReprocessStartedAt(null);
      setElapsedSeconds(0);
    },
  });

  const extractionActionPending = reprocessMutation.isPending || pageRetryMutation.isPending || batchRetryMutation.isPending;

  useEffect(() => {
    if (!extractionActionPending || !reprocessStartedAt) return;

    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - reprocessStartedAt) / 1000)));
    };
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [extractionActionPending, reprocessStartedAt]);

  useEffect(() => {
    if (!extractionActionPending) return;
    const intervalId = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: auditQueryKey });
    }, 1500);
    return () => window.clearInterval(intervalId);
  }, [auditQueryKey, extractionActionPending, queryClient]);

  const backendProgress = useMemo(() => {
    const run = audit?.latestRun;
    if (!run || run.pageCount <= 0) return null;
    const percent = Math.min(99, Math.max(1, Math.round((run.pagesProcessed / run.pageCount) * 100)));
    return {
      percent,
      label: `${run.pagesProcessed}/${run.pageCount} pages`,
      status: run.status,
    };
  }, [audit?.latestRun]);

  const estimatedReprocessProgress = useMemo(() => {
    if (backendProgress) return backendProgress.percent;
    if (batchRetryMutation.isPending && batchRetryProgress && batchRetryProgress.total > 0) {
      return Math.min(95, Math.max(5, Math.round((batchRetryProgress.done / batchRetryProgress.total) * 100)));
    }
    if (pageRetryMutation.isPending) {
      return Math.min(95, Math.max(12, Math.round((elapsedSeconds / 25) * 100)));
    }
    const pageCount = audit?.latestRun?.pageCount ?? audit?.corpus.parsedPages ?? 1;
    const expectedSeconds = Math.max(45, pageCount * 4);
    return Math.min(95, Math.max(8, Math.round((elapsedSeconds / expectedSeconds) * 100)));
  }, [audit?.corpus.parsedPages, audit?.latestRun?.pageCount, backendProgress, elapsedSeconds, pageRetryMutation.isPending, batchRetryMutation.isPending, batchRetryProgress]);

  const startReprocess = () => {
    setReprocessStartedAt(Date.now());
    setElapsedSeconds(0);
    reprocessMutation.mutate();
  };

  const startPageRetry = (page: AuditPage) => {
    setRetryingPageNumber(page.pageNumber);
    setReprocessStartedAt(Date.now());
    setElapsedSeconds(0);
    pageRetryMutation.mutate({ pageNumber: page.pageNumber });
  };

  const startReviewPagesRetry = () => {
    const retryable = reviewPages.filter((page) => (
      page.status === "FAILED" ||
      page.status === "NEEDS_REVIEW" ||
      page.evidenceSummary?.missingExpectedStructure ||
      (page.visualRiskScore ?? 0) >= 55
    ));
    if (retryable.length === 0) return;
    setReprocessStartedAt(Date.now());
    setElapsedSeconds(0);
    batchRetryMutation.mutate(retryable);
  };

  const handleDecision = (
    page: AuditPage,
    action: ExtractionDecisionAction
  ) => {
    decisionMutation.mutate({
      pageNumber: page.pageNumber,
      action,
      reason: action === "EXCLUDE_PAGE"
        ? `System decision: page ${page.pageNumber} excluded after user review in extraction audit.`
        : `System decision: page ${page.pageNumber} approved after user review in extraction audit.`,
    });
  };

  const goToReviewPage = (direction: -1 | 1) => {
    if (reviewPages.length === 0 || reviewPageIndex < 0) return;
    const nextIndex = (reviewPageIndex + direction + reviewPages.length) % reviewPages.length;
    setSelectedPage(reviewPages[nextIndex].pageNumber);
  };

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!fixed !left-1/2 !top-1/2 !translate-x-[-50%] !translate-y-[-50%] relative flex flex-col gap-0 overflow-hidden p-0"
        style={{
          width: "min(1040px, calc(100vw - 48px))",
          maxWidth: "min(1040px, calc(100vw - 48px))",
          height: "min(760px, calc(100dvh - 48px))",
          maxHeight: "calc(100dvh - 48px)",
        }}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
              <FileSearch className="h-5 w-5 shrink-0" />
              <span className="truncate">Audit extraction - {document.name}</span>
            </DialogTitle>
            {audit?.corpus.text && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startReprocess}
                  disabled={extractionActionPending}
                  className="w-fit"
                >
                  {reprocessMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSearch className="mr-2 h-4 w-4" />
                  )}
                  Relancer extraction renforcee
                </Button>
                <Button variant="outline" size="sm" onClick={copyCorpus} className="w-fit">
                  <Clipboard className="mr-2 h-4 w-4" />
                  Copier le corpus
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          {isLoading && (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Chargement audit extraction
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error instanceof Error ? error.message : "Audit extraction indisponible"}
            </div>
          )}

          {audit && !isLoading && (
            <div className="flex h-full min-h-0 flex-col gap-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <Metric label="Statut" value={audit.latestRun?.status ?? audit.document.processingStatus} />
                <Metric label="Couverture" value={audit.latestRun ? `${audit.latestRun.pagesProcessed}/${audit.latestRun.pageCount}` : "Legacy"} />
                <Metric label="Qualite" value={audit.document.extractionQuality === null ? "N/A" : `${audit.document.extractionQuality}%`} />
                <Metric label="Corpus" value={`${audit.corpus.wordCount} mots`} />
                <Metric
                  label="Extraction"
                  value={audit.latestRun?.creditEstimate
                    ? `${audit.latestRun.creditEstimate.estimatedCredits} credits`
                    : audit.latestRun?.corpusTextHash?.slice(0, 10) ?? "N/A"}
                />
              </div>

              {audit.latestRun?.creditEstimate && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Plan qualite</span>
                  {Object.entries(audit.latestRun.creditEstimate.pagesByTier).map(([tier, count]) => (
                    Number(count) > 0 ? (
                      <Badge key={tier} variant="outline" className="bg-background">
                        {formatTierLabel(tier)}: {count}
                      </Badge>
                    ) : null
                  ))}
                  <span>
                    Estime: {audit.latestRun.creditEstimate.estimatedCredits} credit
                    {audit.latestRun.creditEstimate.estimatedCredits > 1 ? "s" : ""} extraction
                  </span>
                </div>
              )}

              {audit.latestRun?.blockedReason && (
                <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p className="font-medium">{audit.latestRun.blockedReason}</p>
                  <p>
                    Couverture complete, mais certaines pages restent a faible extraction. Relance l&apos;extraction
                    renforcee, inspecte la page, puis approuve-la uniquement si le texte est suffisant, ou
                    exclue-la si elle n&apos;a pas de valeur analytique.
                  </p>
                </div>
              )}

              <Tabs defaultValue="pages" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="max-w-full overflow-x-auto">
                  <TabsTrigger value="pages">Pages</TabsTrigger>
                  <TabsTrigger value="corpus">Corpus complet</TabsTrigger>
                  {excelModelAudit && <TabsTrigger value="model">Audit modele</TabsTrigger>}
                  <TabsTrigger
                    value="review"
                    onClick={() => {
                      if (reviewPages.length > 0) setSelectedPage(reviewPages[0].pageNumber);
                    }}
                  >
                    A traiter{reviewPages.length > 0 ? ` (${reviewPages.length})` : ""}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="pages" className="min-h-0 flex-1 overflow-y-auto">
                  <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
                    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Rechercher dans le texte extrait"
                          className="pl-9"
                        />
                      </div>

                      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                        {filteredPages.map((page) => (
                          <button
                            key={page.id}
                            onClick={() => setSelectedPage(page.pageNumber)}
                            className={cn(
                              "w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/60",
                              pageToInspect?.pageNumber === page.pageNumber && "border-primary bg-primary/5"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">Page {page.pageNumber}</span>
                              {page.override ? (
                                <Badge className="bg-green-100 text-green-700">
                                  <CheckCircle className="mr-1 h-3 w-3" />
                                  Decision
                                </Badge>
                              ) : (
                                <PageStatusBadge status={page.status} />
                              )}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {page.extractionTier ? formatTierLabel(page.extractionTier) : page.method}
                              {" - "}
                              {page.wordCount} mots - {page.charCount} caracteres
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {page.hasFinancialKeywords && <MiniBadge label="finance" />}
                              {page.hasMarketKeywords && <MiniBadge label="marche" />}
                              {page.hasTeamKeywords && <MiniBadge label="team" />}
                              {page.hasTables && <MiniBadge label="table" />}
                              {page.hasCharts && <MiniBadge label="chart" />}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col gap-3">
                      {pageToInspect ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">Page {pageToInspect.pageNumber}</p>
                              <p className="text-sm text-muted-foreground">
                                Score {pageToInspect.qualityScore ?? "N/A"} - {pageToInspect.method}
                                {pageToInspect.extractionTier ? ` - ${formatTierLabel(pageToInspect.extractionTier)}` : ""}
                              </p>
                            </div>
                            {pageToInspect.override ? (
                              <Badge className="bg-green-100 text-green-700">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Decision enregistree
                              </Badge>
                            ) : (
                              <PageStatusBadge status={pageToInspect.status} />
                            )}
                          </div>
                          {pageToInspect.errorMessage && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                              {pageToInspect.errorMessage}
                            </div>
                          )}
                          {pageToInspect.visualRiskScore !== null && pageToInspect.visualRiskScore >= 55 && (
                            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">Risque visuel {pageToInspect.visualRiskScore}/100</span>
                                {pageToInspect.extractionTier && (
                                  <Badge variant="outline">{formatTierLabel(pageToInspect.extractionTier)}</Badge>
                                )}
                                {pageToInspect.semanticAssessment?.pageClass && (
                                  <Badge variant="outline">{formatPageClassLabel(pageToInspect.semanticAssessment.pageClass)}</Badge>
                                )}
                                {pageToInspect.semanticAssessment?.structureDependency && (
                                  <Badge variant="outline">Structure {pageToInspect.semanticAssessment.structureDependency}</Badge>
                                )}
                                {pageToInspect.semanticAssessment?.semanticSufficiency && (
                                  <Badge variant="outline">Fidelite {pageToInspect.semanticAssessment.semanticSufficiency}</Badge>
                                )}
                                {typeof pageToInspect.semanticAssessment?.analyticalValueScore === "number" && (
                                  <Badge variant="outline">Valeur {pageToInspect.semanticAssessment.analyticalValueScore}/100</Badge>
                                )}
                                {typeof pageToInspect.semanticAssessment?.visualNoiseScore === "number" && (
                                  <Badge variant="outline">Bruit {pageToInspect.semanticAssessment.visualNoiseScore}/100</Badge>
                                )}
                              </div>
                              {pageToInspect.visualRiskReasons.length > 0 && (
                                <p className="mt-1 text-muted-foreground">
                                  {pageToInspect.visualRiskReasons.join(", ")}
                                </p>
                              )}
                              {pageToInspect.semanticAssessment?.rationale && pageToInspect.semanticAssessment.rationale.length > 0 && (
                                <p className="mt-1 text-muted-foreground">
                                  {pageToInspect.semanticAssessment.rationale.join(", ")}
                                </p>
                              )}
                            </div>
                          )}
                          {pageNeedsInspection(pageToInspect) && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium text-amber-900">
                                  Decision disponible
                                </p>
                                {reviewPages.length > 1 && (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => goToReviewPage(-1)}
                                      disabled={decisionMutation.isPending}
                                      className="h-7 px-2"
                                    >
                                      <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="px-2 text-xs text-amber-800">
                                      {reviewPageIndex >= 0 ? reviewPageIndex + 1 : 1}/{reviewPages.length}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => goToReviewPage(1)}
                                      disabled={decisionMutation.isPending}
                                      className="h-7 px-2"
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-amber-800">
                                Si le texte ci-dessous couvre correctement la page, approuve-la.
                                Sinon, retente l&apos;extraction ou re-uploade un PDF plus lisible.
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(pageToInspect.status === "FAILED" || pageToInspect.status === "NEEDS_REVIEW") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => startPageRetry(pageToInspect)}
                                    disabled={extractionActionPending}
                                  >
                                    {pageRetryMutation.isPending && retryingPageNumber === pageToInspect.pageNumber && (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Retenter cette page
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDecision(pageToInspect, "BYPASS_PAGE")}
                                  disabled={decisionMutation.isPending}
                                >
                                  Approuver apres inspection
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDecision(pageToInspect, "EXCLUDE_PAGE")}
                                  disabled={decisionMutation.isPending}
                                >
                                  Exclure cette page
                                </Button>
                              </div>
                            </div>
                          )}
                          {pageToInspect.artifact && (
                            <ArtifactSummary
                              page={pageToInspect}
                              documentId={audit.document.id}
                              documentName={audit.document.name}
                              isPdf={isPdfDocument}
                            />
                          )}
                          {!pageToInspect.blocksAnalysis && pageNeedsInspection(pageToInspect) && !pageToInspect.override && (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                              <p className="font-medium">Inspection recommandee, non bloquante</p>
                              <p className="mt-1">
                                La page merite un spot-check humain, mais elle ne bloque pas l&apos;analyse car le texte extrait parait suffisant.
                              </p>
                            </div>
                          )}
                          {pageToInspect.override && (
                            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                              <p className="font-medium">
                                {pageToInspect.override.overrideType === "EXCLUDE_PAGE"
                                  ? "Page exclue de l'analyse"
                                  : "Page approuvee pour l'analyse"}
                              </p>
                              <p className="mt-1">
                                Decision tracee. La page ne bloque plus le lancement de l&apos;analyse.
                              </p>
                            </div>
                          )}
                          <div className="min-h-[300px] flex-1 rounded-lg border">
                            <Textarea
                              readOnly
                              value={pageToInspect.extractedText}
                              className="h-full min-h-[300px] overflow-y-auto resize-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-lg border text-sm text-muted-foreground">
                          Aucune page extraite
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="corpus" className="min-h-0 flex-1 overflow-y-auto">
                  <div className="h-full min-h-[420px] rounded-lg border">
                    <Textarea
                      readOnly
                      value={audit.corpus.text}
                      className="h-full min-h-[420px] overflow-y-auto resize-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
                    />
                  </div>
                </TabsContent>

                {excelModelAudit && (
                  <TabsContent value="model" className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <ExcelModelAuditPanel audit={excelModelAudit} />
                  </TabsContent>
                )}

                <TabsContent value="review" className="min-h-0 flex-1 overflow-y-auto">
                  {reviewPages.length > 0 && reviewPageToInspect ? (
                    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
                      <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
                        {reviewPages.map((page) => (
                          <button
                            key={page.id}
                            onClick={() => setSelectedPage(page.pageNumber)}
                            className={cn(
                              "w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/60",
                              reviewPageToInspect.pageNumber === page.pageNumber && "border-primary bg-primary/5"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">Page {page.pageNumber}</span>
                              <PageStatusBadge status={page.status} />
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {page.extractionTier ? formatTierLabel(page.extractionTier) : page.method}
                              {" - "}
                              {page.wordCount} mots - {page.charCount} caracteres
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {page.hasFinancialKeywords && <MiniBadge label="finance" />}
                              {page.hasMarketKeywords && <MiniBadge label="marche" />}
                              {page.hasTeamKeywords && <MiniBadge label="team" />}
                              {page.hasTables && <MiniBadge label="table" />}
                              {page.hasCharts && <MiniBadge label="chart" />}
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">Page {reviewPageToInspect.pageNumber}</p>
                            <p className="text-sm text-muted-foreground">
                              {reviewPageIndex + 1}/{reviewPages.length} a traiter - {reviewPageToInspect.extractionTier ? formatTierLabel(reviewPageToInspect.extractionTier) : reviewPageToInspect.method}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => goToReviewPage(-1)}
                              disabled={decisionMutation.isPending || reviewPages.length < 2}
                            >
                              <ChevronLeft className="mr-1 h-4 w-4" />
                              Precedente
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => goToReviewPage(1)}
                              disabled={decisionMutation.isPending || reviewPages.length < 2}
                            >
                              Suivante
                              <ChevronRight className="ml-1 h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium text-amber-900">Decision requise</p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={startReviewPagesRetry}
                              disabled={extractionActionPending}
                              className="bg-background"
                            >
                              {batchRetryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Retenter toutes ({reviewPages.length * 2} credits max)
                            </Button>
                          </div>
                          <p className="mt-1 text-sm text-amber-800">
                            Approuve uniquement si l&apos;extraction couvre correctement la page.
                            Sinon, exclue la page ou relance l&apos;extraction renforcee.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(reviewPageToInspect.status === "FAILED" || reviewPageToInspect.status === "NEEDS_REVIEW") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startPageRetry(reviewPageToInspect)}
                                disabled={extractionActionPending}
                              >
                                {pageRetryMutation.isPending && retryingPageNumber === reviewPageToInspect.pageNumber && (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Retenter cette page
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDecision(reviewPageToInspect, "BYPASS_PAGE")}
                              disabled={decisionMutation.isPending}
                            >
                              Approuver apres inspection
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDecision(reviewPageToInspect, "EXCLUDE_PAGE")}
                              disabled={decisionMutation.isPending}
                            >
                              Exclure cette page
                            </Button>
                          </div>
                        </div>

                        {reviewPageToInspect.visualRiskScore !== null && reviewPageToInspect.visualRiskScore >= 55 && (
                          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">Risque visuel {reviewPageToInspect.visualRiskScore}/100</span>
                              {reviewPageToInspect.extractionTier && (
                                <Badge variant="outline">{formatTierLabel(reviewPageToInspect.extractionTier)}</Badge>
                              )}
                            </div>
                            {reviewPageToInspect.visualRiskReasons.length > 0 && (
                              <p className="mt-1 text-muted-foreground">
                                {reviewPageToInspect.visualRiskReasons.join(", ")}
                              </p>
                            )}
                          </div>
                        )}

                        {reviewPageToInspect.artifact && (
                          <ArtifactSummary
                            page={reviewPageToInspect}
                            documentId={audit.document.id}
                            documentName={audit.document.name}
                            isPdf={isPdfDocument}
                          />
                        )}

                        <div className="min-h-[300px] flex-1 rounded-lg border">
                          <Textarea
                            readOnly
                            value={reviewPageToInspect.extractedText}
                            className="h-full min-h-[300px] overflow-y-auto resize-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                      {inspectionPages.length > 0
                        ? "Aucune page ne bloque l'analyse. Les pages restantes peuvent etre inspectees depuis l'onglet Pages."
                        : "Aucune page ne necessite de decision."}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        {extractionActionPending && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/85 p-6 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg">
              <div className="flex items-start gap-3">
                <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {pageRetryMutation.isPending && retryingPageNumber
                      ? `Retry page ${retryingPageNumber} en cours`
                      : batchRetryMutation.isPending
                        ? "Retry cible multi-pages en cours"
                      : "Extraction renforcee en cours"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {batchRetryMutation.isPending && batchRetryProgress
                      ? `Page ${batchRetryProgress.done}/${batchRetryProgress.total}. Chaque page est retraitee en OCR supreme avec debit idempotent.`
                      : pageRetryMutation.isPending
                      ? "OCR supreme cible sur une seule page. Le reste du document n'est pas retraite."
                      : "Analyse visuelle, OCR haute fidelite et reconstruction des pages complexes."}
                    {" "}Temps ecoule: {formatElapsed(elapsedSeconds)}.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{backendProgress ? "Progression backend" : "Progression estimee"}</span>
                  <span>{estimatedReprocessProgress}%</span>
                </div>
                <Progress value={estimatedReprocessProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {backendProgress
                    ? `${backendProgress.label} traitees. Statut: ${backendProgress.status}.`
                    : pageRetryMutation.isPending
                    ? "Cette operation ne relance pas les autres pages du document."
                    : "En attente du premier evenement backend. Les pages OCR apparaitront ici au fil du traitement."}
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}

function PageStatusBadge({ status }: { status: AuditPage["status"] }) {
  if (status === "READY") {
    return (
      <Badge className="bg-green-100 text-green-700">
        <CheckCircle className="mr-1 h-3 w-3" />
        OK
      </Badge>
    );
  }
  if (status === "READY_WITH_WARNINGS") {
    return (
      <Badge className="bg-amber-100 text-amber-700">
        <AlertTriangle className="mr-1 h-3 w-3" />
        Warning
      </Badge>
    );
  }
  if (status === "FAILED") {
    return (
      <Badge variant="destructive">
        <XCircle className="mr-1 h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}

function MiniBadge({ label }: { label: string }) {
  return (
    <span className="rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}

function ArtifactSummary({
  page,
  documentId,
  documentName,
  isPdf,
}: {
  page: AuditPage;
  documentId: string;
  documentName: string;
  isPdf: boolean;
}) {
  const artifact = page.artifact;
  const summary = page.evidenceSummary;
  const provider = page.provider;
  const verification = page.verification;
  if (!artifact) return null;
  const visualCount = summary?.visualBlocks ?? artifact.visualBlocks?.length ?? 0;
  const tableCount = summary?.tables ?? artifact.tables?.length ?? 0;
  const chartCount = summary?.charts ?? artifact.charts?.length ?? 0;
  const unreadableCount = summary?.unreadableRegions ?? artifact.unreadableRegions?.length ?? 0;
  const numericClaimCount = summary?.numericClaims ?? artifact.numericClaims?.length ?? 0;

  if (visualCount + tableCount + chartCount + unreadableCount + numericClaimCount === 0 && !artifact.confidence) {
    return null;
  }

  const previewImageUrl = isPdf
    ? `/api/documents/${documentId}/preview-pages/${page.pageNumber}${
        page.pageImageHash ? `?v=${encodeURIComponent(page.pageImageHash)}` : ""
      }`
    : null;
  const pageUrl = isPdf
    ? `/api/documents/${documentId}/download?disposition=inline#page=${page.pageNumber}&toolbar=0&navpanes=0&zoom=page-fit`
    : null;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Preuves extraites</span>
        {(summary?.confidence ?? artifact.confidence) && (
          <Badge variant="outline">Confiance {summary?.confidence ?? artifact.confidence}</Badge>
        )}
        {provider?.kind && <Badge variant="outline">Provider {provider.kind}</Badge>}
        {provider?.modelId && <Badge variant="outline">{provider.modelId}</Badge>}
        {verification?.state && <Badge variant="outline">Verification {verification.state}</Badge>}
        {(summary?.needsHumanReview || artifact.needsHumanReview) && <Badge className="bg-amber-100 text-amber-700">Review</Badge>}
        {summary?.missingExpectedStructure && <Badge variant="destructive">Structure manquante</Badge>}
      </div>
      {previewImageUrl && (
        <div className="mt-3 overflow-hidden rounded-lg border bg-background">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Page source</p>
              <p className="text-xs text-muted-foreground">PDF original, page {page.pageNumber}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(previewImageUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Ouvrir l'image
              </Button>
              {pageUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(pageUrl, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ouvrir la page
                </Button>
              )}
            </div>
          </div>
          <div className="max-h-[520px] overflow-auto bg-muted/20 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImageUrl}
              alt={`${documentName} - page ${page.pageNumber}`}
              className="mx-auto h-auto max-w-full rounded border bg-background shadow-sm"
            />
          </div>
        </div>
      )}
      {summary?.recommendedAction && summary.recommendedAction !== "NONE" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Action recommandee: {formatRecommendedAction(summary.recommendedAction)}
        </p>
      )}
      {summary && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Completude artefact</span>
            <span>{summary.artifactCompleteness}%</span>
          </div>
          <Progress value={summary.artifactCompleteness} className="h-1.5" />
          {summary.expectedVisualBlocks > 0 && (
            <p className="text-xs text-muted-foreground">
              Blocs attendus/extraits: {summary.expectedVisualBlocks}/{summary.extractedVisualBlocks}
            </p>
          )}
          {summary.missingVisualEvidence.length > 0 && (
            <p className="text-xs text-amber-800">
              Manquant: {summary.missingVisualEvidence.join(", ")}
            </p>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {visualCount > 0 && <MiniBadge label={`${visualCount} bloc${visualCount > 1 ? "s" : ""}`} />}
        {tableCount > 0 && <MiniBadge label={`${tableCount} table${tableCount > 1 ? "s" : ""}`} />}
        {chartCount > 0 && <MiniBadge label={`${chartCount} chart${chartCount > 1 ? "s" : ""}`} />}
        {numericClaimCount > 0 && <MiniBadge label={`${numericClaimCount} chiffre${numericClaimCount > 1 ? "s" : ""}`} />}
        {unreadableCount > 0 && <MiniBadge label={`${unreadableCount} zone${unreadableCount > 1 ? "s" : ""} a revoir`} />}
      </div>
      {artifact.charts?.[0]?.description && (
        <p className="mt-2 text-muted-foreground">{artifact.charts[0].description}</p>
      )}
      {artifact.unreadableRegions?.[0]?.reason && (
        <p className="mt-2 text-amber-800">{artifact.unreadableRegions[0].reason}</p>
      )}
      {(verification?.issues?.length ?? 0) > 0 && (
        <p className="mt-2 text-xs text-amber-800">
          Verification issues: {verification?.issues?.slice(0, 3).join(", ")}
        </p>
      )}
      {(verification?.evidence?.length ?? 0) > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Evidence: {verification?.evidence?.slice(0, 3).join(", ")}
        </p>
      )}
    </div>
  );
}

function formatRecommendedAction(action: NonNullable<AuditPage["evidenceSummary"]>["recommendedAction"]) {
  switch (action) {
    case "RETRY_PAGE":
      return "retenter uniquement cette page";
    case "RETRY_OR_REVIEW_PAGE":
      return "retenter la page ou inspecter avant approbation";
    case "REVIEW_PAGE":
      return "inspection humaine requise";
    default:
      return "aucune action";
  }
}

function ExcelModelAuditPanel({ audit }: { audit: ExcelModelAuditPayload }) {
  const workbookAudit = audit.workbookAudit;
  const intelligence = audit.modelIntelligence;
  const financialAudit = audit.financialAudit;
  const analystReport = extractAnalystReport(audit.analystReport);
  const analystCost = extractAnalystCost(audit.analystReport);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Risque modele" value={formatExcelRisk(financialAudit?.overallRisk)} />
        <Metric label="Drivers" value={String(intelligence?.drivers?.count ?? 0)} />
        <Metric label="Outputs" value={String(intelligence?.outputs?.count ?? 0)} />
        <Metric label="Hardcodes critiques" value={String(intelligence?.hardcodes?.highSeverityCount ?? 0)} />
      </div>

      {workbookAudit && (
        <section className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">Workbook Map</h3>
            {workbookAudit.warningFlags?.map((flag) => (
              <Badge key={flag} variant="outline">{formatFlagLabel(flag)}</Badge>
            ))}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SignalList title="Assumption sheets" items={workbookAudit.assumptionSheets ?? []} />
            <SignalList title="Output sheets" items={workbookAudit.outputSheets ?? []} />
            <SignalList title="Calc sheets" items={workbookAudit.calcSheets ?? []} />
            <SignalList title="Hidden sheets" items={workbookAudit.hiddenSheets ?? []} />
          </div>
          {intelligence?.workbookMap?.roles && intelligence.workbookMap.roles.length > 0 && (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Roles de feuilles</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {intelligence.workbookMap.roles.slice(0, 16).map((role) => (
                  <div key={role.name} className="rounded border bg-background p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{role.name}</span>
                      <Badge variant="outline">{role.role}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {role.classification} · densite formules {Math.round(role.formulaDensity * 100)}%
                      {role.hidden ? " · hidden" : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {financialAudit && (
        <section className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">Financial Audit</h3>
            <Badge variant="outline">Overall risk: {formatExcelRisk(financialAudit.overallRisk)}</Badge>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <FlagGroup title="Consistency" flags={financialAudit.consistencyFlags} />
            <FlagGroup title="Reconciliation" flags={financialAudit.reconciliationFlags} />
            <FlagGroup title="Plausibility" flags={financialAudit.plausibilityFlags} />
            <FlagGroup title="Heroic assumptions" flags={financialAudit.heroicAssumptionFlags} />
            <FlagGroup title="Dependencies" flags={financialAudit.dependencyFlags} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <SimpleListCard
              title="Key metrics"
              items={(financialAudit.keyMetrics ?? []).slice(0, 12).map((metric) => (
                `${metric.sheet}: ${metric.label} = ${metric.value}`
              ))}
              emptyLabel="Aucune metrique critique detectee"
            />
            <SimpleListCard
              title="Top sensitivities"
              items={(financialAudit.topSensitivities ?? []).slice(0, 12).map((item) => (
                `${item.sensitivity.toUpperCase()} · ${item.driver} — ${item.reason}`
              ))}
              emptyLabel="Aucune sensibilite prioritaire detectee"
            />
          </div>
          {(financialAudit.greenFlags?.length ?? 0) > 0 && (
            <div className="mt-3">
              <FlagGroup title="Green flags" flags={financialAudit.greenFlags} />
            </div>
          )}
        </section>
      )}

      {intelligence && (
        <section className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">Model Intelligence</h3>
            {intelligence.warnings?.map((flag) => (
              <Badge key={flag} variant="outline">{formatFlagLabel(flag)}</Badge>
            ))}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <SimpleListCard
              title="Top drivers"
              items={(intelligence.drivers?.top ?? []).slice(0, 12).map((driver) => (
                `${driver.sheet}!${driver.cell} ${driver.label} = ${driver.value} (${driver.kind})`
              ))}
              emptyLabel="Aucun driver manuel saillant"
            />
            <SimpleListCard
              title="Top outputs"
              items={(intelligence.outputs?.top ?? []).slice(0, 12).map((output) => (
                `${output.sheet}!${output.cell} ${output.label} = ${output.value}`
              ))}
              emptyLabel="Aucun output saillant"
            />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <SimpleListCard
              title="Hardcodes a challenger"
              items={(intelligence.hardcodes?.top ?? []).slice(0, 12).map((signal) => (
                `${signal.severity.toUpperCase()} · ${signal.sheet}!${signal.cell} ${signal.label} = ${signal.value} — ${signal.reason}`
              ))}
              emptyLabel="Aucun hardcode saillant"
            />
            <SimpleListCard
              title="Hidden / disconnected structures"
              items={[
                ...(intelligence.hiddenStructures ?? []).slice(0, 8).map((signal) => (
                  `${signal.type} · ${signal.sheet}${signal.index ? `#${signal.index}` : ""} — ${signal.reason}`
                )),
                ...(intelligence.disconnectedCalcs ?? []).slice(0, 8).map((signal) => (
                  `disconnected · ${signal.sheet}!${signal.cell} — ${signal.reason}`
                )),
              ]}
              emptyLabel="Aucune structure masquee ou deconnectee"
            />
          </div>
          {(intelligence.criticalDependencies?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Critical dependencies</p>
              <div className="mt-2 space-y-2 text-xs">
                {intelligence.criticalDependencies?.slice(0, 10).map((dependency) => (
                  <div key={dependency.output} className="rounded border bg-background p-2">
                    <p className="font-medium">{dependency.output}</p>
                    <p className="mt-1 text-muted-foreground">
                      precedents={dependency.precedentCount} · hardcoded={dependency.hardcodedPrecedentCount} · cross-sheet={dependency.crossSheetPrecedentCount}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {analystReport && (
        <section className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">LLM Analyst Layer</h3>
            <Badge variant="outline">Confidence: {analystReport.confidence}</Badge>
            {typeof analystCost === "number" && (
              <Badge variant="outline">Cost: ${analystCost.toFixed(4)}</Badge>
            )}
          </div>
          <p className="mt-3 text-sm">{analystReport.executiveSummary}</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <SimpleListCard title="Top red flags" items={analystReport.topRedFlags} emptyLabel="Aucun red flag remonte" />
            <SimpleListCard title="Top green flags" items={analystReport.topGreenFlags} emptyLabel="Aucun green flag remonte" />
            <SimpleListCard title="Key questions" items={analystReport.keyQuestions} emptyLabel="Aucune question prioritaire" />
            <SimpleListCard title="Priority checks" items={analystReport.priorityChecks} emptyLabel="Aucun check prioritaire" />
          </div>
          {(analystReport.reasoningNotes?.length ?? 0) > 0 && (
            <div className="mt-3">
              <SimpleListCard title="Reasoning notes" items={analystReport.reasoningNotes} emptyLabel="Aucune note supplementaire" />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function FlagGroup({ title, flags }: { title: string; flags?: ExcelFinancialAuditFlag[] }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-2 space-y-2">
        {(flags ?? []).length > 0 ? (
          flags!.slice(0, 8).map((flag, index) => (
            <div key={`${flag.title}-${index}`} className="rounded border bg-background p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={flag.severity === "critical" || flag.severity === "high" ? "destructive" : "outline"}>
                  {flag.severity}
                </Badge>
                <span className="font-medium">{flag.title}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{flag.message}</p>
              {flag.evidence.length > 0 && (
                <p className="mt-1 text-muted-foreground">
                  {flag.evidence.slice(0, 3).join(" · ")}
                </p>
              )}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">Aucun signal remonte.</p>
        )}
      </div>
    </div>
  );
}

function SignalList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-sm font-medium">{title}</p>
      {items.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.slice(0, 12).map((item) => (
            <Badge key={item} variant="outline">{item}</Badge>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Aucun element detecte.</p>
      )}
    </div>
  );
}

function SimpleListCard({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-sm font-medium">{title}</p>
      {items.length > 0 ? (
        <div className="mt-2 space-y-2 text-xs">
          {items.map((item, index) => (
            <div key={`${title}-${index}-${item.slice(0, 24)}`} className="rounded border bg-background p-2">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

function extractAnalystReport(
  analystReport: ExcelModelAuditPayload["analystReport"]
): ExcelAnalystReport | null {
  if (!analystReport || typeof analystReport !== "object" || Array.isArray(analystReport)) {
    return null;
  }
  if ("report" in analystReport && analystReport.report && typeof analystReport.report === "object") {
    return analystReport.report as ExcelAnalystReport;
  }
  if ("executiveSummary" in analystReport) {
    return analystReport as ExcelAnalystReport;
  }
  return null;
}

function extractAnalystCost(
  analystReport: ExcelModelAuditPayload["analystReport"]
): number | null {
  if (!analystReport || typeof analystReport !== "object" || Array.isArray(analystReport)) {
    return null;
  }
  if ("cost" in analystReport && typeof analystReport.cost === "number") {
    return analystReport.cost;
  }
  return null;
}

function formatExcelRisk(risk?: string | null) {
  if (!risk) return "N/A";
  return risk.replace(/_/g, " ").toUpperCase();
}

function formatFlagLabel(flag: string) {
  return flag.replace(/_/g, " ");
}

function formatTierLabel(tier: string): string {
  switch (tier) {
    case "native_only":
      return "Native";
    case "standard_ocr":
      return "OCR";
    case "high_fidelity":
      return "High";
    case "supreme":
      return "Supreme";
    default:
      return tier;
  }
}

function formatPageClassLabel(pageClass: string): string {
  switch (pageClass) {
    case "cover_page":
      return "Cover page";
    case "table_of_contents":
      return "Table of contents";
    case "closing_contact":
      return "Closing / contact";
    case "branding_transition":
      return "Branding transition";
    case "decorative":
      return "Decorative";
    case "narrative":
      return "Narrative";
    case "section_divider":
      return "Section divider";
    case "structured_table":
      return "Structured table";
    case "chart_kpi":
      return "Chart / KPI";
    case "asset_tear_sheet":
      return "Asset tear sheet";
    case "mixed_visual_analytics":
      return "Mixed analytics";
    case "org_diagram":
      return "Org diagram";
    case "process_diagram":
      return "Process diagram";
    case "market_map":
      return "Market map";
    case "transaction_terms":
      return "Transaction terms";
    case "legal_dense":
      return "Legal dense";
    default:
      return pageClass;
  }
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
