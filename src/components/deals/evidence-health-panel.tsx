"use client";

/**
 * Phase 8 — Corpus Control Panel (deal-level surface).
 *
 * Renders the EvidenceHealthReport for the current deal: contradictions
 * across documents, missing evidence, freshness rollup. Positioning rule
 * (CLAUDE.md): analytical tone only — no GO/NO_GO, no "investir"/"rejeter".
 *
 * Empty-state handling: renders nothing when there is nothing to flag.
 * Loading + error states are minimal — the panel is a pre-analysis corpus
 * quality surface and should never block the page.
 *
 * Phase B8.1 — Action mapping per signal.
 * Each signal now carries one or more actions ("Renseigner la date",
 * "Modifier les métadonnées", "Ajouter une cap table", "Voir le document",
 * "Ajouter actuals/YTD"). No signal is left as "ok je fais quoi ?".
 * Clicking an action opens the existing metadata dialog or upload dialog
 * pre-targeted on the right document — no new mutation surface.
 *
 * Routing rules (pure helpers below, exported via `__deriveSignalActions`
 * for tests):
 *   - contradictions → ONE "Comparer X documents" action (B8.2) →
 *     opens `ContradictionDrillDownDialog` (lists every signal,
 *     per-signal preview + extraction-audit buttons). Replaces the
 *     B8.1 fake "Voir <doc>" that opened the metadata editor — that
 *     was the Codex B8.1 P2 finding.
 *   - NO_CAP_TABLE_AS_OF + cap tables exist → "Renseigner la date" per
 *     doc → metadata dialog with sourceDate focused.
 *   - NO_CAP_TABLE_AS_OF + no cap table at all → "Ajouter une cap table"
 *     → upload dialog.
 *   - NO_FINANCIAL_STATEMENTS → "Ajouter un bilan" → upload dialog.
 *   - NO_FORECAST_PERIOD → "Modifier les métadonnées" per doc + "Ajouter
 *     un modèle financier" → upload dialog.
 *   - NO_PITCH_DECK_DATE → "Renseigner la date" per doc.
 *   - cap_table_stale / balance_sheet_stale / forecast_now_historical →
 *     "Modifier — <doc>" + "Ajouter <pièce récente>" (upload). The
 *     "marquer accepté" path needs a new mutation surface and is out of
 *     scope for B8.1.
 */
import { memo, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ShieldCheck,
  ScrollText,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  EyeOff,
  FilePlus,
  Pencil,
  ListTree,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { clerkFetch } from "@/lib/clerk-fetch";
import { queryKeys } from "@/lib/query-keys";
import type { DocumentSourceKind, DocumentType } from "@prisma/client";
import {
  buildCorpusChecklistMarkdown,
  signalKeyForContradiction,
  signalKeyForFreshness,
  signalKeyForMissing,
  type ContradictionFinding,
  type DocumentHealthSummary,
  type EvidenceHealthBundle,
  type EvidenceHealthReport,
  type EvidenceHealthSeverity,
  type EvidenceSignalResolutionAction,
  type MissingEvidenceFinding,
  type MissingEvidenceKind,
  type ResolvedSignalEntry,
  type StaleWarningKind,
} from "@/services/evidence";
import { useEvidenceHealth } from "@/hooks/use-evidence-health";
import { DocumentMetadataDialog } from "./document-metadata-dialog";
import { DocumentUploadDialog } from "./document-upload-dialog";
import { ContradictionDrillDownDialog } from "./contradiction-drill-down-dialog";

interface EvidenceHealthPanelProps {
  dealId: string;
}

const SEVERITY_STYLE: Record<EvidenceHealthSeverity, { badge: string; icon: typeof AlertTriangle; color: string }> = {
  HIGH: { badge: "border-red-300 bg-red-50 text-red-700", icon: AlertTriangle, color: "text-red-600" },
  MEDIUM: { badge: "border-amber-300 bg-amber-50 text-amber-700", icon: AlertCircle, color: "text-amber-600" },
  LOW: { badge: "border-slate-300 bg-slate-50 text-slate-700", icon: Info, color: "text-slate-600" },
};

// ============================================================
// B8.1 — Action descriptors (pure)
// ============================================================

/**
 * One action button to render under a finding. The discriminator drives
 * the dialog that opens; `documentId` is the target document for
 * metadata edits / drill-downs. `focusField` hints which field the user
 * should jump to ("sourceDate" for "Renseigner la date" actions).
 */
export type SignalAction =
  | {
      kind: "open_metadata";
      label: string;
      icon: typeof Pencil;
      documentId: string;
      documentName: string;
      focusField?: "sourceDate" | "type" | "sourceKind";
    }
  | {
      kind: "open_upload";
      label: string;
      icon: typeof FilePlus;
      suggestedType?: DocumentType;
    }
  | {
      // B8.2 — contradictions get a real drill-down (replaces the B8.1
      // fake "Voir" that opened the metadata editor — Codex B8.1 P2).
      // The dispatcher mounts ContradictionDrillDownDialog with the
      // full finding so the user sees every signal side-by-side and
      // can preview / audit each contributing document.
      kind: "open_contradiction_drill_down";
      label: string;
      icon: typeof ListTree;
      contradiction: ContradictionFinding;
    };

function deriveContradictionActions(
  contradiction: ContradictionFinding,
  byDocument: Record<string, DocumentHealthSummary>
): SignalAction[] {
  // B8.2 — ONE drill-down action per contradiction (was N per-doc
  // metadata buttons in B8.1, which Codex flagged P2: clicking "Voir"
  // wrongly opened the metadata editor instead of a real drill-down /
  // document view). The drill-down dialog itself surfaces every
  // contributing signal with per-signal preview + audit buttons — that
  // is the real "Voir le doc" path.
  //
  // `byDocument` is intentionally accepted but not used here: the
  // count and the drill-down dialog handle name lookup themselves. We
  // keep the param so the helper signature stays uniform with the
  // missing / freshness derivers.
  void byDocument;
  const uniqueDocs = new Set(contradiction.signals.map((s) => s.documentId));
  const count = uniqueDocs.size;
  if (count === 0) return [];
  return [
    {
      kind: "open_contradiction_drill_down",
      label: `Comparer ${count} document${count > 1 ? "s" : ""}`,
      icon: ListTree,
      contradiction,
    },
  ];
}

function deriveMissingActions(
  finding: MissingEvidenceFinding,
  byDocument: Record<string, DocumentHealthSummary>
): SignalAction[] {
  switch (finding.kind) {
    case "NO_CAP_TABLE_AS_OF": {
      if (finding.affectedDocumentIds.length === 0) {
        // No cap table at all in the corpus — the only available action
        // is to upload one (no doc to edit).
        return [
          { kind: "open_upload", label: "Ajouter une cap table", icon: FilePlus, suggestedType: "CAP_TABLE" },
        ];
      }
      return finding.affectedDocumentIds.map((docId) => {
        const summary = byDocument[docId];
        return {
          kind: "open_metadata" as const,
          label: `Renseigner la date — ${summary?.documentName ?? "cap table"}`,
          icon: CalendarDays,
          documentId: docId,
          documentName: summary?.documentName ?? "Cap table",
          focusField: "sourceDate" as const,
        };
      });
    }
    case "NO_FINANCIAL_STATEMENTS":
      return [
        { kind: "open_upload", label: "Ajouter un bilan", icon: FilePlus, suggestedType: "FINANCIAL_STATEMENTS" },
      ];
    case "NO_FORECAST_PERIOD": {
      const perDoc: SignalAction[] = finding.affectedDocumentIds.map((docId) => {
        const summary = byDocument[docId];
        return {
          kind: "open_metadata" as const,
          label: `Modifier les métadonnées — ${summary?.documentName ?? "modèle financier"}`,
          icon: Pencil,
          documentId: docId,
          documentName: summary?.documentName ?? "Modèle financier",
        };
      });
      return [
        ...perDoc,
        { kind: "open_upload", label: "Ajouter un modèle financier", icon: FilePlus, suggestedType: "FINANCIAL_MODEL" },
      ];
    }
    case "NO_PITCH_DECK_DATE":
      return finding.affectedDocumentIds.map((docId) => {
        const summary = byDocument[docId];
        return {
          kind: "open_metadata" as const,
          label: `Renseigner la date — ${summary?.documentName ?? "pitch deck"}`,
          icon: CalendarDays,
          documentId: docId,
          documentName: summary?.documentName ?? "Pitch deck",
          focusField: "sourceDate" as const,
        };
      });
    default: {
      // Exhaustiveness — any new MissingEvidenceKind MUST register a
      // mapping here. The cast surfaces the gap as a TS error at build.
      const _exhaustive: never = finding.kind;
      void _exhaustive;
      return [];
    }
  }
}

function deriveFreshnessActions(
  kind: StaleWarningKind,
  documentId: string,
  byDocument: Record<string, DocumentHealthSummary>
): SignalAction[] {
  const summary = byDocument[documentId];
  const docName = summary?.documentName ?? "le document";
  switch (kind) {
    case "cap_table_stale":
      return [
        { kind: "open_metadata", label: `Modifier — ${docName}`, icon: Pencil, documentId, documentName: docName },
        { kind: "open_upload", label: "Ajouter une cap table récente", icon: FilePlus, suggestedType: "CAP_TABLE" },
      ];
    case "balance_sheet_stale":
      return [
        { kind: "open_metadata", label: `Modifier — ${docName}`, icon: Pencil, documentId, documentName: docName },
        { kind: "open_upload", label: "Ajouter un bilan récent", icon: FilePlus, suggestedType: "FINANCIAL_STATEMENTS" },
      ];
    case "forecast_now_historical":
      return [
        { kind: "open_metadata", label: `Modifier — ${docName}`, icon: Pencil, documentId, documentName: docName },
        { kind: "open_upload", label: "Ajouter actuals / YTD", icon: FilePlus, suggestedType: "FINANCIAL_MODEL" },
      ];
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return [];
    }
  }
}

/**
 * Per-doc list of freshness entries — collapses the bundle's `byDocument`
 * into `{ docId, kind, severity }` tuples so the FreshnessBlock renders
 * one row per affected document instead of a single aggregate count.
 * Stable order: HIGH > MEDIUM > LOW, then by documentName.
 */
interface FreshnessEntryFlat {
  documentId: string;
  documentName: string;
  kind: StaleWarningKind;
  severity: EvidenceHealthSeverity;
}

function flattenFreshness(byDocument: Record<string, DocumentHealthSummary>): FreshnessEntryFlat[] {
  const out: FreshnessEntryFlat[] = [];
  for (const [docId, summary] of Object.entries(byDocument)) {
    for (const f of summary.freshness) {
      out.push({
        documentId: docId,
        documentName: summary.documentName ?? "Document",
        kind: f.kind,
        severity: f.severity,
      });
    }
  }
  out.sort((a, b) => {
    const sev = severityRank(b.severity) - severityRank(a.severity);
    if (sev !== 0) return sev;
    return a.documentName.localeCompare(b.documentName);
  });
  return out;
}

function severityRank(s: EvidenceHealthSeverity): number {
  return s === "HIGH" ? 3 : s === "MEDIUM" ? 2 : 1;
}

// Test-only exports for the pure helpers.
export const __deriveSignalActions = {
  contradiction: deriveContradictionActions,
  missing: deriveMissingActions,
  freshness: deriveFreshnessActions,
  flattenFreshness,
};

// ============================================================
// Selected-doc fetch — enrich the metadata dialog with type /
// sourceKind / receivedAt / sourceAuthor / sourceSubject so pre-fill
// matches the documents-tab metadata editor. The bundle only carries
// name + type; the rest comes from GET /api/documents/[id] on demand.
// ============================================================
interface FetchedDocument {
  id: string;
  name: string;
  type: DocumentType;
  sourceKind: DocumentSourceKind;
  sourceDate: string | null;
  receivedAt: string | null;
  sourceAuthor: string | null;
  sourceSubject: string | null;
}

async function fetchDocumentForMetadataDialog(documentId: string): Promise<FetchedDocument> {
  const res = await clerkFetch(`/api/documents/${documentId}`);
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  const body = (await res.json()) as { data?: FetchedDocument };
  if (!body.data) throw new Error("Document introuvable");
  return body.data;
}

// ============================================================
// Panel
// ============================================================
export const EvidenceHealthPanel = memo(function EvidenceHealthPanel({ dealId }: EvidenceHealthPanelProps) {
  const { data, isLoading, error } = useEvidenceHealth(dealId);

  // B8.1 — local state for the two dialogs the panel can open.
  // `metadataDocId` triggers an on-demand fetch and mounts the metadata
  // dialog once loaded. `isUploadOpen` opens the upload modal (no
  // per-type pre-fill yet; the upload form's type selector is enough
  // for B8.1's "action routes to bonne UI" gate).
  // B8.2 — `drillDownContradiction` opens the dedicated contradiction
  // drill-down dialog (replaces the B8.1 "Voir <doc>" buttons that
  // wrongly routed to the metadata editor — Codex B8.1 P2).
  const [metadataDocId, setMetadataDocId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [drillDownContradiction, setDrillDownContradiction] = useState<ContradictionFinding | null>(null);
  // B8.3 — short-lived "Copié !" feedback on the copy-checklist button.
  // Auto-reverts after 2s (set via setTimeout in `handleCopyChecklist`).
  // Lives in state so a re-click during the feedback window doesn't
  // double-fire the toast — the button checks the flag first.
  const [isChecklistCopied, setIsChecklistCopied] = useState(false);
  // B9.3 — resolution dialog state. When non-null, the dialog is open
  // and waits for the user to confirm (with an optional reason).
  // The state carries enough context to render the dialog body AND
  // dispatch the right mutation on confirm.
  const [resolutionDialog, setResolutionDialog] = useState<{
    signalKey: string;
    action: EvidenceSignalResolutionAction;
    /** Short human label used inside the dialog body ("Cap table périmée — model.xlsx"). */
    label: string;
  } | null>(null);
  const [resolutionReason, setResolutionReason] = useState("");
  // B9.3 — "Signaux traités" section open/closed. Collapsed by
  // default — the section is informational and shouldn't compete
  // with the active signals for the BA's attention.
  const [isTreatedSectionOpen, setIsTreatedSectionOpen] = useState(false);

  const queryClient = useQueryClient();

  const metadataQuery = useQuery({
    queryKey: metadataDocId
      ? [...queryKeys.documents.byId(metadataDocId), "metadata-editor"]
      : ["document", "noop"],
    queryFn: () => fetchDocumentForMetadataDialog(metadataDocId as string),
    enabled: Boolean(metadataDocId),
    staleTime: 0,
  });

  const handleOpenMetadata = useCallback((documentId: string) => {
    setMetadataDocId(documentId);
  }, []);
  const handleCloseMetadata = useCallback(() => {
    setMetadataDocId(null);
  }, []);
  const handleOpenUpload = useCallback(() => {
    setIsUploadOpen(true);
  }, []);
  const handleCloseUpload = useCallback((open: boolean) => {
    if (!open) setIsUploadOpen(false);
  }, []);
  const handleOpenDrillDown = useCallback((contradiction: ContradictionFinding) => {
    setDrillDownContradiction(contradiction);
  }, []);
  const handleCloseDrillDown = useCallback((open: boolean) => {
    if (!open) setDrillDownContradiction(null);
  }, []);

  // ============================================================
  // B9.3 — Resolution mutations + handlers
  // ============================================================

  // POST /resolutions — mark resolved OR ignored. Server validates the
  // signalKey is currently active (B9.2.1) so a stale UI tab can't
  // pre-write a tombstone — failure surfaces as a toast.
  const resolutionMutation = useMutation({
    mutationFn: async (vars: {
      signalKey: string;
      action: EvidenceSignalResolutionAction;
      reason: string | null;
    }) => {
      const res = await clerkFetch(`/api/deals/${dealId}/evidence-health/resolutions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Erreur ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // Granular invalidation — only the evidence-health bundle key
      // (B9.4 will assert metadata-edit / upload paths invalidate
      // the same key transitively; nothing to do here besides this
      // one invalidation).
      queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
    },
  });

  // DELETE /resolutions — un-resolve / un-ignore. Idempotent on the
  // server (B9.2), so a double-click is harmless.
  const reopenMutation = useMutation({
    mutationFn: async (signalKey: string) => {
      const res = await clerkFetch(`/api/deals/${dealId}/evidence-health/resolutions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalKey }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Erreur ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
    },
  });

  const handleOpenResolutionDialog = useCallback(
    (signalKey: string, action: EvidenceSignalResolutionAction, label: string) => {
      setResolutionDialog({ signalKey, action, label });
      setResolutionReason("");
    },
    []
  );
  const handleCloseResolutionDialog = useCallback((open: boolean) => {
    if (!open) {
      setResolutionDialog(null);
      setResolutionReason("");
    }
  }, []);
  const handleConfirmResolution = useCallback(() => {
    if (!resolutionDialog) return;
    const trimmed = resolutionReason.trim();
    resolutionMutation.mutate(
      {
        signalKey: resolutionDialog.signalKey,
        action: resolutionDialog.action,
        reason: trimmed.length > 0 ? trimmed : null,
      },
      {
        onSuccess: () => {
          toast.success(
            resolutionDialog.action === "RESOLVED"
              ? "Signal marqué résolu"
              : "Signal ignoré"
          );
          setResolutionDialog(null);
          setResolutionReason("");
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : "Action impossible";
          // Specific server error from B9.2.1 — surface a friendly
          // line instead of the raw `signal_not_active` code.
          if (message === "signal_not_active") {
            toast.error("Ce signal n'est plus actif. Rechargez la page.");
            return;
          }
          toast.error(message);
        },
      }
    );
  }, [resolutionDialog, resolutionReason, resolutionMutation]);

  const handleReopen = useCallback(
    (signalKey: string) => {
      reopenMutation.mutate(signalKey, {
        onSuccess: () => {
          toast.success("Signal réouvert");
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Action impossible");
        },
      });
    },
    [reopenMutation]
  );

  const dispatchAction = useCallback(
    (action: SignalAction) => {
      switch (action.kind) {
        case "open_metadata":
          handleOpenMetadata(action.documentId);
          return;
        case "open_upload":
          handleOpenUpload();
          return;
        case "open_contradiction_drill_down":
          handleOpenDrillDown(action.contradiction);
          return;
        default: {
          // Exhaustiveness — any new SignalAction.kind MUST register a
          // dispatch branch here. Surfaces as a TS error at build.
          const _exhaustive: never = action;
          void _exhaustive;
        }
      }
    },
    [handleOpenMetadata, handleOpenUpload, handleOpenDrillDown]
  );

  // B8.3 — Copy the checklist (markdown) to the clipboard. Pure
  // builder lives in `services/evidence/corpus-checklist.ts` so the
  // text can be regenerated in any future surface (PDF, share URL,
  // email mailto) without re-implementing the format.
  //
  // We use `navigator.clipboard.writeText`. The HTTPS / focused-tab
  // requirement is the same as every other clipboard-using surface
  // in this app (B0 diagnostic copy). Failures fall back to a toast
  // explaining what happened — never a silent no-op.
  const handleCopyChecklist = useCallback(
    async (activeBundle: EvidenceHealthBundle) => {
      const markdown = buildCorpusChecklistMarkdown(activeBundle);
      try {
        await navigator.clipboard.writeText(markdown);
        toast.success("Checklist copiée");
        setIsChecklistCopied(true);
        window.setTimeout(() => setIsChecklistCopied(false), 2_000);
      } catch (clipboardError) {
        // Browser refused (insecure context, permission denied, no
        // navigator.clipboard in some embedded webviews). Surface the
        // failure so the BA isn't stuck with a button that did nothing.
        const message =
          clipboardError instanceof Error && clipboardError.message
            ? clipboardError.message
            : "Copie impossible. Vérifiez les permissions du navigateur.";
        toast.error(`Copie impossible : ${message}`);
      }
    },
    []
  );

  if (isLoading || error || !data) return null;

  const { report, byDocument, resolved, ignored } = data;
  const freshnessEntries = flattenFreshness(byDocument);
  const totalFindings = report.contradictions.length + report.missing.length + freshnessEntries.length;
  const treatedCount = resolved.length + ignored.length;
  // Panel renders if there's anything to show — active findings OR
  // a non-empty "Signaux traités" section (the BA may want to see
  // history even after everything was handled).
  if (totalFindings === 0 && treatedCount === 0) return null;

  return (
    <>
      <Card className="border-slate-200 bg-slate-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-slate-600" />
                Contrôle du corpus
                <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
                  {totalFindings} signal{totalFindings > 1 ? "aux" : ""}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Contrôle automatique avant analyse IA : fraîcheur, contradictions et pièces manquantes dans le corpus. Ces
                signaux ne remplacent pas l’analyse d’investissement ; ils indiquent ce qu’il faut vérifier dans le dossier.
              </p>
            </div>
            {/* B8.3 — Copy/share corpus checklist. Hidden when there's
                nothing to copy (totalFindings === 0 already early-returns
                above), so the button always carries a non-empty
                payload. The transient "Copié !" state replaces the
                label for 2s without disabling the button — the user
                can re-copy after the label flicks back. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1"
              onClick={() => {
                void handleCopyChecklist({ report, byDocument });
              }}
              aria-label="Copier la checklist du corpus"
            >
              {isChecklistCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Copié !
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copier la checklist
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {totalFindings === 0 ? (
            // All findings have been resolved/ignored — the "Signaux
            // traités" section below carries the history. Render an
            // analytical empty-active state so the panel doesn't look
            // broken.
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 className="mr-1 inline h-4 w-4" />
              Aucun signal actif sur le corpus.
            </p>
          ) : (
            <>
              {report.contradictions.length > 0 && (
                <ContradictionsBlock
                  items={report.contradictions}
                  byDocument={byDocument}
                  dispatch={dispatchAction}
                  onMarkResolved={(signalKey, label) =>
                    handleOpenResolutionDialog(signalKey, "RESOLVED", label)
                  }
                  onMarkIgnored={(signalKey, label) =>
                    handleOpenResolutionDialog(signalKey, "IGNORED", label)
                  }
                />
              )}
              {report.missing.length > 0 && (
                <MissingBlock
                  items={report.missing}
                  byDocument={byDocument}
                  dispatch={dispatchAction}
                  onMarkResolved={(signalKey, label) =>
                    handleOpenResolutionDialog(signalKey, "RESOLVED", label)
                  }
                  onMarkIgnored={(signalKey, label) =>
                    handleOpenResolutionDialog(signalKey, "IGNORED", label)
                  }
                />
              )}
              {freshnessEntries.length > 0 && (
                <FreshnessBlock
                  entries={freshnessEntries}
                  byDocument={byDocument}
                  dispatch={dispatchAction}
                  report={report}
                  onMarkResolved={(signalKey, label) =>
                    handleOpenResolutionDialog(signalKey, "RESOLVED", label)
                  }
                  onMarkIgnored={(signalKey, label) =>
                    handleOpenResolutionDialog(signalKey, "IGNORED", label)
                  }
                />
              )}
            </>
          )}

          {/* B9.3 — "Signaux traités" : repliable. Shows resolved +
              ignored together, each with a "Réouvrir" button that
              DELETE-s the resolution. Hidden when empty. */}
          {treatedCount > 0 && (
            <TreatedSignalsSection
              resolved={resolved}
              ignored={ignored}
              isOpen={isTreatedSectionOpen}
              onOpenChange={setIsTreatedSectionOpen}
              onReopen={handleReopen}
              isReopenInFlight={reopenMutation.isPending}
            />
          )}
        </CardContent>
      </Card>

      {/* B8.1 — metadata dialog mounted lazily once the on-click fetch resolves. */}
      {metadataDocId && metadataQuery.data && (
        <DocumentMetadataDialog
          open
          onOpenChange={(open) => {
            if (!open) handleCloseMetadata();
          }}
          document={{
            id: metadataQuery.data.id,
            dealId,
            name: metadataQuery.data.name,
            sourceDate: metadataQuery.data.sourceDate,
            type: metadataQuery.data.type,
            sourceKind: metadataQuery.data.sourceKind,
            receivedAt: metadataQuery.data.receivedAt,
            sourceAuthor: metadataQuery.data.sourceAuthor,
            sourceSubject: metadataQuery.data.sourceSubject,
          }}
        />
      )}

      <DocumentUploadDialog dealId={dealId} open={isUploadOpen} onOpenChange={handleCloseUpload} />

      {/* B8.2 — drill-down dialog. Mounted as a sibling so the metadata
          / upload dialogs and the drill-down can coexist without
          stack-conflict (Radix handles sibling Dialog instances cleanly). */}
      <ContradictionDrillDownDialog
        open={Boolean(drillDownContradiction)}
        onOpenChange={handleCloseDrillDown}
        dealId={dealId}
        contradiction={drillDownContradiction}
        byDocument={byDocument}
      />

      {/* B9.3 — resolution dialog (mark resolved / ignored with an
          optional reason). Triggered by per-signal buttons in the
          three blocks above. Mounted as a sibling — same pattern. */}
      <ResolutionDialog
        state={resolutionDialog}
        reason={resolutionReason}
        onReasonChange={setResolutionReason}
        onOpenChange={handleCloseResolutionDialog}
        onConfirm={handleConfirmResolution}
        isPending={resolutionMutation.isPending}
      />
    </>
  );
});

// ============================================================
// Blocks
// ============================================================

/**
 * B9.3 — Per-block resolution callback signature. The caller-side
 * panel owns the dialog state; blocks just forward (signalKey, label).
 */
type ResolutionCallback = (signalKey: string, label: string) => void;

function ContradictionsBlock({
  items,
  byDocument,
  dispatch,
  onMarkResolved,
  onMarkIgnored,
}: {
  items: ContradictionFinding[];
  byDocument: Record<string, DocumentHealthSummary>;
  dispatch: (action: SignalAction) => void;
  onMarkResolved: ResolutionCallback;
  onMarkIgnored: ResolutionCallback;
}) {
  return (
    <section>
      <SectionTitle icon={ScrollText} label={`Contradictions détectées (${items.length})`} />
      <ul className="mt-2 space-y-2">
        {items.map((c, idx) => {
          const style = SEVERITY_STYLE[c.severity];
          const Icon = style.icon;
          const actions = deriveContradictionActions(c, byDocument);
          const signalKey = signalKeyForContradiction(c);
          const yearLabel = c.year !== null ? ` ${c.year}` : " (non datée)";
          const treatedLabel = `${formatSubject(c.subject)}${yearLabel}`;
          return (
            <li
              key={`${c.kind}-${c.subject}-${c.year ?? "undated"}-${idx}`}
              className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5 text-sm"
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.color)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{treatedLabel}</span>
                  <Badge variant="outline" className={style.badge}>
                    {c.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{c.reason}</p>
                <ActionBar actions={actions} dispatch={dispatch} />
                <ResolutionButtons
                  signalKey={signalKey}
                  label={treatedLabel}
                  onMarkResolved={onMarkResolved}
                  onMarkIgnored={onMarkIgnored}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MissingBlock({
  items,
  byDocument,
  dispatch,
  onMarkResolved,
  onMarkIgnored,
}: {
  items: MissingEvidenceFinding[];
  byDocument: Record<string, DocumentHealthSummary>;
  dispatch: (action: SignalAction) => void;
  onMarkResolved: ResolutionCallback;
  onMarkIgnored: ResolutionCallback;
}) {
  return (
    <section>
      <SectionTitle icon={AlertCircle} label={`Pièces ou repères manquants (${items.length})`} />
      <ul className="mt-2 space-y-2">
        {items.map((m, idx) => {
          const style = SEVERITY_STYLE[m.severity];
          const Icon = style.icon;
          const actions = deriveMissingActions(m, byDocument);
          // B9.3 — when a missing finding aggregates several affected
          // docs, we render ONE resolution control per doc (so the BA
          // can mark "this specific deck is resolved" without
          // collapsing the whole finding). Deal-level findings emit a
          // single control.
          const perDocKeys: Array<{ signalKey: string; label: string }> =
            m.affectedDocumentIds.length === 0
              ? [{ signalKey: signalKeyForMissing(m, null), label: missingLabel(m.kind) }]
              : m.affectedDocumentIds.map((docId) => ({
                  signalKey: signalKeyForMissing(m, docId),
                  label: `${missingLabel(m.kind)} — ${byDocument[docId]?.documentName ?? "Document"}`,
                }));
          return (
            <li
              key={`${m.kind}-${idx}`}
              className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5 text-sm"
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.color)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={style.badge}>
                    {m.severity}
                  </Badge>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {missingLabel(m.kind)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{m.message}</p>
                <ActionBar actions={actions} dispatch={dispatch} />
                {perDocKeys.map((entry) => (
                  <ResolutionButtons
                    key={entry.signalKey}
                    signalKey={entry.signalKey}
                    label={entry.label}
                    onMarkResolved={onMarkResolved}
                    onMarkIgnored={onMarkIgnored}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FreshnessBlock({
  entries,
  byDocument,
  dispatch,
  report,
  onMarkResolved,
  onMarkIgnored,
}: {
  entries: FreshnessEntryFlat[];
  byDocument: Record<string, DocumentHealthSummary>;
  dispatch: (action: SignalAction) => void;
  report: EvidenceHealthReport;
  onMarkResolved: ResolutionCallback;
  onMarkIgnored: ResolutionCallback;
}) {
  return (
    <section>
      <SectionTitle icon={CalendarClock} label={`Fraîcheur (${report.freshness.total})`} />
      <ul className="mt-2 space-y-2">
        {entries.map((entry) => {
          const style = SEVERITY_STYLE[entry.severity];
          const actions = deriveFreshnessActions(entry.kind, entry.documentId, byDocument);
          const signalKey = signalKeyForFreshness(entry.kind, entry.documentId);
          const treatedLabel = `${freshnessLabel(entry.kind)} — ${entry.documentName}`;
          return (
            <li
              key={`${entry.documentId}-${entry.kind}`}
              className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5 text-sm"
            >
              <CalendarClock className={cn("mt-0.5 h-4 w-4 shrink-0", style.color)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{freshnessLabel(entry.kind)}</span>
                  <Badge variant="outline" className={style.badge}>
                    {entry.severity}
                  </Badge>
                  {/* B12.5 P3 #11 — `.truncate` clips long document
                      names on narrow viewports. The native `title`
                      attribute restores the full name on hover (desktop)
                      and long-press (mobile), so the BA can still
                      identify which doc carries the freshness signal
                      when the column is constrained. */}
                  <span
                    className="truncate text-xs text-muted-foreground"
                    title={entry.documentName}
                  >
                    {entry.documentName}
                  </span>
                </div>
                <ActionBar actions={actions} dispatch={dispatch} />
                <ResolutionButtons
                  signalKey={signalKey}
                  label={treatedLabel}
                  onMarkResolved={onMarkResolved}
                  onMarkIgnored={onMarkIgnored}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * B9.3 — per-signal "Marquer résolu" / "Ignorer" buttons. Rendered
 * UNDER the B8 action bar so the "fix" actions stay visually primary
 * (correcting the underlying problem is always preferred to a
 * resolution; ignore is for assumed cases only — CLAUDE.md positioning
 * rule).
 */
function ResolutionButtons({
  signalKey,
  label,
  onMarkResolved,
  onMarkIgnored,
}: {
  signalKey: string;
  label: string;
  onMarkResolved: ResolutionCallback;
  onMarkIgnored: ResolutionCallback;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 gap-1 text-[11px] text-muted-foreground hover:text-emerald-700"
        onClick={() => onMarkResolved(signalKey, label)}
        aria-label={`Marquer ${label} comme résolu`}
      >
        <CheckCircle2 className="h-3 w-3" />
        Marquer résolu
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 gap-1 text-[11px] text-muted-foreground hover:text-slate-700"
        onClick={() => onMarkIgnored(signalKey, label)}
        aria-label={`Ignorer ${label}`}
      >
        <EyeOff className="h-3 w-3" />
        Ignorer
      </Button>
    </div>
  );
}

function ActionBar({
  actions,
  dispatch,
}: {
  actions: SignalAction[];
  dispatch: (action: SignalAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {actions.map((action, idx) => {
        const ActionIcon = action.icon;
        return (
          <Button
            key={`${action.kind}-${idx}-${action.label}`}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-7 max-w-full justify-start gap-1 whitespace-normal text-left text-xs"
            onClick={() => dispatch(action)}
          >
            <ActionIcon className="h-3 w-3 shrink-0" />
            <span className="min-w-0 break-words leading-tight">{action.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: typeof AlertTriangle; label: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
      <Icon className="h-4 w-4 text-slate-600" />
      {label}
    </h3>
  );
}

function formatSubject(subject: string): string {
  if (subject === "VALUATION") return "Valorisation";
  return subject;
}

const MISSING_LABEL: Record<MissingEvidenceKind, string> = {
  NO_CAP_TABLE_AS_OF: "Cap table",
  NO_FINANCIAL_STATEMENTS: "Bilan",
  NO_FORECAST_PERIOD: "Forecast",
  NO_PITCH_DECK_DATE: "Pitch deck",
};

function missingLabel(kind: MissingEvidenceKind): string {
  return MISSING_LABEL[kind] ?? kind;
}

/**
 * B12.4 P1 #6 — every `StaleWarningKind` has a human-readable French
 * label. The `Record<StaleWarningKind, string>` shape forces TS to
 * fail compile if a new kind is added to the backend type without a
 * corresponding label here. If a malformed payload ever slips in
 * (e.g. a backend release that adds a new kind ahead of the UI),
 * `freshnessLabel()` falls back to a generic French phrase instead
 * of leaking the raw snake_case identifier to the user.
 */
const FRESHNESS_LABEL: Record<StaleWarningKind, string> = {
  cap_table_stale: "Cap table périmée",
  balance_sheet_stale: "Bilan périmé",
  forecast_now_historical: "Forecast déjà entamé",
};

/** Generic fallback for unknown kinds (defense-in-depth). */
const FRESHNESS_LABEL_FALLBACK = "Donnée périmée";

export function freshnessLabel(kind: StaleWarningKind): string {
  // The Record above is exhaustive — TS guarantees coverage for every
  // declared kind. The ?? branch is defensive only: it catches malformed
  // wire data (e.g. an older client running against a newer backend)
  // and renders a friendly label instead of leaking `pitch_deck_stale`
  // or similar raw identifier into the UI.
  return FRESHNESS_LABEL[kind] ?? FRESHNESS_LABEL_FALLBACK;
}

// ============================================================
// B9.3 — "Signaux traités" section + ResolutionDialog
// ============================================================

/**
 * Collapsible "Signaux traités" rail. Shows every RESOLVED + IGNORED
 * signal with the reason (if any) and a "Réouvrir" button that DELETE-s
 * the resolution row. Collapsed by default — the section is
 * informational; the BA's primary focus is the active signals above.
 */
function TreatedSignalsSection({
  resolved,
  ignored,
  isOpen,
  onOpenChange,
  onReopen,
  isReopenInFlight,
}: {
  resolved: ResolvedSignalEntry[];
  ignored: ResolvedSignalEntry[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onReopen: (signalKey: string) => void;
  isReopenInFlight: boolean;
}) {
  // Merge + sort by most-recent-action (resolvedAt = the row's updatedAt).
  const all = [...resolved, ...ignored].sort(
    (a, b) => b.resolvedAt.getTime() - a.resolvedAt.getTime()
  );
  const total = all.length;
  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mx-1 mt-1 flex w-full items-center justify-between gap-2 px-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          aria-label={isOpen ? "Masquer les signaux traités" : "Afficher les signaux traités"}
        >
          <span className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Signaux traités
            <Badge variant="outline" className="border-slate-300 bg-white text-slate-600">
              {total}
            </Badge>
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 space-y-2">
          {all.map((entry) => (
            <TreatedSignalRow
              key={entry.signalKey}
              entry={entry}
              onReopen={onReopen}
              isReopenInFlight={isReopenInFlight}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TreatedSignalRow({
  entry,
  onReopen,
  isReopenInFlight,
}: {
  entry: ResolvedSignalEntry;
  onReopen: (signalKey: string) => void;
  isReopenInFlight: boolean;
}) {
  const actionLabel = entry.action === "RESOLVED" ? "Résolu" : "Ignoré";
  const actionClassName =
    entry.action === "RESOLVED"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : "border-slate-300 bg-slate-50 text-slate-700";
  const title = formatTreatedTitle(entry);
  return (
    <li className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5 text-sm">
      {entry.action === "RESOLVED" ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          <Badge variant="outline" className={actionClassName}>
            {actionLabel}
          </Badge>
        </div>
        {entry.reason ? (
          <p className="mt-1 text-xs italic text-muted-foreground">« {entry.reason} »</p>
        ) : null}
        <div className="mt-1.5 flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-[11px] text-muted-foreground hover:text-slate-700"
            onClick={() => onReopen(entry.signalKey)}
            disabled={isReopenInFlight}
            aria-label={`Réouvrir ${title}`}
          >
            <RotateCcw className="h-3 w-3" />
            Réouvrir
          </Button>
        </div>
      </div>
    </li>
  );
}

function formatTreatedTitle(entry: ResolvedSignalEntry): string {
  if (entry.kind === "contradiction") {
    const c = entry.contradiction;
    const yearLabel = c.year !== null ? ` ${c.year}` : " (non datée)";
    return `${formatSubject(c.subject)}${yearLabel}`;
  }
  if (entry.kind === "missing") {
    const baseLabel = missingLabel(entry.finding.kind);
    // The partition emits a single-doc copy of the finding for per-doc
    // resolutions — pick that doc id and look up the name.
    const docId = entry.documentId;
    if (docId && entry.finding.affectedDocumentIds.length === 1) {
      return baseLabel;
    }
    return baseLabel;
  }
  return `${freshnessLabel(entry.freshnessKind)} — ${entry.documentName}`;
}

/**
 * B9.3 — mark resolved / ignored dialog with an optional reason.
 * Single dialog instance, driven by the panel-level `resolutionDialog`
 * state. Closes on outside click + Esc + Cancel button + post-submit.
 *
 * Reason is OPTIONAL (CLAUDE.md positioning rule keeps things light):
 *   - For "RESOLVED" the dialog hints "ex. j'ai uploadé la cap table".
 *   - For "IGNORED" the dialog hints "ex. devise connue, déjà vérifiée".
 *
 * The dialog NEVER prescribes; it lets the BA explain in their own
 * words (or skip entirely).
 */
function ResolutionDialog({
  state,
  reason,
  onReasonChange,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  state: { signalKey: string; action: EvidenceSignalResolutionAction; label: string } | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const open = Boolean(state);
  const isResolved = state?.action === "RESOLVED";
  const title = isResolved ? "Marquer comme résolu" : "Ignorer ce signal";
  const description = isResolved
    ? "Indique que le problème sous-jacent a été traité (ex. cap table uploadée). Le signal disparaît de la liste active."
    : "Indique que ce signal est assumé et n'a pas besoin d'action. Il reste consultable dans « Signaux traités ».";
  const placeholder = isResolved
    ? "Raison (optionnel) — ex. j'ai uploadé la cap table datée"
    : "Raison (optionnel) — ex. devise connue, comparé hors-DD";
  const confirmLabel = isResolved ? "Marquer résolu" : "Ignorer";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* B12.5 P3 #12 — defensive max-h + internal scroll pattern,
          mirroring B12.2.a (DocumentMetadataDialog). The body here is
          naturally short (badge + textarea + footer), so no overflow
          was observed in B12.1.1 runtime tests. The fix is structural
          defense-in-depth: if a future change adds more fields or a
          longer label (e.g. multi-line state badge wrap), the dialog
          won't overflow the viewport — body scrolls internally and
          the Confirm/Annuler footer stays anchored. */}
      <DialogContent className="sm:max-w-md flex max-h-[85vh] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isResolved ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <EyeOff className="h-4 w-4 text-slate-500" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 px-6 py-4">
          {state ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700">
              {state.label}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="resolution-reason" className="text-xs text-muted-foreground">
              Raison (optionnel)
            </Label>
            <Textarea
              id="resolution-reason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder={placeholder}
              maxLength={1000}
              rows={3}
            />
            <p className="text-[11px] text-muted-foreground">{reason.length}/1000</p>
          </div>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-3">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Annuler
            </Button>
          </DialogClose>
          <Button type="button" onClick={onConfirm} disabled={isPending} className="gap-1">
            {isResolved ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
