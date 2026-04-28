"use client";

import { FileText, Loader2, Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_TYPES,
  type DocumentType,
  type UploadedDocumentSummary,
} from "@/components/deals/file-upload";
import { cn } from "@/lib/utils";

export interface CorpusAttachmentDraft {
  id: string;
  file: File;
  documentType: DocumentType;
  customType: string;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

const ACCEPTED_ATTACHMENT_TYPES = [
  ".pdf",
  ".xlsx",
  ".xls",
  ".pptx",
  ".ppt",
  ".docx",
  ".doc",
  ".png",
  ".jpg",
  ".jpeg",
].join(",");

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createAttachmentDrafts(files: File[]): CorpusAttachmentDraft[] {
  return files.map((file) => ({
    id: crypto.randomUUID(),
    file,
    documentType: "OTHER",
    customType: "",
    status: "pending",
  }));
}

export async function uploadCorpusAttachment({
  dealId,
  corpusParentDocumentId,
  attachment,
}: {
  dealId: string;
  corpusParentDocumentId: string;
  attachment: CorpusAttachmentDraft;
}): Promise<UploadedDocumentSummary> {
  const formData = new FormData();
  formData.append("file", attachment.file);
  formData.append("dealId", dealId);
  formData.append("type", attachment.documentType);
  formData.append("corpusParentDocumentId", corpusParentDocumentId);
  if (attachment.documentType === "OTHER" && attachment.customType.trim()) {
    formData.append("customType", attachment.customType.trim());
  }

  const response = await fetch("/api/documents/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Upload failed (${response.status})`);
  }

  const result = await response.json();
  return {
    ...result.data,
    id: result.data.id,
    name: result.data.name ?? attachment.file.name,
    type: result.data.type ?? attachment.documentType,
    corpusParentDocumentId,
    corpusParentDocument: result.data.corpusParentDocument ?? null,
  };
}

export function AttachmentInput({
  value,
  onChange,
  disabled = false,
}: {
  value: CorpusAttachmentDraft[];
  onChange: (next: CorpusAttachmentDraft[]) => void;
  disabled?: boolean;
}) {
  const updateAttachment = (id: string, updates: Partial<CorpusAttachmentDraft>) => {
    onChange(value.map((attachment) => (
      attachment.id === id ? { ...attachment, ...updates } : attachment
    )));
  };

  const removeAttachment = (id: string) => {
    onChange(value.filter((attachment) => attachment.id !== id));
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            Fichiers joints (optionnel)
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajoutez un modèle financier, deck ou document reçu avec cet email/cette note.
          </p>
        </div>
        <Input
          type="file"
          multiple
          accept={ACCEPTED_ATTACHMENT_TYPES}
          disabled={disabled}
          className="max-w-56"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) {
              onChange([...value, ...createAttachmentDrafts(files)]);
            }
            event.target.value = "";
          }}
        />
      </div>

      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((attachment) => {
            const isPending = attachment.status === "pending";
            return (
              <div
                key={attachment.id}
                className={cn(
                  "space-y-2 rounded-md border bg-background p-2",
                  attachment.status === "success" && "border-emerald-200 bg-emerald-50",
                  attachment.status === "error" && "border-red-200 bg-red-50",
                  attachment.status === "uploading" && "border-blue-200 bg-blue-50"
                )}
              >
                <div className="flex items-center gap-2">
                  {attachment.status === "uploading" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm" title={attachment.file.name}>
                    {attachment.file.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFileSize(attachment.file.size)}
                  </span>
                  {isPending ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={disabled}
                      onClick={() => removeAttachment(attachment.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
                {isPending ? (
                  <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                    <Select
                      value={attachment.documentType}
                      onValueChange={(documentType: DocumentType) => updateAttachment(attachment.id, { documentType })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((documentType) => (
                          <SelectItem key={documentType.value} value={documentType.value}>
                            {documentType.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {attachment.documentType === "OTHER" ? (
                      <Input
                        value={attachment.customType}
                        onChange={(event) => updateAttachment(attachment.id, { customType: event.target.value })}
                        placeholder="Type libre (optionnel)"
                        className="h-8 text-xs"
                        disabled={disabled}
                      />
                    ) : null}
                  </div>
                ) : null}
                {attachment.error ? (
                  <p className="text-xs text-red-700">{attachment.error}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
