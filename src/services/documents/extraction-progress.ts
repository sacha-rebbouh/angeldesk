import { prisma } from "@/lib/prisma";

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

// `completed` / `failed` are TERMINAL upload-progress phases. Monotone rule
// (Codex Phase 4.4 P1): a non-terminal phase must NEVER overwrite a terminal
// one. A late `page_processed` / `native_extracted` callback from a
// timed-out background `smartExtract` must not re-open a `failed` /
// `completed` row — the upload modal poller would then spin forever.
const TERMINAL_PROGRESS_PHASES: ReadonlyArray<DocumentExtractionProgressSnapshot["phase"]> = [
  "completed",
  "failed",
];

export async function setDocumentExtractionProgress(snapshot: DocumentExtractionProgressSnapshot) {
  const expiresAt = new Date(Date.now() + PROGRESS_TTL_MS);
  const fields = {
    userId: snapshot.userId,
    documentId: snapshot.documentId,
    documentName: snapshot.documentName,
    phase: snapshot.phase,
    pageCount: snapshot.pageCount,
    pagesProcessed: snapshot.pagesProcessed,
    percent: snapshot.percent,
    message: snapshot.message,
    expiresAt,
  };

  // A terminal phase always wins — including re-writing an already-terminal
  // row (idempotent republish on a durable-pipeline retry).
  if (TERMINAL_PROGRESS_PHASES.includes(snapshot.phase)) {
    await prisma.documentExtractionProgress.upsert({
      where: { id: snapshot.id },
      create: { id: snapshot.id, ...fields },
      update: fields,
    });
    return;
  }

  // Non-terminal phase: atomically update ONLY a row that is not already
  // terminal. `updateMany` scoped by `phase notIn [terminal]` makes the
  // monotone guard race-free — no read-then-write TOCTOU window.
  const updated = await prisma.documentExtractionProgress.updateMany({
    where: { id: snapshot.id, phase: { notIn: [...TERMINAL_PROGRESS_PHASES] } },
    data: fields,
  });
  if (updated.count > 0) return;

  // count === 0 → the row is either terminal (skip — monotone) or does not
  // exist yet (create it). A unique-violation on create means another writer
  // created the row first; that is fine — leave whatever is there.
  await prisma.documentExtractionProgress
    .create({ data: { id: snapshot.id, ...fields } })
    .catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        (error as { code?: string }).code === "P2002"
      ) {
        return; // row now exists (concurrent writer) — monotone, leave it
      }
      throw error;
    });
}

export async function getDocumentExtractionProgress(progressId: string): Promise<DocumentExtractionProgressSnapshot | null> {
  const row = await prisma.documentExtractionProgress.findUnique({ where: { id: progressId } });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    // Best-effort cleanup. Failure to delete is acceptable — the next session will retry.
    await prisma.documentExtractionProgress.delete({ where: { id: progressId } }).catch(() => {});
    return null;
  }
  return {
    id: row.id,
    userId: row.userId,
    documentId: row.documentId ?? undefined,
    documentName: row.documentName ?? undefined,
    phase: row.phase as DocumentExtractionProgressSnapshot["phase"],
    pageCount: row.pageCount,
    pagesProcessed: row.pagesProcessed,
    percent: row.percent,
    message: row.message ?? undefined,
    updatedAt: row.updatedAt.toISOString(),
  };
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
