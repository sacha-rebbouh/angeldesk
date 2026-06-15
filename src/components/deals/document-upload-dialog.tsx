"use client";

import { useCallback, useState, memo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCopy, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileUpload,
  type QueueSummary,
  type UploadAllSummary,
  type UploadedDocumentSummary,
} from "./file-upload";
import {
  EmailForm,
  UPLOAD_EMAIL_FORM_ID,
  type EmailFormState,
} from "./corpus/email-form";
import {
  NoteForm,
  UPLOAD_NOTE_FORM_ID,
  type NoteFormState,
} from "./corpus/note-form";
import { queryKeys } from "@/lib/query-keys";
import {
  createInstrumentationLog,
  createUploadSessionId,
  type InstrumentationLog,
} from "@/lib/upload-instrumentation";

interface DocumentUploadDialogProps {
  dealId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: (document?: UploadedDocumentSummary) => void;
}

// B4 — fresh, empty summary used when the file tab hasn't reported one
// yet (modal just opened) and as the post-close reset. Keeping it as a
// single source of truth avoids a partial object that would mis-label
// the footer button.
const EMPTY_QUEUE_SUMMARY: QueueSummary = {
  total: 0,
  completedCount: 0,
  errorCount: 0,
  cancelledCount: 0,
  inFlightCount: 0,
  validatingCount: 0,
  readyCount: 0,
  needsReselectCount: 0,
};

export const DocumentUploadDialog = memo(function DocumentUploadDialog({
  dealId,
  open,
  onOpenChange,
  onUploadSuccess,
}: DocumentUploadDialogProps) {
  const queryClient = useQueryClient();
  // Transparence crédits : si le deal a deja une these, ajouter un document (fichier/PDF)
  // declenche une re-extraction automatique facturee 1 credit (THESIS_REEXTRACT). On
  // verifie l'existence d'une these pour prevenir l'utilisateur au moment de l'upload.
  // (Les emails/notes en texte pur ne declenchent PAS de re-extraction → pas de toast.)
  const { data: dealHasThesis = false } = useQuery({
    queryKey: ["deal-thesis-exists", dealId],
    queryFn: async () => {
      const res = await fetch(`/api/deals/${dealId}/thesis`);
      if (!res.ok) return false;
      const json = await res.json();
      return Boolean(json?.data?.thesis);
    },
    enabled: open,
    staleTime: 30_000,
  });
  const [uploadedCount, setUploadedCount] = useState(0);
  const [hasUploaded, setHasUploaded] = useState(false);
  // B4 — live snapshot of the file tab's queue. Drives the footer summary
  // line + the smart close-button label. The dialog never reads the queue
  // directly; FileUpload pushes a fresh QueueSummary on every change.
  const [queueSummary, setQueueSummary] = useState<QueueSummary>(EMPTY_QUEUE_SUMMARY);
  // B4 — "Diagnostic copié" → reverts after 2s. Owned by the dialog now
  // since the button moved into the footer.
  const [diagnosticCopied, setDiagnosticCopied] = useState(false);
  // B12.2.b — active tab + per-tab submit state, so the dialog can
  // render a contextual submit button in the sticky footer for the
  // Email and Note tabs. Pre-B12.2.b the submit button lived at the
  // bottom of each form's scroll container — it was invisible on
  // 1366x768 / 390x844 / 900x600 without scrolling (P0 #1 + P0 #2).
  // The footer button uses HTML form-association (form="upload-email-form"
  // / form="upload-note-form") so the existing form-level submit logic
  // fires unchanged.
  const [activeTab, setActiveTab] = useState<"file" | "email" | "note">("file");
  const [emailFormState, setEmailFormState] = useState<EmailFormState>({
    canSubmit: false,
    isSubmitting: false,
    attachmentCount: 0,
  });
  const [noteFormState, setNoteFormState] = useState<NoteFormState>({
    canSubmit: false,
    isSubmitting: false,
    attachmentCount: 0,
  });
  // Phase B0 — one instrumentation log per modal open. Stable instance per
  // mount (useState lazy init — l'accès ref au render est interdit par
  // react-hooks/refs), reset (with a fresh sessionId) on subsequent opens so
  // diagnostics never cross-contaminate between sessions.
  const [instrumentation] = useState<InstrumentationLog>(() =>
    createInstrumentationLog(createUploadSessionId())
  );

  // B4 — reset the local UI counters on re-open (pattern « adjust state during
  // render », même déclencheur que l'ancien effect sur le front montant de
  // `open` ; au mount les compteurs sont déjà à leur valeur initiale).
  // queueSummary est re-émis par FileUpload dès son mount, pas besoin ici.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setUploadedCount(0);
      setHasUploaded(false);
      setDiagnosticCopied(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    instrumentation.reset(createUploadSessionId());
    instrumentation.record({ event: "modal_opened" });
  }, [open, instrumentation]);

  const handleUploadComplete = useCallback((document: UploadedDocumentSummary) => {
    setUploadedCount((prev) => prev + 1);
    setHasUploaded(true);
    onUploadSuccess?.(document);
  }, [onUploadSuccess]);

  const handleUploadQueued = useCallback((document: UploadedDocumentSummary) => {
    setHasUploaded(true);
    onUploadSuccess?.(document);
  }, [onUploadSuccess]);

  const handleTextCreated = useCallback((document: UploadedDocumentSummary) => {
    setUploadedCount((prev) => prev + 1);
    setHasUploaded(true);
    toast.success("Pièce ajoutée au corpus");
    onUploadSuccess?.(document);
    queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
    // B9.4 — invalidate the evidence-health bundle directly so the
    // panel updates even when the dialog is mounted OUTSIDE the
    // documents-tab (e.g. from the corpus-control panel's "Ajouter
    // une cap table" action). Pre-B9.4 the panel relied on the
    // documents-tab polling, which is only live when that tab is
    // mounted — fragile cross-tab. Invalidating here keeps every
    // consumer covered defensively. Idempotent: a second invalidate
    // on the same key is a no-op.
    queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
  }, [dealId, onUploadSuccess, queryClient]);

  const handleAllComplete = useCallback((summary: UploadAllSummary) => {
    // If every upload failed (or was cancelled), keep the dialog open and
    // surface the error state — never claim success and never auto-close.
    // The per-file error toast was already raised via handleError.
    if (summary.successCount === 0) {
      return;
    }

    // Phase B2.3 — cancelled is neither success nor failure. Surface it
    // explicitly so the user doesn't read "X en échec" for a file they
    // deliberately cancelled.
    const cancelSuffix =
      summary.cancelledCount > 0
        ? `, ${summary.cancelledCount} annulé${summary.cancelledCount > 1 ? "s" : ""}`
        : "";
    if (summary.errorCount > 0) {
      toast.success(
        `${summary.successCount} document${summary.successCount > 1 ? "s" : ""} ajouté${
          summary.successCount > 1 ? "s" : ""
        }, ${summary.errorCount} en échec${cancelSuffix}`
      );
    } else if (summary.cancelledCount > 0) {
      toast.success(
        `${summary.successCount} document${summary.successCount > 1 ? "s" : ""} ajouté${
          summary.successCount > 1 ? "s" : ""
        }${cancelSuffix}`
      );
    } else {
      toast.success("Documents uploadés avec succès");
    }

    // Transparence crédits : un document ajouté à un deal qui a déjà une thèse
    // déclenche une re-extraction automatique facturée 1 crédit. On le signale au
    // moment de l'upload (le banner de révision le confirmera ensuite avec le diff).
    if (dealHasThesis) {
      toast("Thèse en cours de mise à jour", {
        description: "Ce document déclenche une re-extraction de la thèse — 1 crédit facturé une fois l'extraction terminée.",
      });
    }

    // B4 — only auto-close when the batch is FULLY terminal AND clean (no
    // errors, no extracting). Previously the modal auto-closed 500ms
    // after the first batch success, even if extractions for OTHER files
    // were still in flight or some files had failed. That hid in-progress
    // state from the user.
    //
    // The auto-close trigger is now driven by the queueSummary effect below
    // (after the user can see the final state for a moment). Here we only
    // invalidate the deal so the documents tab refreshes with the new rows.
    queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
    // B9.4 — see handleTextCreated for the rationale (defensive
    // evidence-health invalidation, works regardless of consumer).
    queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
  }, [queryClient, dealId, dealHasThesis]);

  const handleError = useCallback((error: string) => {
    toast.error(error);
  }, []);

  /**
   * Phase B2.4.1 P2 — duplicate row's "Voir le document existant" action.
   * The file-upload row exposes the existing doc id/name; the dialog's job
   * is to make sure the user can actually see it. We:
   *   1. Toast the doc name so the cue is immediate.
   *   2. Invalidate the deal detail query so the Documents tab refreshes
   *      with the existing doc highlighted (the deal-page polling already
   *      surfaces it; without invalidation a stale list could hide it).
   * Closing the modal is a parent concern — we don't force it so the user
   * can keep working on other queued uploads.
   */
  const handleViewExistingDocument = useCallback(
    (doc: { documentId: string; documentName: string }) => {
      toast.success(`Document déjà présent : ${doc.documentName}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      // B9.4 — defensive evidence-health refetch (the duplicate doc
      // might be in a state that affects the bundle, e.g. its
      // freshness has shifted since the user last saw the panel).
      queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
    },
    [dealId, queryClient]
  );

  const handleClose = useCallback(() => {
    if (hasUploaded) {
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      // B9.4 — refire the evidence-health bundle so the panel reflects
      // any signal that finished extracting in the background between
      // the upload and the close. The polling effect in the docs-tab
      // would also catch it, but it's only live when that tab is
      // mounted — the corpus-control panel sits on a different tab.
      queryClient.invalidateQueries({ queryKey: queryKeys.evidenceHealth.byDeal(dealId) });
    }
    setUploadedCount(0);
    setHasUploaded(false);
    setQueueSummary(EMPTY_QUEUE_SUMMARY);
    setDiagnosticCopied(false);
    onOpenChange(false);
  }, [hasUploaded, queryClient, dealId, onOpenChange]);

  /**
   * B4 — "Copier diagnostic" handler. Moved into the dialog so the button
   * lives in the sticky footer (always visible) instead of inside the
   * scrollable file-upload region. The instrumentation log is owned by
   * the dialog (instrumentationRef) so this is a relocation, not a wire
   * change — the diagnostic chain stays end-to-end identical.
   */
  const handleCopyDiagnostic = useCallback(async () => {
    try {
      const diag = instrumentation.redactedDiagnostic();
      await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      setDiagnosticCopied(true);
      setTimeout(() => setDiagnosticCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier le diagnostic");
    }
  }, [instrumentation]);

  // B4 — derive the smart close-button label. Order matters: "in-flight"
  // always beats "uploaded" so a half-extracted batch can't show
  // "Terminé". This is the spec's hard rule.
  const closeButtonLabel = (() => {
    const { inFlightCount, validatingCount, errorCount, completedCount } = queueSummary;
    // Anything still moving (uploading, extracting, validating) MUST NOT
    // surface as "Terminé" — the spec's hard rule. "Fermer" is the
    // honest label: the user can still leave but is told nothing is over.
    if (inFlightCount > 0 || validatingCount > 0) return "Fermer";
    if (errorCount > 0) return "Fermer";
    if (hasUploaded || completedCount > 0) return "Terminé";
    return "Annuler";
  })();
  const closeButtonAriaLabel = (() => {
    if (queueSummary.inFlightCount > 0) {
      return `Fermer la fenêtre (${queueSummary.inFlightCount} upload${queueSummary.inFlightCount > 1 ? "s" : ""} en cours côté serveur)`;
    }
    if (queueSummary.errorCount > 0) {
      return `Fermer la fenêtre (${queueSummary.errorCount} fichier${queueSummary.errorCount > 1 ? "s" : ""} en échec)`;
    }
    return undefined;
  })();

  // B4 — footer summary line. Counts come straight from the queueSummary
  // emitted by FileUpload; the dialog never re-derives from queue state
  // (single source of truth). Only the file tab populates this — email/
  // note tabs leave the counters at 0 so the footer stays minimal.
  const footerSummary = (() => {
    const parts: string[] = [];
    if (queueSummary.completedCount > 0) {
      parts.push(`${queueSummary.completedCount} ajouté${queueSummary.completedCount > 1 ? "s" : ""}`);
    }
    if (queueSummary.inFlightCount > 0) {
      parts.push(`${queueSummary.inFlightCount} en cours`);
    }
    if (queueSummary.errorCount > 0) {
      parts.push(`${queueSummary.errorCount} en échec`);
    }
    if (queueSummary.cancelledCount > 0) {
      parts.push(`${queueSummary.cancelledCount} annulé${queueSummary.cancelledCount > 1 ? "s" : ""}`);
    }
    if (parts.length === 0 && hasUploaded && uploadedCount > 0) {
      // Email/note tab path — no queueSummary, but at least one doc was
      // created. Keep the legacy line so the user still sees feedback.
      return `${uploadedCount} pièce${uploadedCount > 1 ? "s" : ""} ajoutée${uploadedCount > 1 ? "s" : ""}`;
    }
    return parts.join(" · ");
  })();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/* B4 — wider modal (2xl) so a 6+ file queue stays lisible without
          horizontal compression of the per-row action cluster. Height
          cap unchanged (85vh) so the modal doesn't overflow on a 14"
          laptop. flex-col + scrollable middle is preserved so the footer
          stays sticky at the bottom of the modal. */}
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Ajouter au corpus</DialogTitle>
          <DialogDescription>
            Ajoutez un fichier, un email ou une note de call. La chronologie du
            corpus utilise la date réelle de la pièce quand elle est fournie.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "file" | "email" | "note")}
            className="space-y-4"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="file">Fichier</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="note">Note</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="mt-0">
              <FileUpload
                dealId={dealId}
                onUploadQueued={handleUploadQueued}
                onUploadComplete={handleUploadComplete}
                onAllComplete={handleAllComplete}
                onError={handleError}
                instrumentation={instrumentation}
                onViewExistingDocument={handleViewExistingDocument}
                onQueueSummaryChange={setQueueSummary}
              />
            </TabsContent>
            <TabsContent value="email" className="mt-0">
              <EmailForm
                dealId={dealId}
                onCreated={handleTextCreated}
                onError={handleError}
                onStateChange={setEmailFormState}
              />
            </TabsContent>
            <TabsContent value="note" className="mt-0">
              <NoteForm
                dealId={dealId}
                onCreated={handleTextCreated}
                onError={handleError}
                onStateChange={setNoteFormState}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* B4 — sticky footer. shrink-0 + border-t keep it visually
            anchored at the bottom of the dialog, never scrolled past.
            Three zones (left → right): diagnostic action, summary line,
            close action. Codex round B0/B1 P1 contract ("diagnostic
            always available, no queue gate") is preserved by rendering
            the button unconditionally here — independent of any queue
            state. */}
        <div className="shrink-0 border-t px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopyDiagnostic}
            className="gap-1 text-xs text-muted-foreground"
            aria-label="Copier le diagnostic d'upload (pour ticket support)"
          >
            <ClipboardCopy className="h-3 w-3" />
            {diagnosticCopied ? "Diagnostic copié" : "Copier diagnostic"}
          </Button>

          {footerSummary && (
            <p
              className="flex-1 min-w-0 truncate text-center text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
              title={footerSummary}
            >
              {footerSummary}
            </p>
          )}

          {/* B12.2.b — contextual submit for the Email tab. Lives in
              the sticky footer instead of inside the scroll container
              (P0 #1). HTML form-association: type="submit"
              form="upload-email-form" triggers the EmailForm's onSubmit
              even though the button sits outside the <form>. The
              disabled state + label suffix mirror the legacy in-form
              button (state surfaced via EmailForm's onStateChange). */}
          {activeTab === "email" && (
            <Button
              type="submit"
              form={UPLOAD_EMAIL_FORM_ID}
              disabled={!emailFormState.canSubmit}
              aria-label="Ajouter l'email au corpus"
            >
              {emailFormState.isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Ajouter l&apos;email
              {emailFormState.attachmentCount > 0
                ? ` et ${emailFormState.attachmentCount} fichier${emailFormState.attachmentCount > 1 ? "s" : ""}`
                : ""}
              {" "}au corpus
            </Button>
          )}

          {/* B12.2.b — same pattern for Note tab (P0 #2). */}
          {activeTab === "note" && (
            <Button
              type="submit"
              form={UPLOAD_NOTE_FORM_ID}
              disabled={!noteFormState.canSubmit}
              aria-label="Ajouter la note au corpus"
            >
              {noteFormState.isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Ajouter la note
              {noteFormState.attachmentCount > 0
                ? ` et ${noteFormState.attachmentCount} fichier${noteFormState.attachmentCount > 1 ? "s" : ""}`
                : ""}
              {" "}au corpus
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            aria-label={closeButtonAriaLabel}
          >
            {closeButtonLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});
