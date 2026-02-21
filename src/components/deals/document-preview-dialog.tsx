"use client";

import { memo } from "react";
import { Download, ExternalLink, FileSpreadsheet, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    name: string;
    storageUrl: string | null;
    mimeType: string | null;
    type: string;
  } | null;
}

export const DocumentPreviewDialog = memo(function DocumentPreviewDialog({
  open,
  onOpenChange,
  document,
}: DocumentPreviewDialogProps) {
  if (!document) return null;

  const handleDownload = () => {
    if (document.storageUrl) {
      window.open(document.storageUrl, "_blank");
    }
  };

  const handleOpenNewTab = () => {
    if (document.storageUrl) {
      window.open(document.storageUrl, "_blank");
    }
  };

  const isPdf = document.mimeType === "application/pdf";
  const isImage = document.mimeType?.startsWith("image/");
  const isPreviewable = isPdf || isImage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-medium truncate pr-4">
              {document.name}
            </DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleOpenNewTab}>
                <ExternalLink className="h-4 w-4 mr-1" />
                Nouvel onglet
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" />
                Télécharger
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 min-h-0 bg-muted/30">
          {isPdf && document.storageUrl && (
            <iframe
              src={`${document.storageUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full border-0"
              title={document.name}
            />
          )}

          {isImage && document.storageUrl && (
            <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
              <img
                src={document.storageUrl}
                alt={document.name}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}

          {!isPreviewable && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
              <FileSpreadsheet className="h-16 w-16" />
              <div className="text-center">
                <p className="font-medium">Aperçu non disponible</p>
                <p className="text-sm mt-1">
                  Les fichiers {document.mimeType?.includes("spreadsheet") || document.mimeType?.includes("excel")
                    ? "Excel"
                    : "PowerPoint"} ne peuvent pas être prévisualisés
                </p>
              </div>
              <Button onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Télécharger le fichier
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
