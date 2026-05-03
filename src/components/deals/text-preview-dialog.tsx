"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TextPreviewDocument {
  id: string;
  name: string;
}

export function TextPreviewDialog({
  open,
  onOpenChange,
  document,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: TextPreviewDocument | null;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || !document) return;

    let cancelled = false;

    void Promise.resolve()
      .then(async () => {
        if (cancelled) return null;
        setIsLoading(true);
        setError(null);
        setText(null);

        const response = await fetch(`/api/documents/${document.id}?includeText=1`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Impossible de charger le texte");
        return payload.data?.extractedText ?? "";
      })
      .then((nextText) => {
        if (!cancelled && nextText !== null) setText(nextText);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Impossible de charger le texte");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [document, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{document?.name ?? "Aperçu texte"}</DialogTitle>
          <DialogDescription>Contenu texte ajouté au corpus.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/20 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Chargement du texte...
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : text ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{text}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun texte disponible.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
