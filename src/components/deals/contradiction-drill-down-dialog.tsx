"use client";

/**
 * Phase B8.2 — Drill-down contradiction.
 *
 * Surfaces a single ContradictionFinding in full: every signal that
 * contributed to the spread (amount, currency, classification, owning
 * doc) plus per-signal actions that route to the actual source —
 * `DocumentPreviewDialog` for the file itself and
 * `DocumentExtractionAuditDialog` for the OCR/extraction trail.
 *
 * Replaces the B8.1 "Voir <doc>" buttons that wrongly opened the
 * metadata editor (Codex B8.1 P2). The drill-down keeps the same
 * analytical tone: it describes the facts (X says 5M€, Y says 8M€,
 * one is marked actual) and lets the BA inspect each side. No
 * recommendation, no "rejeter", no verdict.
 *
 * Security posture:
 *   - `dealId` arrives from the panel prop, NOT from any fetched
 *     document — the IDOR posture matches B8.1: even if the API
 *     returned a stale/wrong dealId, the metadata / audit / preview
 *     dialogs receive the panel's dealId.
 *   - On-demand fetch goes through `clerkFetch` only.
 *   - `documentId` for the inner dialogs always comes from
 *     `contradiction.signals[].documentId` (already scoped to the
 *     deal by the bundle on the server).
 */
import { memo, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Eye, FileSearch, FileText, Loader2, RotateCw, ScrollText } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clerkFetch } from "@/lib/clerk-fetch";
import { queryKeys } from "@/lib/query-keys";
import type {
  ContradictionFinding,
  ContradictionSignalRef,
  DocumentHealthSummary,
  EvidenceHealthSeverity,
} from "@/services/evidence";
import { DocumentPreviewDialog } from "./document-preview-dialog";
import { DocumentExtractionAuditDialog } from "./document-extraction-audit-dialog";

interface ContradictionDrillDownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Trusted dealId from the panel. The drill-down forwards this to
   * `DocumentExtractionAuditDialog` (which needs it to wire the metadata
   * editor) WITHOUT trusting any value returned by the API for the
   * fetched documents — defense-in-depth against a server-side bug
   * that could leak a different deal.
   */
  dealId: string;
  /**
   * The contradiction to render. `null` keeps the dialog closed (we
   * also gate on `open`, but null guards against stale prop after the
   * bundle refetches and the finding disappears).
   */
  contradiction: ContradictionFinding | null;
  /**
   * Per-doc summary map — used to surface the document name (the bundle
   * already carries it; falling back to `signal.documentName` keeps the
   * UI honest if the doc was removed between bundle refreshes).
   */
  byDocument: Record<string, DocumentHealthSummary>;
}

// ============================================================
// Visual helpers
// ============================================================

const SEVERITY_BADGE: Record<EvidenceHealthSeverity, string> = {
  HIGH: "border-red-300 bg-red-50 text-red-700",
  MEDIUM: "border-amber-300 bg-amber-50 text-amber-700",
  LOW: "border-slate-300 bg-slate-50 text-slate-700",
};

const CLASSIFICATION_BADGE: Record<ContradictionSignalRef["classification"], { label: string; className: string }> = {
  actual: { label: "Réalisé", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  forecast: { label: "Prévisionnel", className: "border-sky-300 bg-sky-50 text-sky-700" },
  claim: { label: "Revendiqué", className: "border-violet-300 bg-violet-50 text-violet-700" },
};

function formatAmount(amount: number, currency: ContradictionSignalRef["currency"]): string {
  // Mirror of health-report.ts:formatAmount — kept local so the dialog
  // is self-contained and the formatting stays consistent with the
  // contradiction reason text the panel already shows.
  const sign = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : null;
  if (sign === null) {
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}G (devise inconnue)`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M (devise inconnue)`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k (devise inconnue)`;
    return `${amount} (devise inconnue)`;
  }
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}G${sign}`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M${sign}`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k${sign}`;
  return `${amount}${sign}`;
}

function formatSubject(subject: string): string {
  if (subject === "VALUATION") return "Valorisation";
  return subject;
}

// ============================================================
// On-demand document fetch (preview + audit need full doc shape)
// ============================================================
interface FetchedDocument {
  id: string;
  name: string;
  type: string;
  hasStorage: boolean;
  mimeType: string | null;
  sourceDate: string | null;
  receivedAt: string | null;
  sourceAuthor: string | null;
  sourceSubject: string | null;
  sourceKind: string;
}

async function fetchDocumentForDrillDown(documentId: string): Promise<FetchedDocument> {
  const res = await clerkFetch(`/api/documents/${documentId}`);
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  const body = (await res.json()) as { data?: FetchedDocument };
  if (!body.data) throw new Error("Document introuvable");
  return body.data;
}

// ============================================================
// Dialog
// ============================================================
export const ContradictionDrillDownDialog = memo(function ContradictionDrillDownDialog({
  open,
  onOpenChange,
  dealId,
  contradiction,
  byDocument,
}: ContradictionDrillDownDialogProps) {
  // The drill-down stacks two child dialogs (preview + audit). We
  // gate each on its own docId so closing one doesn't affect the
  // other. Radix Dialog handles stacked instances cleanly as long as
  // they're siblings — we mount them outside the drill-down's
  // <DialogContent>.
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [auditDocId, setAuditDocId] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: previewDocId
      ? [...queryKeys.documents.byId(previewDocId), "preview"]
      : ["document", "drill-preview-noop"],
    queryFn: () => fetchDocumentForDrillDown(previewDocId as string),
    enabled: Boolean(previewDocId),
    staleTime: 0,
  });

  const auditQuery = useQuery({
    queryKey: auditDocId
      ? [...queryKeys.documents.byId(auditDocId), "audit"]
      : ["document", "drill-audit-noop"],
    queryFn: () => fetchDocumentForDrillDown(auditDocId as string),
    enabled: Boolean(auditDocId),
    staleTime: 0,
  });

  const handleOpenPreview = useCallback((documentId: string) => {
    setPreviewDocId(documentId);
  }, []);
  const handleClosePreview = useCallback((nextOpen: boolean) => {
    if (!nextOpen) setPreviewDocId(null);
  }, []);
  const handleOpenAudit = useCallback((documentId: string) => {
    setAuditDocId(documentId);
  }, []);
  const handleCloseAudit = useCallback((nextOpen: boolean) => {
    if (!nextOpen) setAuditDocId(null);
  }, []);

  if (!contradiction) return null;

  const severityClassName = SEVERITY_BADGE[contradiction.severity];
  const yearLabel = contradiction.year !== null ? ` ${contradiction.year}` : " (non datée)";

  // De-dup signals by documentId — the same doc can appear twice if
  // two extractors emitted the same claim (the health report already
  // de-dups by exact (doc, amount, currency) tuple, but a doc that
  // claims two DIFFERENT amounts for the same subject/year is a
  // legitimate intra-doc contradiction worth surfacing as a single
  // "Document X claims 5M€ and 8M€" entry).
  const groupedByDoc = new Map<string, ContradictionSignalRef[]>();
  for (const sig of contradiction.signals) {
    const list = groupedByDoc.get(sig.documentId) ?? [];
    list.push(sig);
    groupedByDoc.set(sig.documentId, list);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4 text-slate-600" />
              Contradiction sur {formatSubject(contradiction.subject)}
              {yearLabel}
              <Badge variant="outline" className={severityClassName}>
                {contradiction.severity}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {contradiction.reason}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {Array.from(groupedByDoc.entries()).map(([docId, signals]) => {
              const summary = byDocument[docId];
              const docName = summary?.documentName ?? signals[0]?.documentName ?? "Document";
              return (
                <div
                  key={docId}
                  className="rounded-md border border-slate-200 bg-white p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                    <span className="truncate font-medium" title={docName}>
                      {docName}
                    </span>
                    {summary?.documentType && (
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                        {summary.documentType}
                      </Badge>
                    )}
                  </div>

                  <ul className="mt-2 space-y-1">
                    {signals.map((sig) => {
                      const classification = CLASSIFICATION_BADGE[sig.classification];
                      return (
                        <li
                          key={sig.signalId}
                          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                        >
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {formatAmount(sig.amount, sig.currency)}
                          </span>
                          <Badge variant="outline" className={cn("text-[10px]", classification.className)}>
                            {classification.label}
                          </Badge>
                          {sig.currency === null && (
                            <span className="text-amber-700">Devise non détectée</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => handleOpenPreview(docId)}
                      aria-label={`Aperçu de ${docName}`}
                    >
                      <Eye className="h-3 w-3" />
                      Aperçu de la pièce
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => handleOpenAudit(docId)}
                      aria-label={`Voir l'audit d'extraction de ${docName}`}
                    >
                      <FileSearch className="h-3 w-3" />
                      Voir l’audit d’extraction
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Fermer
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lazy-mount preview — needs hasStorage + mimeType from the fetch.
          B8.2.1 fix-up (Codex B8.2 P2) — handle the three terminal
          states explicitly so a 403 / deleted-doc / network error
          surfaces an "Document indisponible" mini-dialog with Retry,
          not an infinite spinner. */}
      {previewDocId && (
        previewQuery.isError ? (
          <DocumentFetchErrorScrim
            title="Aperçu indisponible"
            message={errorMessage(previewQuery.error)}
            onClose={() => handleClosePreview(false)}
            onRetry={() => {
              void previewQuery.refetch();
            }}
            isRetrying={previewQuery.isFetching}
          />
        ) : previewQuery.data ? (
          <DocumentPreviewDialog
            open
            onOpenChange={handleClosePreview}
            document={{
              id: previewQuery.data.id,
              name: previewQuery.data.name,
              hasStorage: previewQuery.data.hasStorage,
              mimeType: previewQuery.data.mimeType,
              type: previewQuery.data.type,
            }}
          />
        ) : (
          // Fetch-in-flight placeholder — keeps the drill-down quiet
          // (no flashing dialog open/close) until the fetch resolves.
          <DocumentPreviewLoadingScrim />
        )
      )}

      {/* Lazy-mount audit — forwards the PANEL'S dealId, never the fetched one.
          B8.2.1 fix-up (Codex B8.2 P2) — same three-state pattern as
          preview. Without the isError branch, an audit fetch failure
          rendered nothing → user clicks "Voir l'audit", nothing
          happens → dead click. */}
      {auditDocId && (
        auditQuery.isError ? (
          <DocumentFetchErrorScrim
            title="Audit d’extraction indisponible"
            message={errorMessage(auditQuery.error)}
            onClose={() => handleCloseAudit(false)}
            onRetry={() => {
              void auditQuery.refetch();
            }}
            isRetrying={auditQuery.isFetching}
          />
        ) : auditQuery.data ? (
          <DocumentExtractionAuditDialog
            open
            onOpenChange={handleCloseAudit}
            document={{
              id: auditQuery.data.id,
              name: auditQuery.data.name,
              dealId,
              sourceDate: auditQuery.data.sourceDate,
              type: auditQuery.data.type,
              sourceKind: auditQuery.data.sourceKind,
              receivedAt: auditQuery.data.receivedAt,
              sourceAuthor: auditQuery.data.sourceAuthor,
              sourceSubject: auditQuery.data.sourceSubject,
            }}
          />
        ) : (
          <DocumentAuditLoadingScrim />
        )
      )}
    </>
  );
});

function DocumentPreviewLoadingScrim() {
  // Minimal in-flight indicator. Mounted in a Dialog so it lays over
  // the drill-down content the same way the real preview will.
  return (
    <Dialog open>
      <DialogContent className="max-w-xs">
        <DialogTitle className="sr-only">Chargement de l’aperçu</DialogTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement de l’aperçu…
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentAuditLoadingScrim() {
  // B8.2.1 — audit-side mirror of the preview scrim. Before the fix-up
  // the audit path had no loading UI, so the user briefly saw nothing
  // between the click and the dialog mount. The scrim keeps the
  // perceived flow consistent with the preview path.
  return (
    <Dialog open>
      <DialogContent className="max-w-xs">
        <DialogTitle className="sr-only">Chargement de l’audit</DialogTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement de l’audit…
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * B8.2.1 — explicit error surface for the preview / audit fetches.
 * Renders a mini dialog with the friendly message + a retry button so
 * a 403 / deleted doc / network blip never produces a dead click or an
 * infinite spinner.
 *
 * The dialog's `open` state is hard-coded `true` because the parent
 * already gates on `*DocId` + `isError` — mounting it AT ALL means it
 * should be visible. Closing routes back to the parent which clears
 * the docId state (closing the scrim entirely).
 */
function DocumentFetchErrorScrim({
  title,
  message,
  onClose,
  onRetry,
  isRetrying,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button type="button" onClick={onRetry} disabled={isRetrying} className="gap-1">
            <RotateCw className={cn("h-4 w-4", isRetrying && "animate-spin")} />
            Réessayer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Normalise an unknown thrown by React Query into a user-facing French
 * message. Defensive: a fetch / parse error can be anything; we never
 * want to render `[object Object]` or leak a stack trace into the UI.
 *
 * B8.3 fix-up (Codex B8.2.1 non-blocking) — non-HTTP errors used to
 * fall through to `error.message`, which can be a technical string
 * ("Failed to fetch", a Zod issue, an aborted fetch reason) the BA
 * has no business seeing. The fallback now returns the generic
 * French line, the same one used when the error isn't even an Error
 * instance. Specific HTTP statuses keep their bespoke messages.
 */
const GENERIC_FETCH_ERROR_MESSAGE =
  "Le document n’a pas pu être chargé. Réessayez dans un instant.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes("403")) return "Document indisponible (accès refusé).";
    if (error.message.includes("404")) return "Document introuvable. Il a peut-être été supprimé.";
    if (error.message.includes("401")) return "Session expirée. Reconnectez-vous puis réessayez.";
  }
  return GENERIC_FETCH_ERROR_MESSAGE;
}

