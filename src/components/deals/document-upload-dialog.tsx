"use client";

import { useCallback, useState, memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUpload, type UploadedDocumentSummary } from "./file-upload";
import { EmailForm } from "./corpus/email-form";
import { NoteForm } from "./corpus/note-form";
import { queryKeys } from "@/lib/query-keys";

interface DocumentUploadDialogProps {
  dealId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: (document?: UploadedDocumentSummary) => void;
}

export const DocumentUploadDialog = memo(function DocumentUploadDialog({
  dealId,
  open,
  onOpenChange,
  onUploadSuccess,
}: DocumentUploadDialogProps) {
  const queryClient = useQueryClient();
  const [uploadedCount, setUploadedCount] = useState(0);
  const [hasUploaded, setHasUploaded] = useState(false);

  const handleUploadComplete = useCallback((document: UploadedDocumentSummary) => {
    setUploadedCount((prev) => prev + 1);
    setHasUploaded(true);
    onUploadSuccess?.(document);
  }, [onUploadSuccess]);

  const handleUploadQueued = useCallback((document: UploadedDocumentSummary) => {
    setHasUploaded(true);
    onUploadSuccess?.(document);
  }, [onUploadSuccess]);

  const handleTextCreated = useCallback((document: UploadedDocumentSummary) => {
    setUploadedCount((prev) => prev + 1);
    setHasUploaded(true);
    toast.success("Pièce ajoutée au corpus");
    onUploadSuccess?.(document);
    queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
  }, [dealId, onUploadSuccess, queryClient]);

  const handleAllComplete = useCallback(() => {
    toast.success("Documents uploadés avec succès");
    // Auto-close after short delay to show success state
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      setUploadedCount(0);
      setHasUploaded(false);
      onOpenChange(false);
    }, 500);
  }, [queryClient, dealId, onOpenChange]);

  const handleError = useCallback((error: string) => {
    toast.error(error);
  }, []);

  const handleClose = useCallback(() => {
    if (hasUploaded) {
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
    }
    setUploadedCount(0);
    setHasUploaded(false);
    onOpenChange(false);
  }, [hasUploaded, queryClient, dealId, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Ajouter au corpus</DialogTitle>
          <DialogDescription>
            Ajoutez un fichier, un email ou une note de call. La chronologie du
            corpus utilise la date réelle de la pièce quand elle est fournie.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          <Tabs defaultValue="file" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="file">Fichier</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="note">Note</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="mt-0">
              <FileUpload
                dealId={dealId}
                onUploadQueued={handleUploadQueued}
                onUploadComplete={handleUploadComplete}
                onAllComplete={handleAllComplete}
                onError={handleError}
              />
            </TabsContent>
            <TabsContent value="email" className="mt-0">
              <EmailForm dealId={dealId} onCreated={handleTextCreated} onError={handleError} />
            </TabsContent>
            <TabsContent value="note" className="mt-0">
              <NoteForm dealId={dealId} onCreated={handleTextCreated} onError={handleError} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex justify-end gap-2 pt-4 shrink-0 border-t mt-4">
          {hasUploaded && (
            <p className="flex-1 text-sm text-muted-foreground">
              {uploadedCount} pièce{uploadedCount > 1 ? "s" : ""} ajoutée
              {uploadedCount > 1 ? "s" : ""}
            </p>
          )}
          <Button variant="outline" onClick={handleClose}>
            {hasUploaded ? "Terminé" : "Annuler"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});
