"use client";

import { useCallback, useState } from "react";
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
import { FileUpload } from "./file-upload";
import { queryKeys } from "@/lib/query-keys";

interface DocumentUploadDialogProps {
  dealId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
}

export function DocumentUploadDialog({
  dealId,
  open,
  onOpenChange,
  onUploadSuccess,
}: DocumentUploadDialogProps) {
  const queryClient = useQueryClient();
  const [uploadedCount, setUploadedCount] = useState(0);
  const [hasUploaded, setHasUploaded] = useState(false);

  const handleUploadComplete = useCallback(
    (document: { id: string; name: string }) => {
      setUploadedCount((prev) => prev + 1);
      setHasUploaded(true);
    },
    []
  );

  const handleAllComplete = useCallback(() => {
    toast.success("Documents uploadés avec succès");
    // Auto-close after short delay to show success state
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      onUploadSuccess?.();
      setUploadedCount(0);
      setHasUploaded(false);
      onOpenChange(false);
    }, 500);
  }, [queryClient, dealId, onUploadSuccess, onOpenChange]);

  const handleError = useCallback((error: string) => {
    toast.error(error);
  }, []);

  const handleClose = useCallback(() => {
    if (hasUploaded) {
      // Invalidate deal query to refresh documents
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      onUploadSuccess?.();
    }
    setUploadedCount(0);
    setHasUploaded(false);
    onOpenChange(false);
  }, [hasUploaded, queryClient, dealId, onUploadSuccess, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Ajouter des documents</DialogTitle>
          <DialogDescription>
            Uploadez vos pitch decks, financial models et autres documents pour
            l&apos;analyse IA.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          <FileUpload
            dealId={dealId}
            onUploadComplete={handleUploadComplete}
            onAllComplete={handleAllComplete}
            onError={handleError}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 shrink-0 border-t mt-4">
          {hasUploaded && (
            <p className="flex-1 text-sm text-muted-foreground">
              {uploadedCount} document{uploadedCount > 1 ? "s" : ""} uploadé
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
}
