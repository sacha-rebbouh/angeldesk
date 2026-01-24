"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Eye, FileText, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
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
  extractionWarnings: { code: string; severity: "critical" | "high" | "medium" | "low"; message: string; suggestion: string }[] | null;
  requiresOCR: boolean;
  uploadedAt: Date;
}

interface DocumentsTabProps {
  dealId: string;
  documents: Document[];
}

export function DocumentsTab({ dealId, documents }: DocumentsTabProps) {
  const router = useRouter();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [renameDoc, setRenameDoc] = useState<Document | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleUploadSuccess = useCallback(() => {
    router.refresh();
  }, [router]);

  const openUploadDialog = useCallback(() => {
    setIsUploadOpen(true);
  }, []);

  const openPreview = useCallback((doc: Document) => {
    setPreviewDoc(doc);
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
      setRenameDoc(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du renommage");
    } finally {
      setIsLoading(false);
    }
  }, [renameDoc, newName, router]);

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
      setDeleteDoc(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression");
    } finally {
      setIsLoading(false);
    }
  }, [deleteDoc, router]);

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
              Upload
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">Aucun document</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Uploadez un pitch deck, financial model ou autre document pour
                  commencer l&apos;analyse.
                </p>
                <Button className="mt-4" onClick={openUploadDialog}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload un document
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {documents
                  .filter((doc) => doc.extractionQuality !== null && doc.extractionQuality < 40)
                  .slice(0, 1)
                  .map((doc) => (
                    <ExtractionWarningBanner
                      key={`warning-${doc.id}`}
                      quality={doc.extractionQuality}
                      warnings={doc.extractionWarnings}
                      documentName={doc.name}
                    />
                  ))}
                {documents.map((doc) => (
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
                      {doc.mimeType === "application/pdf" ? (
                        <ExtractionQualityBadge
                          quality={doc.extractionQuality}
                          warnings={doc.extractionWarnings}
                          requiresOCR={doc.requiresOCR}
                          processingStatus={doc.processingStatus}
                        />
                      ) : (
                        <Badge
                          variant={
                            doc.processingStatus === "COMPLETED"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {doc.processingStatus}
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
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
                ))}
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
}
