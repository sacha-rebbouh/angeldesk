"use client";

import { useCallback, useEffect, useState, useMemo, memo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { clerkFetch } from "@/lib/clerk-fetch";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Eye, FileSearch, FileText, Mail, MoreHorizontal, Pencil, Plus, RotateCw, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentUploadDialog } from "./document-upload-dialog";
import type { UploadedDocumentSummary } from "./file-upload";
import { DocumentExtractionAuditDialog } from "./document-extraction-audit-dialog";
import { DocumentPreviewDialog } from "./document-preview-dialog";
import { TextPreviewDialog } from "./text-preview-dialog";
import {
  ExtractionQualityBadge,
  ExtractionWarningBanner,
} from "./extraction-quality-badge";
import { EvidenceHealthBadge } from "./evidence-health-badge";
import { useEvidenceHealth } from "@/hooks/use-evidence-health";
import { derivePollingDocumentIds, isTerminalDocumentStatus } from "@/lib/document-polling";
import { formatStalenessAge, isDocumentStale } from "@/lib/document-staleness";
import { cn } from "@/lib/utils";

interface Document {
  id: string;
  name: string;
  type: string;
  hasStorage: boolean;
  mimeType: string | null;
  processingStatus: string;
  extractionQuality: number | null;
  extractionMetrics?: unknown;
  extractionWarnings: { code: string; severity: "critical" | "high" | "medium" | "low"; message: string; suggestion: string }[] | null;
  requiresOCR: boolean;
  uploadedAt: Date;
  sourceKind?: "FILE" | "EMAIL" | "NOTE";
  corpusRole?: "GENERAL" | "DILIGENCE_RESPONSE";
  sourceDate?: Date | string | null;
  receivedAt?: Date | string | null;
  sourceAuthor?: string | null;
  sourceSubject?: string | null;
  linkedQuestionSource?: "RED_FLAG" | "QUESTION_TO_ASK" | null;
  linkedQuestionText?: string | null;
  linkedRedFlagId?: string | null;
  corpusParentDocumentId?: string | null;
  corpusParentDocument?: { id: string; name: string } | null;
}

interface DocumentsTabProps {
  dealId: string;
  documents: Document[];
}

interface StalenessInfo {
  hasAnalysis: boolean;
  staleness: {
    isStale: boolean;
    newDocumentCount: number;
    message: string | null;
    analyzedDocumentIds: string[];
    analysisId: string;
    analysisType: string;
  } | null;
  unanalyzedDocuments: Array<{
    id: string;
    name: string;
    type: string;
    createdAt: string;
  }>;
}

type DocumentFilter = "all" | "file" | "email" | "note" | "response";

async function fetchStaleness(dealId: string): Promise<StalenessInfo> {
  const response = await clerkFetch(`/api/deals/${dealId}/staleness`);
  if (!response.ok) throw new Error("Failed to fetch staleness");
  return response.json();
}

async function fetchDocument(documentId: string): Promise<Document | null> {
  const response = await clerkFetch(`/api/documents/${documentId}`);
  if (!response.ok) return null;
  const payload = await response.json() as { data?: Document };
  return payload.data ?? null;
}

function getExtractionMetricSummary(metrics: unknown): {
  status: string | null;
  blockingCount: number;
  inspectionCount: number;
} {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return { status: null, blockingCount: 0, inspectionCount: 0 };
  }

  const record = metrics as {
    status?: unknown;
    blockingPages?: unknown;
    failedPages?: unknown;
    pageCount?: unknown;
  };

  const status = typeof record.status === "string" ? record.status : null;
  const blockingPages = Array.isArray(record.blockingPages) ? record.blockingPages : [];
  const failedPages = Array.isArray(record.failedPages) ? record.failedPages : [];
  const inspectionCount =
    status === "needs_review"
      ? Math.max(blockingPages.length, failedPages.length)
      : failedPages.length;

  return {
    status,
    blockingCount: blockingPages.length,
    inspectionCount,
  };
}

function getSourceKind(doc: Document): "FILE" | "EMAIL" | "NOTE" {
  return doc.sourceKind ?? "FILE";
}

function getCorpusRole(doc: Document): "GENERAL" | "DILIGENCE_RESPONSE" {
  return doc.corpusRole ?? "GENERAL";
}

function getTimelineDate(doc: Document): Date {
  const raw = doc.sourceDate ?? doc.receivedAt ?? doc.uploadedAt;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date(doc.uploadedAt) : date;
}

function getTimelineDayKey(doc: Document): string {
  return format(getTimelineDate(doc), "yyyy-MM-dd");
}

function getSourceLabel(sourceKind: "FILE" | "EMAIL" | "NOTE"): string {
  if (sourceKind === "EMAIL") return "Email";
  if (sourceKind === "NOTE") return "Note";
  return "Fichier";
}

function getSourceIcon(sourceKind: "FILE" | "EMAIL" | "NOTE") {
  if (sourceKind === "EMAIL") return Mail;
  if (sourceKind === "NOTE") return StickyNote;
  return FileText;
}

function getSourceBadgeClass(sourceKind: "FILE" | "EMAIL" | "NOTE"): string {
  if (sourceKind === "EMAIL") return "border-violet-200 bg-violet-50 text-violet-700";
  if (sourceKind === "NOTE") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function getSecondaryLine(doc: Document, parentName?: string | null): string {
  const sourceKind = getSourceKind(doc);
  if (sourceKind === "EMAIL") {
    return [
      doc.sourceAuthor ? `De: ${doc.sourceAuthor}` : null,
      doc.sourceSubject ? `Sujet: ${doc.sourceSubject}` : null,
    ].filter(Boolean).join(" · ");
  }
  if (sourceKind === "NOTE") {
    return [
      doc.sourceSubject ? `Titre: ${doc.sourceSubject}` : null,
      doc.type ? `Type: ${doc.type}` : null,
    ].filter(Boolean).join(" · ");
  }
  if (doc.corpusParentDocumentId) {
    return [
      doc.type,
      parentName ? `Joint à : ${parentName}` : "Fichier joint",
    ].filter(Boolean).join(" · ");
  }
  return doc.type;
}

export const DocumentsTab = memo(function DocumentsTab({ dealId, documents }: DocumentsTabProps) {
  const queryClient = useQueryClient();
  const [localDocuments, setLocalDocuments] = useState<Document[]>(documents);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [textPreviewDoc, setTextPreviewDoc] = useState<Document | null>(null);
  const [auditDoc, setAuditDoc] = useState<Document | null>(null);
  const [renameDoc, setRenameDoc] = useState<Document | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<DocumentFilter>("all");

  useEffect(() => {
    setLocalDocuments(documents);
  }, [documents]);

  // B3.1 — both PROCESSING and PENDING are polled. PENDING = Inngest hasn't
  // picked up yet; without polling it would silently sit until another
  // mutation refetches the deal payload. derivePollingDocumentIds enforces
  // the rule in a pure, unit-tested helper.
  const processingDocumentIdsKey = useMemo(() => (
    derivePollingDocumentIds(
      localDocuments.map((doc) => ({ id: doc.id, processingStatus: doc.processingStatus }))
    ).join("|")
  ), [localDocuments]);

  useEffect(() => {
    const processingIds = processingDocumentIdsKey
      ? processingDocumentIdsKey.split("|")
      : [];
    if (processingIds.length === 0) return;

    let cancelled = false;
    // Codex round 26 P1 — `completeDocumentExtractionRun` flips the document
    // to a terminal status BEFORE `runEvidenceForDocument` finishes persisting
    // the EvidenceSignal rows (extraction-pipeline.ts:488 vs :511). A naive
    // single invalidation on terminal-transition can refetch and cache an
    // empty bundle for the full staleTime. We close the race with an
    // immediate invalidation PLUS a deferred one ~4s later (typical evidence
    // extraction completes well under that). Pending timeouts are cleared on
    // unmount to avoid leaks.
    const TERMINAL_EVIDENCE_RACE_FOLLOWUP_MS = 4_000;
    const pendingFollowupTimeouts = new Set<number>();
    const invalidateEvidenceHealth = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
    };
    const refreshProcessingDocuments = async () => {
      const refreshedDocuments = await Promise.all(processingIds.map(fetchDocument));
      if (cancelled) return;
      const refreshedById = new Map(
        refreshedDocuments
          .filter((document): document is Document => Boolean(document))
          .map((document) => [document.id, document])
      );
      if (refreshedById.size === 0) return;
      // Codex round 25 P1 + B3.1.1 P2 — detect at least one non-terminal →
      // terminal transition (PENDING / PROCESSING → COMPLETED / FAILED).
      // The previous predicate `!== "PROCESSING"` matched PENDING too, so
      // a doc that stayed PENDING across ticks fired a fake "transition"
      // every 5s, triggering immediate + deferred evidence-health
      // invalidation for no reason. The helper enforces the actual rule:
      // a status that satisfies isTerminalDocumentStatus IS the transition,
      // since we only ever poll non-terminal docs (PENDING + PROCESSING).
      const hasTerminalTransition = Array.from(refreshedById.values()).some(
        (document) => isTerminalDocumentStatus(document.processingStatus)
      );
      setLocalDocuments((currentDocuments) =>
        currentDocuments.map((document) => {
          const refreshed = refreshedById.get(document.id);
          return refreshed
            ? { ...refreshed, uploadedAt: new Date(refreshed.uploadedAt) }
            : document;
        })
      );
      if (hasTerminalTransition) {
        // 1. Immediate invalidation — covers the case where evidence ran fast.
        invalidateEvidenceHealth();
        // 2. Deferred invalidation — covers the race window between
        //    `completeDocumentExtractionRun` and `runEvidenceForDocument`.
        const timeoutId = window.setTimeout(() => {
          pendingFollowupTimeouts.delete(timeoutId);
          if (!cancelled) invalidateEvidenceHealth();
        }, TERMINAL_EVIDENCE_RACE_FOLLOWUP_MS);
        pendingFollowupTimeouts.add(timeoutId);
      }
    };

    const intervalId = window.setInterval(refreshProcessingDocuments, 5_000);
    void refreshProcessingDocuments();
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      for (const timeoutId of pendingFollowupTimeouts) window.clearTimeout(timeoutId);
      pendingFollowupTimeouts.clear();
    };
  }, [processingDocumentIdsKey, queryClient, dealId]);

  // Fetch staleness info to know which documents were analyzed
  const { data: stalenessData } = useQuery({
    queryKey: queryKeys.staleness.byDeal(dealId),
    queryFn: () => fetchStaleness(dealId),
    staleTime: 30_000,
  });

  // Phase 8 — evidence health for per-doc badges.
  const { data: evidenceHealth } = useEvidenceHealth(dealId);

  // Set of document IDs that have been analyzed
  const analyzedDocIds = useMemo(() => {
    if (!stalenessData?.staleness?.analyzedDocumentIds) {
      return new Set<string>();
    }
    return new Set(stalenessData.staleness.analyzedDocumentIds);
  }, [stalenessData]);

  // Check if there's at least one analysis
  const hasAnalysis = stalenessData?.hasAnalysis ?? false;

  const documentNameById = useMemo(() => new Map(
    localDocuments.map((document) => [document.id, document.name])
  ), [localDocuments]);

  const attachmentCountByParentId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of localDocuments) {
      if (!document.corpusParentDocumentId) continue;
      counts.set(
        document.corpusParentDocumentId,
        (counts.get(document.corpusParentDocumentId) ?? 0) + 1
      );
    }
    return counts;
  }, [localDocuments]);

  const timelineGroups = useMemo(() => {
    const filtered = localDocuments
      .filter((document) => {
        const sourceKind = getSourceKind(document);
        const corpusRole = getCorpusRole(document);
        if (filter === "file") return sourceKind === "FILE";
        if (filter === "email") return sourceKind === "EMAIL";
        if (filter === "note") return sourceKind === "NOTE";
        if (filter === "response") return corpusRole === "DILIGENCE_RESPONSE";
        return true;
      })
      .slice()
      .sort((left, right) => getTimelineDate(right).getTime() - getTimelineDate(left).getTime());

    const groups = new Map<string, Document[]>();
    for (const document of filtered) {
      const key = getTimelineDayKey(document);
      groups.set(key, [...(groups.get(key) ?? []), document]);
    }

    return Array.from(groups.entries()).map(([dayKey, groupDocuments]) => ({
      dayKey,
      date: getTimelineDate(groupDocuments[0]),
      documents: groupDocuments,
    }));
  }, [filter, localDocuments]);

  const handleUploadSuccess = useCallback((uploadedDocument?: UploadedDocumentSummary) => {
    if (uploadedDocument) {
      const normalizedDocument: Document = {
        id: uploadedDocument.id,
        name: uploadedDocument.name,
        type: uploadedDocument.type,
        hasStorage: uploadedDocument.hasStorage ?? true,
        mimeType: uploadedDocument.mimeType ?? null,
        processingStatus: uploadedDocument.processingStatus ?? "COMPLETED",
        extractionQuality: uploadedDocument.extractionQuality ?? null,
        extractionMetrics: uploadedDocument.extractionMetrics,
        extractionWarnings: uploadedDocument.extractionWarnings ?? null,
        requiresOCR: uploadedDocument.requiresOCR ?? false,
        uploadedAt: uploadedDocument.uploadedAt ? new Date(uploadedDocument.uploadedAt) : new Date(),
        sourceKind: uploadedDocument.sourceKind ?? "FILE",
        corpusRole: uploadedDocument.corpusRole ?? "GENERAL",
        sourceDate: uploadedDocument.sourceDate ?? null,
        receivedAt: uploadedDocument.receivedAt ?? null,
        sourceAuthor: uploadedDocument.sourceAuthor ?? null,
        sourceSubject: uploadedDocument.sourceSubject ?? null,
        linkedQuestionSource: uploadedDocument.linkedQuestionSource ?? null,
        linkedQuestionText: uploadedDocument.linkedQuestionText ?? null,
        linkedRedFlagId: uploadedDocument.linkedRedFlagId ?? null,
        corpusParentDocumentId: uploadedDocument.corpusParentDocumentId ?? null,
        corpusParentDocument: uploadedDocument.corpusParentDocument ?? null,
      };
      setLocalDocuments((currentDocuments) => [
        normalizedDocument,
        ...currentDocuments.filter((document) => document.id !== normalizedDocument.id),
      ].sort((left, right) => (
        getTimelineDate(right).getTime() - getTimelineDate(left).getTime()
      )));
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.staleness.byDeal(dealId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
    queryClient.invalidateQueries({ queryKey: ["deal-document-readiness", dealId] });
  }, [queryClient, dealId]);

  const openUploadDialog = useCallback(() => {
    setIsUploadOpen(true);
  }, []);

  const openPreview = useCallback((doc: Document) => {
    setPreviewDoc(doc);
  }, []);

  const openAudit = useCallback((doc: Document) => {
    setAuditDoc(doc);
  }, []);

  const refreshLocalDocument = useCallback(async (documentId: string) => {
    const refreshed = await fetchDocument(documentId);
    if (!refreshed) return;
    const normalized = { ...refreshed, uploadedAt: new Date(refreshed.uploadedAt) };
    setLocalDocuments((currentDocuments) =>
      currentDocuments.map((document) => (
        document.id === documentId ? normalized : document
      ))
    );
    setAuditDoc((current) => (
      current?.id === documentId ? normalized : current
    ));
    queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
    queryClient.invalidateQueries({ queryKey: ["deal-document-readiness", dealId] });
  }, [dealId, queryClient]);

  const openRename = useCallback((doc: Document) => {
    setRenameDoc(doc);
    setNewName(doc.name);
  }, []);

  // B3.1.1 P1 — concurrent-retry guard. A double-click on the FAILED
  // retry button could otherwise race: request A flips the server to
  // PROCESSING, request B gets 409 "already processing", and request B's
  // catch clause reverts the local row to FAILED — UI lies while the
  // extraction actually runs. The set blocks the second invocation
  // synchronously, and the disabled state on the button (subscribed to the
  // set) prevents the second click visually.
  const [retryingDocumentIds, setRetryingDocumentIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  /**
   * B3.1 — retry extraction for a FAILED document. Calls the existing
   * `POST /api/documents/[id]/process` route (Phase 4 durable extraction:
   * the route claims PROCESSING, deducts credits, creates a new
   * extraction run, enqueues an Inngest event). Optimistically transitions
   * the local row to PROCESSING so the badge updates immediately and the
   * polling effect picks it up. Failures revert and surface a toast.
   *
   * B3.1.1 — concurrency-safe: per-doc guard + 409 "already processing"
   * is treated as success (the server confirms the doc IS processing,
   * which is exactly the state we optimistically transitioned to).
   */
  const handleRetryExtraction = useCallback(
    async (documentId: string) => {
      // P1 — synchronous guard. Even if React hasn't re-rendered the button
      // disabled state yet, a second invocation bails out cleanly.
      if (retryingDocumentIds.has(documentId)) return;
      const previous = localDocuments.find((d) => d.id === documentId);
      if (!previous) return;
      const previousStatus = previous.processingStatus;

      setRetryingDocumentIds((prev) => {
        const next = new Set(prev);
        next.add(documentId);
        return next;
      });
      // Optimistic local transition. The polling effect (PROCESSING + PENDING)
      // will pick this row up on its next tick and observe the real transition
      // when the server settles.
      setLocalDocuments((current) =>
        current.map((doc) =>
          doc.id === documentId ? { ...doc, processingStatus: "PROCESSING" } : doc
        )
      );

      const invalidateAfterRetry = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
        queryClient.invalidateQueries({ queryKey: ["deal-document-readiness", dealId] });
      };

      try {
        const response = await clerkFetch(`/api/documents/${documentId}/process`, {
          method: "POST",
        });
        if (response.ok) {
          toast.success("Extraction relancée");
          invalidateAfterRetry();
          return;
        }
        // B3.3.2 P1 — DISTINGUISH 409 reasons. Previous code treated ALL
        // 409s as success, but /process now returns 409 for at least
        // three distinct cases:
        //   - reason=already_processing → race lost to a concurrent retry;
        //     our optimistic PROCESSING is still correct → refetch.
        //   - reason=not_stale → user clicked too soon; revert + toast.
        //   - reason=analysis_running → deal-level gate; revert + toast.
        //   - reason=wrong_status (e.g. COMPLETED) → revert + toast.
        //   - reason=stale_retry_race (B3.3.3) → another worker won the race
        //     after we terminalized the stale run; revert + toast (NOT success,
        //     because we may have just killed the run that was working).
        // Treating all as success silently swallowed real errors.
        if (response.status === 409) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            reason?: string;
          };
          if (body.reason === "already_processing") {
            invalidateAfterRetry();
            return;
          }
          // Revert optimistic state and surface the server's message.
          setLocalDocuments((current) =>
            current.map((doc) =>
              doc.id === documentId ? { ...doc, processingStatus: previousStatus } : doc
            )
          );
          toast.error(body.error ?? "Le serveur refuse cette relance pour le moment.");
          return;
        }
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Reprocess HTTP ${response.status}`);
      } catch (error) {
        // Revert the optimistic state — leave the user looking at the same
        // FAILED row they clicked retry on, with a clear toast.
        setLocalDocuments((current) =>
          current.map((doc) =>
            doc.id === documentId ? { ...doc, processingStatus: previousStatus } : doc
          )
        );
        const msg = error instanceof Error ? error.message : "Échec du redémarrage de l'extraction";
        toast.error(msg);
      } finally {
        setRetryingDocumentIds((prev) => {
          if (!prev.has(documentId)) return prev;
          const next = new Set(prev);
          next.delete(documentId);
          return next;
        });
      }
    },
    [dealId, localDocuments, queryClient, retryingDocumentIds]
  );

  const handleRename = useCallback(async () => {
    if (!renameDoc || !newName.trim()) return;

    setIsLoading(true);
    try {
      const response = await clerkFetch(`/api/documents/${renameDoc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to rename");
      }

      toast.success("Document renommé");
      setLocalDocuments((currentDocuments) =>
        currentDocuments.map((document) =>
          document.id === renameDoc.id ? { ...document, name: newName.trim() } : document
        )
      );
      setRenameDoc(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du renommage");
    } finally {
      setIsLoading(false);
    }
  }, [renameDoc, newName, queryClient, dealId]);

  const handleDelete = useCallback(async () => {
    if (!deleteDoc) return;

    setIsLoading(true);
    try {
      const response = await clerkFetch(`/api/documents/${deleteDoc.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to delete");
      }

      toast.success("Document supprimé");
      setLocalDocuments((currentDocuments) =>
        currentDocuments.filter((document) => document.id !== deleteDoc.id)
      );
      setPreviewDoc((current) => current?.id === deleteDoc.id ? null : current);
      setTextPreviewDoc((current) => current?.id === deleteDoc.id ? null : current);
      setAuditDoc((current) => current?.id === deleteDoc.id ? null : current);
      setDeleteDoc(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.staleness.byDeal(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
      queryClient.invalidateQueries({ queryKey: ["deal-document-readiness", dealId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression");
    } finally {
      setIsLoading(false);
    }
  }, [deleteDoc, queryClient, dealId]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Documents</CardTitle>
              <CardDescription>
                Corpus chronologique du deal : fichiers, emails et notes
              </CardDescription>
            </div>
            <Button type="button" onClick={openUploadDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter au corpus
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            {localDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">Aucun document</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ajoutez un fichier, un email ou une note pour commencer
                  l&apos;analyse.
                </p>
                <Button type="button" className="mt-4" onClick={openUploadDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter au corpus
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {localDocuments
                  .filter((doc) => getSourceKind(doc) === "FILE")
                  .filter((doc) => doc.extractionQuality !== null && doc.extractionQuality < 40)
                  .slice(0, 1)
                  .map((doc) => (
                    <ExtractionWarningBanner
                      key={`warning-${doc.id}`}
                      quality={doc.extractionQuality}
                      warnings={doc.extractionWarnings}
                      documentName={doc.name}
                      documentId={doc.id}
                      onReupload={openUploadDialog}
                      onOCRComplete={() => {
                        toast.success("OCR terminé");
                        queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
                        queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
                        queryClient.invalidateQueries({ queryKey: ["deal-document-readiness", dealId] });
                      }}
                    />
                  ))}

                <Tabs value={filter} onValueChange={(value) => setFilter(value as DocumentFilter)}>
                  <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-5">
                    <TabsTrigger value="all">Tous</TabsTrigger>
                    <TabsTrigger value="file">Fichiers</TabsTrigger>
                    <TabsTrigger value="email">Emails</TabsTrigger>
                    <TabsTrigger value="note">Notes</TabsTrigger>
                    <TabsTrigger value="response">Réponses</TabsTrigger>
                  </TabsList>
                </Tabs>

                {timelineGroups.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Aucune pièce ne correspond à ce filtre.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {timelineGroups.map((group) => (
                      <div key={group.dayKey} className="space-y-2">
                        <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between rounded-md bg-background/95 px-1 py-1.5 backdrop-blur">
                          <p className="text-sm font-semibold text-foreground">
                            {format(group.date, "d MMMM yyyy", { locale: fr })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {group.documents.length} pièce{group.documents.length > 1 ? "s" : ""}
                          </p>
                        </div>

                        <div className="space-y-2">
                          {group.documents.map((doc) => {
                            const sourceKind = getSourceKind(doc);
                            const corpusRole = getCorpusRole(doc);
                            const SourceIcon = getSourceIcon(sourceKind);
                            const extractionSummary = getExtractionMetricSummary(doc.extractionMetrics);
                            const isTextCorpus = sourceKind !== "FILE" && !doc.hasStorage;
                            const parentName = doc.corpusParentDocument?.name
                              ?? (doc.corpusParentDocumentId ? documentNameById.get(doc.corpusParentDocumentId) : null)
                              ?? null;
                            const secondaryLine = getSecondaryLine(doc, parentName);
                            const attachmentCount = attachmentCountByParentId.get(doc.id) ?? 0;
                            return (
                              <div
                                key={doc.id}
                                className="flex flex-col gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                                    <SourceIcon className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                  <div className="min-w-0 space-y-1">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <p className="truncate font-medium">{doc.name}</p>
                                      <Badge variant="outline" className={getSourceBadgeClass(sourceKind)}>
                                        {getSourceLabel(sourceKind)}
                                      </Badge>
                                      {corpusRole === "DILIGENCE_RESPONSE" && (
                                        <Badge
                                          variant="outline"
                                          className="border-emerald-200 bg-emerald-50 text-emerald-700"
                                        >
                                          Réponse
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="truncate text-sm text-muted-foreground">
                                      {secondaryLine || doc.type} · Produit le{" "}
                                      {format(getTimelineDate(doc), "d MMM yyyy", { locale: fr })}
                                    </p>
                                    {doc.linkedQuestionText && (
                                      <p className="truncate text-xs text-emerald-700">
                                        Répond à : {doc.linkedQuestionText}
                                      </p>
                                    )}
                                    {attachmentCount > 0 && (
                                      <p className="truncate text-xs text-blue-700">
                                        {attachmentCount} fichier{attachmentCount > 1 ? "s" : ""} joint{attachmentCount > 1 ? "s" : ""}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex shrink-0 flex-wrap items-center gap-1">
                                  {/* Phase 8 — Evidence health badge (contradictions, missing, freshness) */}
                                  <EvidenceHealthBadge
                                    summary={evidenceHealth?.byDocument[doc.id]}
                                    compact
                                  />
                                  {hasAnalysis && doc.processingStatus === "COMPLETED" && !analyzedDocIds.has(doc.id) && (
                                    <Badge
                                      variant="outline"
                                      className="gap-1 border-amber-400 bg-amber-50 text-amber-700"
                                    >
                                      <AlertTriangle className="h-3 w-3" />
                                      Non analysé
                                    </Badge>
                                  )}
                                  {isTextCorpus ? (
                                    <Badge
                                      variant="outline"
                                      className="border-slate-200 bg-slate-50 text-slate-700"
                                    >
                                      Texte utilisateur
                                    </Badge>
                                  ) : doc.mimeType === "application/pdf" ? (
                                    <ExtractionQualityBadge
                                      quality={doc.extractionQuality}
                                      warnings={doc.extractionWarnings}
                                      requiresOCR={doc.requiresOCR}
                                      processingStatus={doc.processingStatus}
                                      extractionStatus={extractionSummary.status}
                                      blockingCount={extractionSummary.blockingCount}
                                      inspectionCount={extractionSummary.inspectionCount}
                                    />
                                  ) : (
                                    <Badge
                                      variant={
                                        doc.processingStatus === "COMPLETED"
                                          ? "default"
                                          : doc.processingStatus === "FAILED"
                                          ? "destructive"
                                          : "secondary"
                                      }
                                      className={
                                        doc.processingStatus === "COMPLETED"
                                          ? "bg-green-100 text-green-700"
                                          : doc.processingStatus === "PROCESSING"
                                          ? "bg-blue-100 text-blue-700"
                                          : doc.processingStatus === "PENDING"
                                          ? "bg-gray-100 text-gray-600"
                                          : undefined
                                      }
                                    >
                                      {/* B3.1 — labels alignés avec le modal upload pour cohérence cross-surface. */}
                                      {doc.processingStatus === "COMPLETED"
                                        ? "Extrait"
                                        : doc.processingStatus === "PROCESSING"
                                        ? "Extraction en cours"
                                        : doc.processingStatus === "PENDING"
                                        ? "En attente d'extraction"
                                        : doc.processingStatus === "FAILED"
                                        ? "Extraction échouée"
                                        : doc.processingStatus}
                                    </Badge>
                                  )}
                                  {/* B3.3 — stale PROCESSING/PENDING surface.
                                      Show a "Bloqué depuis Xmin" badge so the
                                      user knows the run is stuck, then surface
                                      the same retry button as FAILED. The
                                      server's POST /api/documents/[id]/process
                                      validates ownership, so non-owner can't
                                      retry even if they construct the URL. */}
                                  {(() => {
                                    const staleness = isDocumentStale({
                                      processingStatus: doc.processingStatus,
                                      uploadedAt: doc.uploadedAt,
                                    });
                                    if (!staleness.stale) return null;
                                    return (
                                      <Badge
                                        variant="outline"
                                        className="gap-1 border-amber-400 bg-amber-50 text-amber-800"
                                        title="L'extraction prend plus longtemps que prévu."
                                      >
                                        <AlertTriangle className="h-3 w-3" />
                                        Bloqué depuis {formatStalenessAge(staleness.ageMs ?? 0)}
                                      </Badge>
                                    );
                                  })()}
                                  {/* B3.1 — retry on FAILED. POST /api/documents/[id]/process
                                      claims PROCESSING + deducts credits + enqueues a new
                                      extraction run.
                                      B3.1.1 — disabled while a previous retry is still in
                                      flight (prevents the double-click revert-to-FAILED race).
                                      B3.3.1 (Codex P1 fixes):
                                        - PDF only — `/process` returns 400 for non-PDF, so
                                          the button would be a guaranteed no-op.
                                        - PROCESSING never retried — the server returns 409
                                          which the client treats as success (B3.1.1 logic
                                          for double-click races). Without a real repair
                                          endpoint, a "retry" on PROCESSING is a silent no-op.
                                          The "Bloqué depuis" badge still surfaces visibility.
                                        - PENDING needs stale (server validates too). */}
                                  {doc.mimeType === "application/pdf" &&
                                    (doc.processingStatus === "FAILED" ||
                                      (doc.processingStatus === "PENDING" &&
                                        isDocumentStale({
                                          processingStatus: doc.processingStatus,
                                          uploadedAt: doc.uploadedAt,
                                        }).stale)) && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          void handleRetryExtraction(doc.id);
                                        }}
                                        disabled={retryingDocumentIds.has(doc.id)}
                                        title="Relancer l'extraction"
                                        aria-label={`Relancer l'extraction de ${doc.name}`}
                                      >
                                        <RotateCw
                                          className={cn(
                                            "mr-1 h-4 w-4",
                                            retryingDocumentIds.has(doc.id) && "animate-spin"
                                          )}
                                        />
                                        Réessayer
                                      </Button>
                                    )}
                                  {isTextCorpus ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setTextPreviewDoc(doc)}
                                    >
                                      <Eye className="mr-1 h-4 w-4" />
                                      Aperçu texte
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openPreview(doc)}
                                        disabled={!doc.hasStorage}
                                      >
                                        <Eye className="mr-1 h-4 w-4" />
                                        Voir
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openAudit(doc)}
                                        disabled={doc.processingStatus !== "COMPLETED"}
                                      >
                                        <FileSearch className="mr-1 h-4 w-4" />
                                        Audit
                                      </Button>
                                    </>
                                  )}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label={`Options pour ${doc.name}`}
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => openRename(doc)}>
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Renommer
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => setDeleteDoc(doc)}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Supprimer
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <DocumentUploadDialog
        dealId={dealId}
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Preview Dialog */}
      <DocumentPreviewDialog
        open={!!previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
        document={previewDoc}
      />

      <TextPreviewDialog
        open={!!textPreviewDoc}
        onOpenChange={(open) => !open && setTextPreviewDoc(null)}
        document={textPreviewDoc}
      />

      <DocumentExtractionAuditDialog
        open={!!auditDoc}
        onOpenChange={(open) => !open && setAuditDoc(null)}
        // B6.1 — pass dealId + sourceDate through so the audit dialog
        // can wire the Metadata Editor (CalendarDays button → opens
        // DocumentMetadataDialog). Older callers of
        // DocumentExtractionAuditDialog without these fields keep
        // working — the button gates on dealId being present.
        document={
          auditDoc
            ? {
                id: auditDoc.id,
                name: auditDoc.name,
                dealId,
                sourceDate: auditDoc.sourceDate ?? null,
                // B6.2 — forward type + sourceKind so the metadata
                // dialog can pre-fill its dropdowns with the current
                // values (vs always defaulting to the placeholder).
                type: auditDoc.type ?? null,
                sourceKind: auditDoc.sourceKind ?? null,
                // B6.3 — forward email metadata for pre-fill in the
                // metadata editor's email section.
                receivedAt: auditDoc.receivedAt ?? null,
                sourceAuthor: auditDoc.sourceAuthor ?? null,
                sourceSubject: auditDoc.sourceSubject ?? null,
              }
            : null
        }
        onDocumentUpdated={refreshLocalDocument}
      />

      {/* Rename Dialog */}
      <Dialog open={!!renameDoc} onOpenChange={(open) => !open && setRenameDoc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renommer le document</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nouveau nom"
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDoc(null)}>
              Annuler
            </Button>
            <Button onClick={handleRename} disabled={isLoading || !newName.trim()}>
              {isLoading ? "..." : "Renommer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDoc} onOpenChange={(open) => !open && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDoc?.name} sera définitivement supprimé. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? "..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
