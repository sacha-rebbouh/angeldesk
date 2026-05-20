"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clipboard,
  Download,
  ExternalLink,
  FileSearch,
  Loader2,
  Pencil,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// B10.2 — direct import (no barrel) so a client component can read the
// flag without pulling in server-only credit-service modules.
import { CHARGE_DOCUMENT_EXTRACTION_CREDITS } from "@/services/credits/feature-flags";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { clerkFetch } from "@/lib/clerk-fetch";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { DocumentMetadataDialog } from "./document-metadata-dialog";
import { DocumentAttachmentsPanel } from "./document-attachments-panel";

interface ExtractionAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    name: string;
    // B6.1 — dealId + sourceDate widened on the prop so the metadata
    // editor can pre-fill the current date and target the right deal
    // for invalidation. Optional to keep callers without the full
    // Document shape backward-compatible (the metadata editor button
    // gates on dealId being present).
    dealId?: string;
    sourceDate?: string | Date | null;
    // B6.2 — type + sourceKind so the metadata editor pre-fills the
    // two new selects with the document's current values. Same
    // optional-for-backward-compat policy.
    type?: string | null;
    sourceKind?: string | null;
    // B6.3 — email metadata for pre-fill in the metadata editor.
    receivedAt?: string | Date | null;
    sourceAuthor?: string | null;
    sourceSubject?: string | null;
  } | null;
  onDocumentUpdated?: (documentId: string) => void | Promise<void>;
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
type AuditPageFilter = "review" | "all" | "warning" | "ok";

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
    page.status === "FAILED" ||
    page.visualRiskReasons.includes("targeted_page_retry")
  );
}

function pageNeedsInspection(page: AuditPage) {
  return !page.override && (
    page.status === "NEEDS_REVIEW" ||
    page.status === "FAILED" ||
    page.visualRiskReasons.includes("targeted_page_retry")
  );
}

function canRetryAuditPage(page: AuditPage) {
  return (
    page.status === "FAILED" ||
    page.status === "NEEDS_REVIEW" ||
    page.evidenceSummary?.missingExpectedStructure ||
    (page.visualRiskScore ?? 0) >= 55
  );
}

async function fetchExtractionAudit(documentId: string): Promise<ExtractionAuditResponse> {
  const response = await clerkFetch(`/api/documents/${documentId}/extraction-audit`);
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
  onDocumentUpdated,
}: ExtractionAuditDialogProps) {
  const documentId = document?.id ?? null;
  const [query, setQuery] = useState("");
  const [pageFilter, setPageFilter] = useState<AuditPageFilter>("review");
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  // B6.1 — open/close state for the metadata editor dialog (sourceDate
  // override). Kept local to the audit dialog because the metadata
  // dialog is contextually scoped to "the doc currently audited".
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [reprocessStartedAt, setReprocessStartedAt] = useState<number | null>(null);
  // Phase 4: /process now returns 202 (enqueued) instead of running the
  // extraction inline. We hold the enqueued run id and poll the audit
  // query until that run reaches a terminal status — only THEN do we
  // surface "terminée".
  const [reprocessRunId, setReprocessRunId] = useState<string | null>(null);
  const [retryingPageNumber, setRetryingPageNumber] = useState<number | null>(null);
  const [batchRetryProgress, setBatchRetryProgress] = useState<{ done: number; total: number } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const queryClient = useQueryClient();
  const auditQueryKey = useMemo(
    () => ["document-extraction-audit", documentId] as const,
    [documentId]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: auditQueryKey,
    queryFn: () => fetchExtractionAudit(documentId ?? ""),
    enabled: open && Boolean(documentId),
    // While a durable extraction is enqueued, poll until the run reaches a
    // terminal status. No interval otherwise (avoids needless traffic).
    refetchInterval: reprocessRunId ? 3000 : false,
  });

  const audit = data?.data;
  const excelModelAudit = audit?.document.excelModelAudit ?? null;
  // B5.3 round 2 — route the middle preview surface by document category
  // (not by "has pageToInspect or not"). The earlier B5.3 fix only
  // handled the no-pages branch; but uploaded images DO create one
  // extraction page, so they were still going through PageSourcePreview
  // with isPdf=false and hitting the generic !previewImageUrl fallback.
  // Same for Office files with extracted sheets/slides. The category
  // computed here drives the JSX branch below: only "pdf" gets the
  // per-page rasterisation flow; everything else (image, office, other)
  // routes through EmptyDocumentPreview which already knows how to
  // render images inline + Office-specific fallbacks.
  const documentCategory = categorizeDocumentMime(audit?.document.mimeType ?? null);
  const pages = useMemo(() => audit?.latestRun?.pages ?? [], [audit?.latestRun?.pages]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPages = useMemo(() => {
    if (!normalizedQuery) return pages;
    return pages.filter((page) => page.extractedText.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, pages]);
  const reviewPages = useMemo(() => pages.filter(pageRequiresDecision), [pages]);
  const pageListPages = useMemo(() => {
    switch (pageFilter) {
      case "review":
        return filteredPages.filter(pageRequiresDecision);
      case "warning":
        return filteredPages.filter((page) => page.status === "READY_WITH_WARNINGS");
      case "ok":
        return filteredPages.filter((page) => page.status === "READY");
      case "all":
      default:
        return filteredPages;
    }
  }, [filteredPages, pageFilter]);
  const pageToInspect = useMemo(() => {
    if (selectedPage === null) return pageListPages[0] ?? filteredPages[0] ?? pages[0] ?? null;
    return pages.find((page) => page.pageNumber === selectedPage) ?? pageListPages[0] ?? filteredPages[0] ?? null;
  }, [filteredPages, pageListPages, pages, selectedPage]);
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

  const notifyDocumentUpdated = useCallback(async () => {
    if (!documentId) return;
    await onDocumentUpdated?.(documentId);
  }, [documentId, onDocumentUpdated]);

  const decisionMutation = useMutation({
    mutationFn: async (params: ExtractionDecisionParams) => {
      if (!document || !audit?.latestRun) throw new Error("Extraction run indisponible");
      const response = await clerkFetch(`/api/documents/${document.id}/extraction-decision`, {
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
      await notifyDocumentUpdated();
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async () => {
      if (!document) throw new Error("Document indisponible");
      const response = await clerkFetch(`/api/documents/${document.id}/process`, { method: "POST" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Relance extraction impossible" }));
        throw new Error(error.error ?? "Relance extraction impossible");
      }
      return response.json() as Promise<{
        data?: { extractionRunId?: string; processingStatus?: string };
      }>;
    },
    onSuccess: async (result) => {
      // Phase 4: the route returns 202 — the extraction is ENQUEUED, not
      // done. Track the run id and let the polling effect surface the
      // terminal state. Do NOT claim "terminée" here.
      const enqueuedRunId = result?.data?.extractionRunId ?? null;
      setReprocessRunId(enqueuedRunId);
      toast.success("Extraction renforcee lancee — traitement en cours");
      // Kick an immediate refetch so the audit view flips to PROCESSING.
      await queryClient.invalidateQueries({ queryKey: ["document-extraction-audit", documentId] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      // The route failed pre-enqueue — no background work is running.
      setReprocessStartedAt(null);
      setElapsedSeconds(0);
      setReprocessRunId(null);
    },
  });

  // Phase 4: terminal-state watcher for an enqueued durable extraction.
  // When the polled audit shows the enqueued run has reached a terminal
  // status, surface the outcome and stop polling.
  useEffect(() => {
    if (!reprocessRunId) return;
    const latestRun = audit?.latestRun;
    if (!latestRun || latestRun.id !== reprocessRunId) return;
    const terminalStatuses = ["READY", "READY_WITH_WARNINGS", "BLOCKED", "FAILED"];
    if (!terminalStatuses.includes(latestRun.status)) return;

    // Terminal — settle the UI after React finishes the current effect pass.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setReprocessRunId(null);
      setReprocessStartedAt(null);
      setElapsedSeconds(0);
      if (latestRun.status === "FAILED") {
        toast.error("Extraction renforcee echouee");
      } else {
        toast.success("Extraction renforcee terminee");
      }
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["deal-document-readiness"] }),
        notifyDocumentUpdated(),
      ]);
    });
    return () => {
      cancelled = true;
    };
  }, [reprocessRunId, audit?.latestRun, queryClient, notifyDocumentUpdated]);

  const pageRetryMutation = useMutation({
    mutationFn: async (params: PageRetryParams) => {
      if (!document) throw new Error("Document indisponible");
      const response = await clerkFetch(
        `/api/documents/${document.id}/extraction-pages/${params.pageNumber}/retry`,
        { method: "POST" }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Retry page impossible" }));
        throw new Error(error.error ?? "Retry page impossible");
      }
      return response.json();
    },
    onSuccess: async (_data, params) => {
      toast.success(`Page ${params.pageNumber} retraitee`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: auditQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["deal-document-readiness"] }),
      ]);
      await notifyDocumentUpdated();
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
        const response = await clerkFetch(
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
      await notifyDocumentUpdated();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      setRetryingPageNumber(null);
      setBatchRetryProgress(null);
      setReprocessStartedAt(null);
      setElapsedSeconds(0);
    },
  });

  // `reprocessRunId !== null` keeps the "extraction in progress" UI alive
  // for the whole duration of the durable (Inngest) extraction — not just
  // the brief 202 HTTP round-trip.
  const extractionActionPending =
    reprocessMutation.isPending ||
    pageRetryMutation.isPending ||
    batchRetryMutation.isPending ||
    reprocessRunId !== null;

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
    const retryable = reviewPages.filter(canRetryAuditPage);
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
    // B6.1 — fragment so the audit Dialog and the metadata Dialog are
    // peers, not parent/child. They share `open` controls only via the
    // metadata button + their independent state.
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* B5.2 — disable shadcn's absolute X (top-4 right-4). It used to
          sit ABOVE the action cluster (the `pr-12` on the header was a
          collision-avoidance trick, not actual alignment). With our own
          DialogClose inside the action cluster, all header actions live
          on the same horizontal line and wrap together on narrow
          viewports — no overlap is structurally possible. */}
      <DialogContent
        showCloseButton={false}
        className="!fixed !left-1/2 !top-1/2 !max-w-none !translate-x-[-50%] !translate-y-[-50%] relative flex flex-col gap-0 overflow-hidden p-0"
        style={{
          width: "min(1480px, calc(100vw - 24px))",
          maxWidth: "calc(100vw - 24px)",
          height: "calc(100dvh - 24px)",
          maxHeight: "calc(100dvh - 24px)",
        }}
      >
        {/* B5.2 — header. flex-wrap so the action cluster wraps to a new
            line on narrow widths instead of compressing the title or
            clipping the close button. `pr-12` is REMOVED — the close
            button is now part of the action cluster, no reservation
            needed. `min-w-0` on the title flex item lets the truncate
            actually engage when the cluster is wide. */}
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DialogTitle className="flex min-w-0 flex-1 items-center gap-2 text-base">
              <FileSearch className="h-5 w-5 shrink-0" />
              <span className="truncate" title={document.name}>
                Audit extraction — {document.name}
              </span>
            </DialogTitle>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {audit?.corpus.text && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startReprocess}
                    disabled={extractionActionPending}
                  >
                    {reprocessMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileSearch className="mr-2 h-4 w-4" />
                    )}
                    Relancer extraction
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyCorpus}>
                    <Clipboard className="mr-2 h-4 w-4" />
                    Copier le corpus
                  </Button>
                </>
              )}
              {/* B6.1 — "Modifier la date" action. Available for any doc
                  the dialog can open (so the user can correct a missing
                  sourceDate on a deck without an audit having run yet).
                  Opens DocumentMetadataDialog which PATCHes
                  /api/documents/[id]/metadata + invalidates evidence
                  health on success — gates in promote-source-date.ts +
                  email-source-inference.ts ensure the manual date stays
                  protected from future extractor / backfill writes. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMetadataDialogOpen(true)}
                aria-label="Modifier les métadonnées du document"
                title="Modifier les métadonnées (date, type, nature)"
              >
                {/* B12.3 P1 #4 — icon swap. The previous CalendarDays
                    icon was semantically wrong: it suggested "date"
                    while the button edits date + type + sourceKind.
                    On mobile (sub-md, where the text label collapses
                    to icon-only) the calendar icon misled users into
                    expecting a date picker. Pencil is the standard
                    "edit" affordance and matches what the button
                    actually does. */}
                <Pencil className="mr-2 h-4 w-4" />
                {/* B6.2.1 — label widened to match what the modal
                    actually edits (date + type + sourceKind). The old
                    "Modifier la date" was a B6.1-era leftover that
                    under-sold the action's scope. */}
                <span className="hidden md:inline">Modifier les métadonnées</span>
              </Button>
              {/* B5.2 — modal-level "open in new tab" + "download" of the
                  ORIGINAL document (vs the page preview image, which has
                  its own actions inside PageSourcePreview). Both routes
                  already exist (`?disposition=inline` vs default
                  attachment) — we only surface them in the UI here. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(
                    `/api/documents/${document.id}/download?disposition=inline`,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
                aria-label="Ouvrir le document dans un nouvel onglet"
                title="Ouvrir dans un nouvel onglet"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                <span className="hidden md:inline">Nouvel onglet</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(
                    `/api/documents/${document.id}/download`,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
                aria-label="Télécharger le document original"
                title="Télécharger le document"
              >
                <Download className="mr-2 h-4 w-4" />
                <span className="hidden md:inline">Télécharger</span>
              </Button>
              {/* B5.2 — replace shadcn's absolute X. DialogClose handles
                  the actual close lifecycle (focus restore, animations);
                  asChild + our custom Button gives consistent visual
                  weight with the surrounding outline buttons. */}
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Fermer l'audit extraction"
                  title="Fermer"
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
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
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b bg-muted/20 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <RunStatusBadge status={audit.latestRun?.status ?? audit.document.processingStatus} />
                  <MetricPill label="Couverture" value={audit.latestRun ? `${audit.latestRun.pagesProcessed}/${audit.latestRun.pageCount}` : "Legacy"} />
                  <MetricPill label="Qualite" value={audit.document.extractionQuality === null ? "N/A" : `${audit.document.extractionQuality}%`} />
                  <MetricPill label="Corpus" value={`${audit.corpus.wordCount} mots`} />
                  {/* B10.2 — extraction is not billed to the user while
                      CHARGE_DOCUMENT_EXTRACTION_CREDITS is false. Don't
                      surface the estimated credit cost as if the user
                      were charged for it. B10.2.1 — make the no-cost
                      state explicit: always show "Incluse" when the
                      flag is off (instead of leaking the corpus hash
                      as the headline value). The hash, when it exists,
                      moves to the tooltip for the engineering signal.
                      When the flag flips on, the credit value
                      reappears as the headline automatically. */}
                  <MetricPill
                    label="Extraction"
                    value={
                      CHARGE_DOCUMENT_EXTRACTION_CREDITS && audit.latestRun?.creditEstimate
                        ? `${audit.latestRun.creditEstimate.estimatedCredits} credits`
                        : "Incluse"
                    }
                    title={
                      !CHARGE_DOCUMENT_EXTRACTION_CREDITS && audit.latestRun?.corpusTextHash
                        ? `Corpus hash: ${audit.latestRun.corpusTextHash.slice(0, 10)}`
                        : undefined
                    }
                  />
                  {reviewPages.length > 0 && (
                    <Badge className="bg-amber-100 text-amber-800">
                      {reviewPages.length} a traiter
                    </Badge>
                  )}
                </div>
                {audit.latestRun?.blockedReason && (
                  <p className="mt-2 text-sm text-red-700">{audit.latestRun.blockedReason}</p>
                )}
              </div>

              {/* B12.3 P1 #5 — at sub-lg the 3-col grid collapses to a
                  vertical stack (aside 1 = pages list, main = preview,
                  aside 2 = tabs). Pre-fix the outer was `overflow-hidden`
                  which clipped any content past the dialog's height —
                  on 900x600 / 390x844 the main's empty-state CTAs were
                  hidden under the tabs aside. Switching to `overflow-y-auto`
                  at sub-lg lets the user scroll the whole stack to reach
                  the CTAs. `lg:overflow-hidden` restores the original
                  clipping at lg+, where the 3-col layout fits side-by-side
                  and each column has its own internal scroll. */}
              <div className="grid min-h-0 flex-1 overflow-y-auto lg:overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)_minmax(360px,440px)]">
                <aside className="flex flex-col border-b bg-background lg:min-h-0 lg:border-b-0 lg:border-r">
                  <div className="space-y-3 border-b p-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Rechercher"
                        className="pl-9"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <PageFilterButton
                        active={pageFilter === "review"}
                        label={`A traiter ${reviewPages.length ? `(${reviewPages.length})` : ""}`}
                        onClick={() => setPageFilter("review")}
                      />
                      <PageFilterButton
                        active={pageFilter === "all"}
                        label={`Toutes (${pages.length})`}
                        onClick={() => setPageFilter("all")}
                      />
                      <PageFilterButton
                        active={pageFilter === "warning"}
                        label={`Warnings (${pages.filter((page) => page.status === "READY_WITH_WARNINGS").length})`}
                        onClick={() => setPageFilter("warning")}
                      />
                      <PageFilterButton
                        active={pageFilter === "ok"}
                        label={`OK (${pages.filter((page) => page.status === "READY").length})`}
                        onClick={() => setPageFilter("ok")}
                      />
                    </div>
                  </div>

                  {/* B12.3 P1 #5 — same lg-only scroll pattern as
                      main: at sub-lg let the page list grow inline
                      and rely on the outer grid's scroll. */}
                  <div className="min-h-[180px] flex-1 space-y-1 p-2 lg:overflow-y-auto">
                    {pageListPages.length === 0 ? (
                      <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
                        Aucune page dans ce filtre.
                      </div>
                    ) : pageListPages.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => setSelectedPage(page.pageNumber)}
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/60",
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
                        <div className="mt-1 text-xs text-muted-foreground">
                          {page.extractionTier ? formatTierLabel(page.extractionTier) : page.method}
                          {" · "}
                          {page.wordCount} mots
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {page.hasFinancialKeywords && <MiniBadge label="finance" />}
                          {page.hasMarketKeywords && <MiniBadge label="marche" />}
                          {page.hasTeamKeywords && <MiniBadge label="team" />}
                          {page.hasTables && <MiniBadge label="table" />}
                          {page.hasCharts && <MiniBadge label="chart" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </aside>

                {/* B12.3 P1 #5 — main has its own internal scroll at
                    lg+ (where it sits in a 3-col grid with a constrained
                    height). At sub-lg the outer grid container scrolls,
                    so main should grow to its natural content height
                    instead of clipping its CTAs at ~141px (which hid
                    the empty-state "Ouvrir / Télécharger" buttons on
                    900x600). `lg:overflow-y-auto` keeps the lg
                    behaviour and lets sub-lg use the outer scroll. */}
                <main className="border-b bg-muted/10 p-4 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
                  {/* B5.3 round 2 — category-first routing. Only PDFs
                      with an extracted page get the per-page rasterised
                      preview (PageSourcePreview). Images, Office files,
                      and "other" mimes — even when they have one or more
                      extracted pages — route through EmptyDocumentPreview,
                      which renders the image inline (image branch) or
                      the category-specific fallback CTAs (office / other).
                      This closes the B5.3 P1 hole where an uploaded
                      image with one extraction page would still hit the
                      generic "Preview source indisponible" because
                      pageToInspect was set but isPdf was false. */}
                  {documentCategory === "pdf" && pageToInspect ? (
                    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-lg font-semibold">Page {pageToInspect.pageNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            PDF source · {pageToInspect.extractionTier ? formatTierLabel(pageToInspect.extractionTier) : pageToInspect.method}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {pageToInspect.qualityScore !== null && (
                            <Badge variant="outline">Score {pageToInspect.qualityScore}</Badge>
                          )}
                          <PageStatusBadge status={pageToInspect.status} />
                        </div>
                      </div>
                      <PageSourcePreview
                        page={pageToInspect}
                        documentId={audit.document.id}
                        documentName={audit.document.name}
                        preloadImageUrls={getAdjacentPreviewImageUrls(
                          audit.document.id,
                          pages,
                          pageToInspect.pageNumber
                        )}
                      />
                    </div>
                  ) : (
                    // Non-PDF docs OR PDF-with-no-pages. EmptyDocumentPreview
                    // owns the routing internally: image branch (inline
                    // render via /download?disposition=inline), Office
                    // / PDF-no-pages / other branches (category-aware
                    // download CTAs).
                    <EmptyDocumentPreview
                      documentId={audit.document.id}
                      documentName={audit.document.name}
                      mimeType={audit.document.mimeType ?? null}
                    />
                  )}
                </main>

                {/* B12.3 P1 #5 — same lg-only overflow pattern for the
                    right aside (Extraction/Corpus/Liens tabs). At
                    sub-lg the inner tab content grows inline. */}
                <aside className="bg-background lg:min-h-0 lg:overflow-hidden">
                  <Tabs defaultValue="extraction" className="flex h-full min-h-0 flex-col">
                    <div className="border-b p-3">
                      {/* B7.1 — third tab "Liens" surfaces detected
                          ATTACHMENT_RELATION signals (read-only).
                          Grid extended to 3 cols. Excel modal audit
                          stays a separate sub-trigger to avoid
                          cluttering the primary 3-col row. */}
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="extraction">Extraction</TabsTrigger>
                        <TabsTrigger value="corpus">Corpus</TabsTrigger>
                        <TabsTrigger value="links">Liens</TabsTrigger>
                      </TabsList>
                      {excelModelAudit && (
                        <TabsList className="mt-2 w-full">
                          <TabsTrigger value="model" className="w-full">Modele Excel</TabsTrigger>
                        </TabsList>
                      )}
                    </div>

                    <TabsContent value="extraction" className="min-h-0 flex-1 p-4 lg:overflow-y-auto">
                      {pageToInspect ? (
                        <div className="flex min-h-full flex-col gap-3">
                          {pageToInspect.errorMessage && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                              {pageToInspect.errorMessage}
                            </div>
                          )}
                          <PageRiskSummary page={pageToInspect} />
                          <PageEvidenceSummary page={pageToInspect} />
                          {!pageToInspect.blocksAnalysis && pageNeedsInspection(pageToInspect) && !pageToInspect.override && (
                            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                              <p className="font-medium">Inspection recommandee, non bloquante</p>
                              <p className="mt-1">
                                Le texte semble suffisant pour l&apos;analyse, mais cette page merite un controle humain.
                              </p>
                            </div>
                          )}
                          {pageToInspect.override && (
                            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                              <p className="font-medium">
                                {pageToInspect.override.overrideType === "EXCLUDE_PAGE"
                                  ? "Page exclue de l'analyse"
                                  : "Page approuvee pour l'analyse"}
                              </p>
                              <p className="mt-1">Decision tracee.</p>
                            </div>
                          )}
                          <div className="min-h-[260px] flex-1 rounded-md border">
                            <Textarea
                              readOnly
                              value={pageToInspect.extractedText}
                              className="h-full min-h-[260px] resize-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
                            />
                          </div>
                          {pageNeedsInspection(pageToInspect) && (
                            <div className="sticky bottom-0 -mx-4 -mb-4 border-t bg-background/95 p-4 backdrop-blur">
                              <div className="grid gap-2">
                                {canRetryAuditPage(pageToInspect) && (
                                  <Button
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
                                  onClick={() => handleDecision(pageToInspect, "BYPASS_PAGE")}
                                  disabled={decisionMutation.isPending}
                                >
                                  Approuver apres inspection
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => handleDecision(pageToInspect, "EXCLUDE_PAGE")}
                                  disabled={decisionMutation.isPending}
                                >
                                  Exclure cette page
                                </Button>
                                {reviewPages.length > 1 && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => goToReviewPage(-1)}
                                      disabled={decisionMutation.isPending}
                                    >
                                      <ChevronLeft className="mr-1 h-4 w-4" />
                                      Precedente
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => goToReviewPage(1)}
                                      disabled={decisionMutation.isPending}
                                    >
                                      Suivante
                                      <ChevronRight className="ml-1 h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                                {reviewPages.length > 1 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={startReviewPagesRetry}
                                    disabled={extractionActionPending}
                                  >
                                    {batchRetryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {/* B10.2 — the "(N credits max)" tag was the only
                                        visible billing cue on this batch CTA. While
                                        extraction is non-billable
                                        (CHARGE_DOCUMENT_EXTRACTION_CREDITS=false),
                                        show the workload size in pages instead. The
                                        cost branch is preserved for the eventual
                                        flag flip. */}
                                    {CHARGE_DOCUMENT_EXTRACTION_CREDITS
                                      ? `Retenter toutes (${reviewPages.length * 2} credits max)`
                                      : `Retenter toutes (${reviewPages.length} pages)`}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                          Selectionne une page.
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="corpus" className="min-h-0 flex-1 p-4 lg:overflow-y-auto">
                      <Textarea
                        readOnly
                        value={audit.corpus.text}
                        className="h-full min-h-[520px] resize-none font-mono text-sm shadow-none"
                      />
                    </TabsContent>

                    {/* B7.1 — "Liens" tab surfaces detected
                        ATTACHMENT_RELATION signals. Read-only —
                        no link/unlink actions (B7.2). Fetch is
                        gated on the audit dialog being open AND
                        the audit query having resolved (audit.document
                        non-null) so we don't fire requests before
                        the doc context is ready. */}
                    <TabsContent value="links" className="min-h-0 flex-1 p-4 lg:overflow-y-auto">
                      <DocumentAttachmentsPanel
                        documentId={audit.document.id}
                        enabled={open}
                      />
                    </TabsContent>

                    {excelModelAudit && (
                      <TabsContent value="model" className="min-h-0 flex-1 p-4 lg:overflow-y-auto">
                        <ExcelModelAuditPanel audit={excelModelAudit} />
                      </TabsContent>
                    )}
                  </Tabs>
                </aside>
              </div>
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
                      ? `Page ${batchRetryProgress.done}/${batchRetryProgress.total}. Chaque page est retraitee en OCR supreme (traitement idempotent).`
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
    {/* B6.1 — Metadata Editor as a SIBLING of the audit Dialog, not a
        descendant. Radix Dialog instances are independent state machines;
        nesting would tie the metadata dialog's open state to the audit
        dialog's portal tree and break the modal-over-modal stacking.
        We pass `document.dealId` from the parent prop (widened in
        ExtractionAuditDialogProps for B6.1) because audit.document.id
        is the document id, not the deal id. The button itself is gated
        on dealId being present so the dialog never opens without
        enough context to PATCH the right deal. */}
    <DocumentMetadataDialog
      open={metadataDialogOpen}
      onOpenChange={setMetadataDialogOpen}
      document={
        document && document.dealId
          ? {
              id: document.id,
              dealId: document.dealId,
              name: document.name,
              sourceDate: document.sourceDate ?? null,
              // B6.2 — forward current type + sourceKind so the
              // dropdowns pre-fill correctly. The DocumentMetadataDialog
              // accepts them as DocumentType / DocumentSourceKind via
              // Prisma's nominal enums; we cast through the prop's
              // looser `string | null` so a doc with a CALL_TRANSCRIPT
              // (not in the upload UI's narrower list) still displays
              // correctly.
              type: (document.type ?? null) as never,
              sourceKind: (document.sourceKind ?? null) as never,
              // B6.3 — forward email metadata for pre-fill.
              receivedAt: document.receivedAt ?? null,
              sourceAuthor: document.sourceAuthor ?? null,
              sourceSubject: document.sourceSubject ?? null,
            }
          : null
      }
      onMetadataUpdated={(updatedId) => {
        if (onDocumentUpdated) void onDocumentUpdated(updatedId);
        // Force the audit query to refetch so the dialog reflects the
        // new sourceDate / type / sourceKind immediately (cheap —
        // single doc).
        void queryClient.invalidateQueries({ queryKey: auditQueryKey });
        // B7.1 fix-up (Codex P2) — defense in depth: also invalidate
        // the attachments panel here. The metadata dialog already
        // does it on success, but if a future surface invokes
        // onMetadataUpdated via another path (e.g. a documents-tab
        // inline edit), the attachments tab must refresh too.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.documentAttachments.byDocument(updatedId),
        });
      }}
    />
    </>
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

function MetricPill({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
      title={title}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  if (status === "READY" || status === "READY_WITH_WARNINGS" || status === "COMPLETED") {
    return <Badge className="bg-green-100 text-green-700">{status}</Badge>;
  }
  if (status === "BLOCKED" || status === "NEEDS_REVIEW") {
    return <Badge className="bg-amber-100 text-amber-800">{status}</Badge>;
  }
  if (status === "FAILED") {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function PageFilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="h-8 justify-start px-2 text-xs"
    >
      {label}
    </Button>
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

function getPreviewImageUrl(
  documentId: string,
  page: Pick<AuditPage, "pageNumber" | "pageImageHash">
) {
  const version = page.pageImageHash ? `?v=${encodeURIComponent(page.pageImageHash)}` : "";
  return `/api/documents/${documentId}/preview-pages/${page.pageNumber}${version}`;
}

function getAdjacentPreviewImageUrls(
  documentId: string,
  pages: AuditPage[],
  pageNumber: number
) {
  const adjacentPages = new Set([pageNumber - 1, pageNumber + 1]);
  return pages
    .filter((page) => adjacentPages.has(page.pageNumber))
    .map((page) => getPreviewImageUrl(documentId, page));
}

/**
 * B5.3 round 2 — PageSourcePreview is now PDF-only. The category-routing
 * at the parent (`documentCategory === "pdf" && pageToInspect`) is the
 * single gate that decides whether to call this component, so the old
 * `isPdf` prop became dead code (always true at call sites). Dropping it
 * here makes the contract explicit: a non-PDF caller is a programming
 * error, not a fallback path. Image / Office / other categories route
 * through EmptyDocumentPreview directly.
 */
function PageSourcePreview({
  page,
  documentId,
  documentName,
  preloadImageUrls = [],
}: {
  page: AuditPage;
  documentId: string;
  documentName: string;
  preloadImageUrls?: string[];
}) {
  // B5.1 — per-dialog cache of preview URLs we've successfully loaded
  // (Set keyed by `previewImageUrl`, which is content-hashed via `?v=`
  // so a retry busts the cache automatically). Going back to a page the
  // user already viewed shows the image instantly with NO loader —
  // previously the loader flashed on every page revisit because state
  // tracked a single "last loaded" URL and dropped earlier entries.
  // This kills the "wait, is it OCRing this page again?" impression.
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(() => new Set());
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  // B5.1 — preload deduplication. Without this, every parent re-render
  // that recomputes the adjacent URLs (different array identity) would
  // re-create <Image> objects for URLs already in browser cache. The
  // ref records *attempted* preloads — once a URL is in here, we never
  // re-fire the warmer. Browser HTTP cache + this Set make navigation
  // monotonic: a URL is preloaded once, then served from cache.
  const preloadedUrlsRef = useRef<Set<string>>(new Set());

  // B5.3 round 2 — PDF-only path. Parent guarantees `documentCategory ===
  // "pdf"` before invoking this component, so the URL is always defined.
  const previewImageUrl = getPreviewImageUrl(documentId, page);
  const pageUrl = `/api/documents/${documentId}/download?disposition=inline#page=${page.pageNumber}&toolbar=0&navpanes=0&zoom=page-fit`;
  const previewLoaded = loadedUrls.has(previewImageUrl);
  const previewFailed = failedUrls.has(previewImageUrl);
  // B5.1 — `preloadImageUrls` is recomputed every parent render (new
  // array identity). Memoise the dedup key + sorted list so the effect
  // below fires only when the SET of URLs actually changes.
  const preloadImageUrlKey = preloadImageUrls.join("|");

  useEffect(() => {
    if (!preloadImageUrlKey || typeof window === "undefined") return;
    const previouslyPreloaded = preloadedUrlsRef.current;
    const images: HTMLImageElement[] = [];
    for (const url of preloadImageUrlKey.split("|")) {
      // Skip URLs we've already warmed (or that the user just loaded —
      // those are already in the browser cache too).
      if (previouslyPreloaded.has(url)) continue;
      previouslyPreloaded.add(url);
      const image = new window.Image();
      image.decoding = "async";
      image.src = url;
      images.push(image);
    }
    return () => {
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [preloadImageUrlKey]);

  // B5.1 — handlers must be referentially stable so a re-render mid-load
  // doesn't reset the onLoad/onError wiring on the <img> element.
  //
  // B5.1 fix-up (Codex P2) — MUTUAL EXCLUSION between loadedUrls and
  // failedUrls. Without this guard, a real-world recovery sequence
  // (image fails → user retries / browser auto-retries / network heals
  // → same URL succeeds) would leave the URL in BOTH Sets, so
  // `previewLoaded` and `previewFailed` would both be true and the UI
  // would render the "Preview indisponible" banner AND the loaded
  // image at the same time. Each handler adds to its own Set AND
  // removes from the other Set so the two states are always disjoint.
  const handleLoad = useCallback((url: string) => {
    setLoadedUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
    setFailedUrls((prev) => {
      if (!prev.has(url)) return prev;
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  }, []);
  const handleError = useCallback((url: string) => {
    setFailedUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
    setLoadedUrls((prev) => {
      if (!prev.has(url)) return prev;
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  }, []);

  // B5.3 round 2 — the legacy `!previewImageUrl` fallback branch is
  // removed. PageSourcePreview is now PDF-only by contract (see the
  // category gate in the parent). A non-PDF or no-page caller would be
  // a programming error; the parent routes those cases through
  // EmptyDocumentPreview which handles images inline + Office/other via
  // category-specific download CTAs. Keeping a defense-in-depth
  // fallback here would just mask future regressions where the parent
  // gate slips.

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
      {/* B5.2 — page-preview header. Title block + action cluster with
          consistent button sizing, flex-wrap on narrow widths so the
          cluster moves to a new row rather than overflowing or
          clipping. The download-image action (B5.2 new) lets the user
          grab the actual preview PNG, distinct from "open in tab"
          (which the browser may render inline). */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Page source</p>
          <p className="truncate text-xs text-muted-foreground" title={`PDF original, page ${page.pageNumber}`}>
            PDF original, page {page.pageNumber}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(previewImageUrl, "_blank", "noopener,noreferrer")}
            aria-label={`Ouvrir l'image de la page ${page.pageNumber} dans un nouvel onglet`}
            title="Ouvrir l'image dans un nouvel onglet"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Ouvrir l&apos;image
          </Button>
          {/* B5.3 round 2 — `pageUrl` was conditionally rendered when
              isPdf=true; now PageSourcePreview is PDF-only by contract,
              so the conditional was dead and is dropped. */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(pageUrl, "_blank", "noopener,noreferrer")}
            aria-label={`Ouvrir la page ${page.pageNumber} du PDF dans un nouvel onglet`}
            title="Ouvrir la page dans le PDF d'origine"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Ouvrir la page
          </Button>
        </div>
      </div>
      <div className="min-h-[360px] flex-1 overflow-auto bg-muted/20 p-3">
        {/* B5.1 — Skeleton (not a centred spinner) while a NEW page is
            fetching. A skeleton with the right portrait-ish aspect feels
            like "image rendering" rather than "system processing", and
            it matches the page's expected footprint so the layout doesn't
            jump when the image arrives. The "Chargement page N" caption
            stays under the skeleton so the user knows which page is in
            flight. Crucially, this block is only rendered when the URL
            isn't in the loadedUrls Set — re-visiting a cached page
            renders the <img> immediately. */}
        {!previewLoaded && !previewFailed && (
          <div
            className="mx-auto flex w-full max-w-2xl flex-col items-center gap-2"
            role="status"
            aria-live="polite"
            aria-label={`Chargement de la page ${page.pageNumber}`}
          >
            <Skeleton className="aspect-[1/1.3] w-full" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Chargement page {page.pageNumber}…</span>
            </div>
          </div>
        )}
        {previewFailed && (
          <div className="flex aspect-video min-h-[260px] items-center justify-center rounded border border-dashed bg-background text-sm text-destructive">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span>Preview page {page.pageNumber} indisponible</span>
            </div>
          </div>
        )}
        {/* B5.1 — `key={previewImageUrl}` forces a fresh <img> when the
            URL changes. With our loadedUrls Set, a re-visited URL hits
            `previewLoaded === true` BEFORE the new img element fires its
            onLoad (it's the same cached file from the browser's POV) so
            the user sees no flash. For first-time visits the img stays
            hidden until onLoad fires. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={previewImageUrl}
          src={previewImageUrl}
          alt={`${documentName} - page ${page.pageNumber}`}
          onLoad={() => handleLoad(previewImageUrl)}
          onError={() => handleError(previewImageUrl)}
          className={cn(
            "mx-auto h-auto max-w-full rounded border bg-background shadow-sm",
            !previewLoaded && "hidden"
          )}
        />
      </div>
    </div>
  );
}

/**
 * B5.3 — categorise a document by mime so the audit dialog can route to
 * the right preview surface AND show a category-specific message in the
 * fallback. Kept small + exported only as internal because the categories
 * are tight to this dialog's UX (Office vs Image vs PDF vs other) — a
 * future preview-everywhere surface would derive its own.
 */
type DocumentPreviewCategory = "pdf" | "image" | "office" | "other";

function categorizeDocumentMime(mimeType: string | null): DocumentPreviewCategory {
  if (!mimeType) return "other";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  // Office family: Excel (xls/xlsx), PowerPoint (ppt/pptx), Word (doc/docx).
  // The browser cannot inline-render these, so the fallback always tells
  // the user to download. We keep them in one bucket so the message stays
  // consistent across the three formats.
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    return "office";
  }
  return "other";
}

/**
 * B5.3 — preview surface for documents that have NO `pages` (failed
 * extraction, image uploaded directly, Office files where the audit
 * dialog wasn't supposed to land but did via the deal-page action).
 *
 * For images we render the file directly via the `?disposition=inline`
 * download route — the browser handles PNG/JPEG natively, no
 * server-side rasterisation needed. Skeleton + cache machinery mirrors
 * PageSourcePreview (single URL, so the Set degenerates to two booleans
 * but we keep the same shape for consistency + future-proofing).
 *
 * For PDF (this branch fires when extraction yielded 0 pages — failed
 * extraction or in-flight reprocess), Office, and "other" mimes, we
 * render an actionable CTA panel: open in new tab + download. The
 * primary CTA is "Télécharger" (variant=default) since that's the
 * always-works path; the inline open is secondary.
 *
 * The B5.2 contract (download = `/download` no params, inline =
 * `/download?disposition=inline`) is preserved end-to-end.
 */
function EmptyDocumentPreview({
  documentId,
  documentName,
  mimeType,
}: {
  documentId: string;
  documentName: string;
  mimeType: string | null;
}) {
  const category = categorizeDocumentMime(mimeType);
  const downloadUrl = `/api/documents/${documentId}/download`;
  const inlineUrl = `/api/documents/${documentId}/download?disposition=inline`;

  // Single-URL image preview — same shape as PageSourcePreview so future
  // changes to the loading state stay symmetric. Set hooks at top level
  // (rules of hooks); they're only consumed in the image branch below.
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(() => new Set());
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const previewLoaded = loadedUrls.has(inlineUrl);
  const previewFailed = failedUrls.has(inlineUrl);
  // Mutual-exclusion handlers (same contract as B5.1 P2 fix).
  const handleLoad = useCallback((url: string) => {
    setLoadedUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
    setFailedUrls((prev) => {
      if (!prev.has(url)) return prev;
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  }, []);
  const handleError = useCallback((url: string) => {
    setFailedUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
    setLoadedUrls((prev) => {
      if (!prev.has(url)) return prev;
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  }, []);

  if (category === "image") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">Image source</p>
            <p className="truncate text-xs text-muted-foreground" title={documentName}>
              {documentName}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(inlineUrl, "_blank", "noopener,noreferrer")}
              aria-label={`Ouvrir ${documentName} dans un nouvel onglet`}
              title="Ouvrir l'image dans un nouvel onglet"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Ouvrir l&apos;image
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(downloadUrl, "_blank", "noopener,noreferrer")}
              aria-label={`Télécharger ${documentName}`}
              title="Télécharger l'image"
            >
              <Download className="mr-2 h-4 w-4" />
              Télécharger
            </Button>
          </div>
        </div>
        <div className="min-h-[360px] flex-1 overflow-auto bg-muted/20 p-3">
          {!previewLoaded && !previewFailed && (
            <div
              className="mx-auto flex w-full max-w-2xl flex-col items-center gap-2"
              role="status"
              aria-live="polite"
              aria-label={`Chargement de l'image ${documentName}`}
            >
              <Skeleton className="aspect-[1/1.3] w-full" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Chargement de l&apos;image…</span>
              </div>
            </div>
          )}
          {previewFailed && (
            <div className="flex aspect-video min-h-[260px] items-center justify-center rounded border border-dashed bg-background text-sm text-destructive">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>Image source indisponible</span>
              </div>
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={inlineUrl}
            src={inlineUrl}
            alt={documentName}
            onLoad={() => handleLoad(inlineUrl)}
            onError={() => handleError(inlineUrl)}
            className={cn(
              "mx-auto h-auto max-w-full rounded border bg-background shadow-sm",
              !previewLoaded && "hidden"
            )}
          />
        </div>
      </div>
    );
  }

  // Non-image fallbacks — download CTA panel with a category-specific
  // explanation. Office files cannot be inline-rendered by the browser
  // so we keep the "open in new tab" secondary (still useful for a quick
  // look in the browser's default handler) and the download primary.
  const heading = (() => {
    switch (category) {
      case "pdf":
        return "Aucune page extraite pour ce PDF";
      case "office":
        return "Format Office non prévisualisable";
      default:
        return "Preview source indisponible";
    }
  })();
  const detail = (() => {
    switch (category) {
      case "pdf":
        return "L'extraction n'a produit aucune page exploitable. Téléchargez le PDF original ou relancez l'extraction depuis le header.";
      case "office":
        return "Excel, PowerPoint et Word ne peuvent pas être rendus inline. Téléchargez le fichier pour l'ouvrir dans l'application bureautique.";
      default:
        return "Téléchargez le document original ou ouvrez-le dans un nouvel onglet pour le consulter.";
    }
  })();

  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-background p-4 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{heading}</p>
      <p className="text-xs">{detail}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open(inlineUrl, "_blank", "noopener,noreferrer")}
          aria-label={`Ouvrir ${documentName} dans un nouvel onglet`}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Nouvel onglet
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={() => window.open(downloadUrl, "_blank", "noopener,noreferrer")}
          aria-label={`Télécharger ${documentName}`}
        >
          <Download className="mr-2 h-4 w-4" />
          Télécharger
        </Button>
      </div>
    </div>
  );
}

function PageRiskSummary({ page }: { page: AuditPage }) {
  if (page.visualRiskScore === null || page.visualRiskScore < 55) return null;

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Risque visuel {page.visualRiskScore}/100</span>
        {page.extractionTier && (
          <Badge variant="outline">{formatTierLabel(page.extractionTier)}</Badge>
        )}
        {page.semanticAssessment?.pageClass && (
          <Badge variant="outline">{formatPageClassLabel(page.semanticAssessment.pageClass)}</Badge>
        )}
        {page.semanticAssessment?.structureDependency && (
          <Badge variant="outline">Structure {page.semanticAssessment.structureDependency}</Badge>
        )}
        {page.semanticAssessment?.semanticSufficiency && (
          <Badge variant="outline">Fidelite {page.semanticAssessment.semanticSufficiency}</Badge>
        )}
        {typeof page.semanticAssessment?.analyticalValueScore === "number" && (
          <Badge variant="outline">Valeur {page.semanticAssessment.analyticalValueScore}/100</Badge>
        )}
      </div>
      {page.visualRiskReasons.length > 0 && (
        <p className="mt-1 text-muted-foreground">{page.visualRiskReasons.join(", ")}</p>
      )}
      {page.semanticAssessment?.rationale && page.semanticAssessment.rationale.length > 0 && (
        <p className="mt-1 text-muted-foreground">{page.semanticAssessment.rationale.join(", ")}</p>
      )}
    </div>
  );
}

function PageEvidenceSummary({ page }: { page: AuditPage }) {
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

  return (
    <div className="rounded-md border p-3 text-sm">
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
