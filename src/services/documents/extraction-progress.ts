import { getStore } from "@/services/distributed-state";

const PROGRESS_TTL_MS = 15 * 60 * 1000;

export interface DocumentExtractionProgressSnapshot {
  id: string;
  userId: string;
  documentId?: string;
  documentName?: string;
  phase: "queued" | "started" | "native_extracted" | "page_processed" | "completed" | "failed";
  pageCount: number;
  pagesProcessed: number;
  percent: number;
  message?: string;
  updatedAt: string;
}

export async function setDocumentExtractionProgress(snapshot: DocumentExtractionProgressSnapshot) {
  await getStore().set(buildProgressKey(snapshot.id), snapshot, PROGRESS_TTL_MS);
}

export async function getDocumentExtractionProgress(progressId: string) {
  const value = await getStore().get<DocumentExtractionProgressSnapshot | string>(buildProgressKey(progressId));
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as DocumentExtractionProgressSnapshot;
    } catch {
      return null;
    }
  }
  return value;
}

export function buildProgressSnapshot(params: {
  id: string;
  userId: string;
  documentId?: string;
  documentName?: string;
  phase: DocumentExtractionProgressSnapshot["phase"];
  pageCount?: number;
  pagesProcessed?: number;
  message?: string;
}): DocumentExtractionProgressSnapshot {
  const pageCount = Math.max(0, params.pageCount ?? 0);
  const pagesProcessed = Math.max(0, params.pagesProcessed ?? 0);
  const pageRatio = pageCount > 0 ? Math.min(1, pagesProcessed / pageCount) : 0;
  const percent = (() => {
    switch (params.phase) {
      case "queued":
        return 1;
      case "started":
        return 3;
      case "native_extracted":
        return 8;
      case "page_processed":
        // Keep room for post-OCR persistence/reconciliation work. This avoids
        // showing 99% while the server is still doing expensive extraction.
        return Math.min(95, Math.max(10, Math.round(10 + pageRatio * 85)));
      case "completed":
        return 100;
      case "failed":
        return Math.max(1, Math.min(99, Math.round(10 + pageRatio * 85)));
    }
  })();

  return {
    id: params.id,
    userId: params.userId,
    documentId: params.documentId,
    documentName: params.documentName,
    phase: params.phase,
    pageCount,
    pagesProcessed,
    percent,
    message: params.message,
    updatedAt: new Date().toISOString(),
  };
}

function buildProgressKey(progressId: string) {
  return `document-extraction-progress:${progressId}`;
}
