"use client";

import React, { memo, useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  Upload,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  Presentation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DOCUMENT_TYPES = [
  { value: "PITCH_DECK", label: "Pitch Deck" },
  { value: "FINANCIAL_MODEL", label: "Financial Model" },
  { value: "CAP_TABLE", label: "Cap Table" },
  { value: "TERM_SHEET", label: "Term Sheet" },
  { value: "INVESTOR_MEMO", label: "Investor Memo" },
  { value: "FINANCIAL_STATEMENTS", label: "États financiers" },
  { value: "LEGAL_DOCS", label: "Docs juridiques" },
  { value: "MARKET_STUDY", label: "Étude de marché" },
  { value: "PRODUCT_DEMO", label: "Demo produit" },
  { value: "OTHER", label: "Autre" },
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];

interface FileToUpload {
  id: string;
  file: File;
  documentType: DocumentType;
  customType: string;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

interface FileUploadProps {
  dealId: string;
  onUploadComplete?: (document: { id: string; name: string; type: string }) => void;
  onError?: (error: string) => void;
  onAllComplete?: () => void;
  disabled?: boolean;
}

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

const MAX_SIZE = 50 * 1024 * 1024;

function getFileIcon(mimeType: string) {
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return Presentation;
  return FileText;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FileUpload = memo(function FileUpload({
  dealId,
  onUploadComplete,
  onError,
  onAllComplete,
  disabled = false,
}: FileUploadProps) {
  const [files, setFiles] = useState<FileToUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      rejectedFiles.forEach((rejection) => {
        onError?.(`${rejection.file.name}: ${rejection.errors.map((e) => e.message).join(", ")}`);
      });

      const newFiles: FileToUpload[] = acceptedFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        documentType: "PITCH_DECK",
        customType: "",
        status: "pending",
      }));

      setFiles((prev) => [...prev, ...newFiles]);
    },
    [onError]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    disabled: disabled || isUploading,
  });

  const updateFile = useCallback((id: string, updates: Partial<FileToUpload>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const uploadFile = useCallback(
    async (fileData: FileToUpload) => {
      updateFile(fileData.id, { status: "uploading" });

      try {
        const formData = new FormData();
        formData.append("file", fileData.file);
        formData.append("dealId", dealId);
        formData.append("type", fileData.documentType);
        if (fileData.documentType === "OTHER" && fileData.customType) {
          formData.append("customType", fileData.customType);
        }

        const response = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error ?? "Upload failed");
        }

        const result = await response.json();
        updateFile(fileData.id, { status: "success" });
        onUploadComplete?.({ id: result.data.id, name: fileData.file.name, type: fileData.documentType });
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Upload failed";
        updateFile(fileData.id, { status: "error", error: errorMessage });
        onError?.(errorMessage);
        return false;
      }
    },
    [dealId, updateFile, onUploadComplete, onError]
  );

  const handleUploadAll = useCallback(async () => {
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) return;

    const invalidFiles = pendingFiles.filter((f) => f.documentType === "OTHER" && !f.customType.trim());
    if (invalidFiles.length > 0) {
      onError?.("Précisez le type pour les documents marqués 'Autre'");
      return;
    }

    setIsUploading(true);
    for (const fileData of pendingFiles) {
      await uploadFile(fileData);
    }
    setIsUploading(false);
    onAllComplete?.();
  }, [files, uploadFile, onError, onAllComplete]);

  const pendingCount = files.filter((f) => f.status === "pending").length;

  return (
    <div className="space-y-3">
      {/* Dropzone - compact */}
      <div
        {...getRootProps()}
        className={cn(
          "cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          isDragActive && "border-primary bg-primary/5",
          !isDragActive && "border-muted-foreground/25 hover:border-primary/50",
          (disabled || isUploading) && "cursor-not-allowed opacity-50"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex items-center justify-center gap-3">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm">
            {isDragActive ? "Déposez ici" : "Glissez vos documents ou cliquez"}
          </span>
          <span className="text-xs text-muted-foreground">PDF, Excel, PPT, Images</span>
        </div>
      </div>

      {/* File list - compact inline */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((fileData) => {
            const FileIcon = getFileIcon(fileData.file.type);
            const isPending = fileData.status === "pending";

            return (
              <div key={fileData.id} className="space-y-1">
                {/* Main row */}
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2",
                    fileData.status === "success" && "border-green-300 bg-green-50",
                    fileData.status === "error" && "border-red-300 bg-red-50",
                    fileData.status === "uploading" && "border-blue-300 bg-blue-50"
                  )}
                >
                  {/* Status icon */}
                  {fileData.status === "uploading" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                  ) : fileData.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : fileData.status === "error" ? (
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  ) : (
                    <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}

                  {/* Filename */}
                  <span className="flex-1 truncate text-sm" title={fileData.file.name}>
                    {fileData.file.name}
                  </span>

                  {/* Size */}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFileSize(fileData.file.size)}
                  </span>

                  {/* Type selector (only when pending) */}
                  {isPending && (
                    <Select
                      value={fileData.documentType}
                      onValueChange={(value: DocumentType) => updateFile(fileData.id, { documentType: value })}
                    >
                      <SelectTrigger className="h-7 w-[140px] shrink-0 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value} className="text-xs">
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Type label (when not pending) */}
                  {!isPending && (
                    <span className="shrink-0 text-xs font-medium">
                      {DOCUMENT_TYPES.find((t) => t.value === fileData.documentType)?.label}
                    </span>
                  )}

                  {/* Remove button */}
                  {isPending && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeFile(fileData.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* Custom type input (only for OTHER) */}
                {isPending && fileData.documentType === "OTHER" && (
                  <Input
                    placeholder="Précisez le type de document..."
                    value={fileData.customType}
                    onChange={(e) => updateFile(fileData.id, { customType: e.target.value })}
                    className="h-8 ml-6 text-sm"
                  />
                )}

                {/* Error message */}
                {fileData.status === "error" && fileData.error && (
                  <p className="ml-6 text-xs text-red-600">{fileData.error}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload button */}
      {pendingCount > 0 && (
        <Button onClick={handleUploadAll} disabled={isUploading} className="w-full">
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Upload en cours...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Uploader {pendingCount > 1 ? `${pendingCount} documents` : "le document"}
            </>
          )}
        </Button>
      )}
    </div>
  );
});
