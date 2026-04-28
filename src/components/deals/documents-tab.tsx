"use client";

import { useCallback, useEffect, useState, useMemo, memo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Eye, FileSearch, FileText, MoreHorizontal, Pencil, Trash2, Upload, AlertTriangle } from "lucide-react";
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
import {
  ExtractionQualityBadge,
  ExtractionWarningBanner,
} from "./extraction-quality-badge";

interface Document {
  id: string;
  name: string;
  type: string;
  storageUrl: string | null;
  mimeType: string | null;
  processingStatus: string;
  extractionQuality: number | null;
  extractionMetrics?: unknown;
  extractionWarnings: { code: string; severity: "critical" | "high" | "medium" | "low"; message: string; suggestion: string }[] | null;
  requiresOCR: boolean;
  uploadedAt: Date;
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

async function fetchStaleness(dealId: string): Promise<StalenessInfo> {
  const response = await fetch(`/api/deals/${dealId}/staleness`);
  if (!response.ok) throw new Error("Failed to fetch staleness");
  return response.json();
}

async function fetchDocument(documentId: string): Promise<Document | null> {
  const response = await fetch(`/api/documents/${documentId}`);
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

export const DocumentsTab = memo(function DocumentsTab({ dealId, documents }: DocumentsTabProps) {
  const queryClient = useQueryClient();
  const [localDocuments, setLocalDocuments] = useState<Document[]>(documents);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [auditDoc, setAuditDoc] = useState<Document | null>(null);
  const [renameDoc, setRenameDoc] = useState<Document | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setLocalDocuments(documents);
  }, [documents]);

  const processingDocumentIdsKey = useMemo(() => (
    localDocuments
      .filter((document) => document.processingStatus === "PROCESSING")
      .map((document) => document.id)
      .sort()
      .join("|")
  ), [localDocuments]);

  useEffect(() => {
    const processingIds = processingDocumentIdsKey
      ? processingDocumentIdsKey.split("|")
      : [];
    if (processingIds.length === 0) return;

    let cancelled = false;
    const refreshProcessingDocuments = async () => {
      const refreshedDocuments = await Promise.all(processingIds.map(fetchDocument));
      if (cancelled) return;
      const refreshedById = new Map(
        refreshedDocuments
          .filter((document): document is Document => Boolean(document))
          .map((document) => [document.id, document])
      );
      if (refreshedById.size === 0) return;
      setLocalDocuments((currentDocuments) =>
        currentDocuments.map((document) => {
          const refreshed = refreshedById.get(document.id);
          return refreshed
            ? { ...refreshed, uploadedAt: new Date(refreshed.uploadedAt) }
            : document;
        })
      );
    };

    const intervalId = window.setInterval(refreshProcessingDocuments, 5_000);
    void refreshProcessingDocuments();
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [processingDocumentIdsKey]);

  // Fetch staleness info to know which documents were analyzed
  const { data: stalenessData } = useQuery({
    queryKey: queryKeys.staleness.byDeal(dealId),
    queryFn: () => fetchStaleness(dealId),
    staleTime: 30_000,
  });

  // Set of document IDs that have been analyzed
  const analyzedDocIds = useMemo(() => {
    if (!stalenessData?.staleness?.analyzedDocumentIds) {
      return new Set<string>();
    }
    return new Set(stalenessData.staleness.analyzedDocumentIds);
  }, [stalenessData]);

  // Check if there's at least one analysis
  const hasAnalysis = stalenessData?.hasAnalysis ?? false;

  const handleUploadSuccess = useCallback((uploadedDocument?: UploadedDocumentSummary) => {
    if (uploadedDocument) {
      const normalizedDocument: Document = {
        id: uploadedDocument.id,
        name: uploadedDocument.name,
        type: uploadedDocument.type,
        storageUrl: uploadedDocument.storageUrl ?? null,
        mimeType: uploadedDocument.mimeType ?? null,
        processingStatus: uploadedDocument.processingStatus ?? "COMPLETED",
        extractionQuality: uploadedDocument.extractionQuality ?? null,
        extractionMetrics: uploadedDocument.extractionMetrics,
        extractionWarnings: uploadedDocument.extractionWarnings ?? null,
        requiresOCR: uploadedDocument.requiresOCR ?? false,
        uploadedAt: uploadedDocument.uploadedAt ? new Date(uploadedDocument.uploadedAt) : new Date(),
      };
      setLocalDocuments((currentDocuments) => [
        normalizedDocument,
        ...currentDocuments.filter((document) => document.id !== normalizedDocument.id),
      ].sort((left, right) => (
        new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime()
      )));
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.staleness.byDeal(dealId) });
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

  const openRename = useCallback((doc: Document) => {
    setRenameDoc(doc);
    setNewName(doc.name);
  }, []);

  const handleRename = useCallback(async () => {
    if (!renameDoc || !newName.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/documents/${renameDoc.id}`, {
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
      const response = await fetch(`/api/documents/${deleteDoc.id}`, {
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
      setDeleteDoc(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.staleness.byDeal(dealId) });
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
                Fichiers uploadés pour ce deal
              </CardDescription>
            </div>
            <Button onClick={openUploadDialog}>
              <Upload className="mr-2 h-4 w-4" />
              Importer
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
                  Uploadez un pitch deck, financial model ou autre document pour
                  commencer l&apos;analyse.
                </p>
                <Button className="mt-4" onClick={openUploadDialog}>
                  <Upload className="mr-2 h-4 w-4" />
                  Importer un document
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {localDocuments
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
                        queryClient.invalidateQueries({ queryKey: ["deal-document-readiness", dealId] });
                      }}
                    />
                  ))}
                {localDocuments.map((doc) => {
                  const extractionSummary = getExtractionMetricSummary(doc.extractionMetrics);
                  return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{doc.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.type} •{" "}
                          {format(new Date(doc.uploadedAt), "d MMM yyyy", {
                            locale: fr,
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Show "Non analysé" badge if document wasn't included in analysis */}
                      {hasAnalysis && doc.processingStatus === "COMPLETED" && !analyzedDocIds.has(doc.id) && (
                        <Badge
                          variant="outline"
                          className="border-amber-400 bg-amber-50 text-amber-700 gap-1"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Non analyse
                        </Badge>
                      )}
                      {doc.mimeType === "application/pdf" ? (
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
                          {doc.processingStatus === "COMPLETED"
                            ? "Extrait"
                            : doc.processingStatus === "PROCESSING"
                            ? "Traitement..."
                            : doc.processingStatus === "PENDING"
                            ? "En attente"
                            : doc.processingStatus === "FAILED"
                            ? "Échec"
                            : doc.processingStatus}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openPreview(doc)}
                        disabled={!doc.storageUrl}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Voir
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAudit(doc)}
                        disabled={doc.processingStatus !== "COMPLETED"}
                      >
                        <FileSearch className="h-4 w-4 mr-1" />
                        Audit
                      </Button>
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
                            <Pencil className="h-4 w-4 mr-2" />
                            Renommer
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteDoc(doc)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  );
                })}
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

      <DocumentExtractionAuditDialog
        open={!!auditDoc}
        onOpenChange={(open) => !open && setAuditDoc(null)}
        document={auditDoc}
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
