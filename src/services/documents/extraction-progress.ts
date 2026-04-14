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
  const percent = pageCount > 0
    ? Math.min(99, Math.max(1, Math.round((pagesProcessed / pageCount) * 100)))
    : params.phase === "queued"
      ? 1
      : params.phase === "completed"
        ? 100
        : 5;

  return {
    id: params.id,
    userId: params.userId,
    documentId: params.documentId,
    documentName: params.documentName,
    phase: params.phase,
    pageCount,
    pagesProcessed,
    percent: params.phase === "completed" ? 100 : percent,
    message: params.message,
    updatedAt: new Date().toISOString(),
  };
}

function buildProgressKey(progressId: string) {
  return `document-extraction-progress:${progressId}`;
}
