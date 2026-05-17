"use client";

import { memo, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Download, ExternalLink, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { clerkFetch } from "@/lib/clerk-fetch";

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    name: string;
    hasStorage: boolean;
    mimeType: string | null;
    type: string;
  } | null;
}

export const DocumentPreviewDialog = memo(function DocumentPreviewDialog({
  open,
  onOpenChange,
  document,
}: DocumentPreviewDialogProps) {
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [isTextLoading, setIsTextLoading] = useState(false);

  const normalizedMimeType = document
    ? normalizePreviewMimeType(document.mimeType, document.name)
    : "";
  const isPdf = normalizedMimeType === "application/pdf";
  const isImage = normalizedMimeType.startsWith("image/");
  const canPreviewFile = Boolean(document?.hasStorage && (isPdf || isImage));
  const unsupportedLabel = getUnsupportedPreviewLabel(normalizedMimeType);

  useEffect(() => {
    if (!open || !document || canPreviewFile) return;

    let cancelled = false;

    void Promise.resolve()
      .then(async () => {
        if (cancelled) return null;
        setIsTextLoading(true);
        setTextError(null);
        setExtractedText(null);

        const response = await clerkFetch(`/api/documents/${document.id}?includeText=1`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Impossible de charger le texte extrait");
        return payload.data?.extractedText ?? "";
      })
      .then((text) => {
        if (!cancelled) setExtractedText(text);
      })
      .catch((error) => {
        if (!cancelled) {
          setTextError(error instanceof Error ? error.message : "Impossible de charger le texte extrait");
        }
      })
      .finally(() => {
        if (!cancelled) setIsTextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canPreviewFile, document, open]);

  if (!document) return null;

  const downloadUrl = `/api/documents/${document.id}/download`;
  const inlineUrl = `${downloadUrl}?disposition=inline`;

  const handleDownload = () => {
    window.open(downloadUrl, "_blank");
  };

  const handleOpenNewTab = () => {
    window.open(inlineUrl, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <DialogTitle className="min-w-0 flex-1 truncate text-base font-medium">
              {document.name}
            </DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleOpenNewTab} disabled={!document.hasStorage}>
                <ExternalLink className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Nouvel onglet</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload} disabled={!document.hasStorage}>
                <Download className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Télécharger</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                aria-label="Fermer l'aperçu"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 min-h-0 bg-muted/30">
          {canPreviewFile && isPdf && (
            <iframe
              src={`${inlineUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full border-0"
              title={document.name}
            />
          )}

          {canPreviewFile && isImage && (
            <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={inlineUrl}
                alt={document.name}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}

          {!canPreviewFile && (
            <ExtractedTextPreview
              documentName={document.name}
              unsupportedLabel={unsupportedLabel}
              text={extractedText}
              error={textError}
              isLoading={isTextLoading}
              canDownload={document.hasStorage}
              onDownload={handleDownload}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

function ExtractedTextPreview({
  documentName,
  unsupportedLabel,
  text,
  error,
  isLoading,
  canDownload,
  onDownload,
}: {
  documentName: string;
  unsupportedLabel: string;
  text: string | null;
  error: string | null;
  isLoading: boolean;
  canDownload: boolean;
  onDownload: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Chargement du texte extrait...
      </div>
    );
  }

  if (text) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b bg-background px-4 py-3">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Aperçu texte extrait</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Le fichier {unsupportedLabel} n&apos;est pas rendu nativement; affichage du contenu indexé dans le corpus.
              </p>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-background p-4">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{text}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground">
      <FileSpreadsheet className="h-16 w-16" />
      <div>
        <p className="font-medium">Aperçu non disponible</p>
        <p className="mt-1 text-sm">
          {error
            ? error
            : `Aucun texte extrait n'est disponible pour ${documentName}.`}
        </p>
      </div>
      {canDownload && (
        <Button onClick={onDownload}>
          <Download className="mr-2 h-4 w-4" />
          Télécharger le fichier
        </Button>
      )}
    </div>
  );
}

function normalizePreviewMimeType(mimeType: string | null, fileName: string): string {
  const normalized = mimeType?.trim().toLowerCase();
  if (normalized && normalized !== "application/octet-stream") return normalized;

  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "pdf") return "application/pdf";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension ?? "")) {
    return `image/${extension === "jpg" ? "jpeg" : extension}`;
  }
  if (["xls", "xlsx"].includes(extension ?? "")) return "application/vnd.ms-excel";
  if (["ppt", "pptx"].includes(extension ?? "")) return "application/vnd.ms-powerpoint";
  return normalized ?? "";
}

function getUnsupportedPreviewLabel(mimeType: string): string {
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "Excel";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "PowerPoint";
  return "de ce type";
}
