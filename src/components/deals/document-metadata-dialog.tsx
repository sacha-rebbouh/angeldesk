"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ListTree, Loader2, Pencil } from "lucide-react";
import { DocumentSourceKind, DocumentType } from "@prisma/client";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { clerkFetch } from "@/lib/clerk-fetch";
import { queryKeys } from "@/lib/query-keys";

/**
 * Phase B6.x — Metadata Editor.
 *
 *   B6.1 (sourceDate) — landed first.
 *   B6.2 (type / sourceKind) — landed here, same modal, additive.
 *   B6.3 (email metadata) — will extend the same modal later.
 *
 * The dialog stays a single surface so the user has ONE entry-point
 * for "fix this document's metadata" — the B6.2 spec explicitly asks
 * not to refactor the modal. We add two selects (type, sourceKind)
 * to the existing form; the submit logic computes a delta vs the
 * initial values and only sends fields the user actually changed.
 *
 * Backfill / extractor protection :
 *   - sourceDate: existing gates in promote-source-date.ts +
 *     email-source-inference.ts already enforce "do not overwrite if
 *     non-null" (B6.1 anti-regression guards).
 *   - type / sourceKind: a manual override lands in
 *     sourceMetadata.manual.documentType / .sourceKind with a full
 *     audit trail. The extractor / backfill paths SHOULD consult this
 *     before overwriting — that's tracked as a follow-up. For B6.2,
 *     a re-extraction won't auto-rewrite these columns unless a
 *     specific extractor wrote them in the first place (none of the
 *     current write paths in extraction-pipeline.ts touch
 *     Document.type once it's set).
 */

interface DocumentMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    dealId: string;
    name: string;
    sourceDate: string | Date | null;
    // B6.2 — current type + sourceKind so the dropdowns pre-fill with
    // the row's actual state. Optional for backward-compat with
    // callers built before B6.2.
    type?: DocumentType | null;
    sourceKind?: DocumentSourceKind | null;
    // B6.3 — email metadata for pre-fill. All optional so non-email
    // callers don't have to plumb fields that are typically null
    // for FILE / NOTE docs. The dialog always renders the three
    // inputs (an email-classified FILE doc is a legitimate user
    // override path; the fields are useful annotations either way).
    receivedAt?: string | Date | null;
    sourceAuthor?: string | null;
    sourceSubject?: string | null;
  } | null;
  /**
   * Fired after a successful mutation so the parent can refresh its
   * local state (e.g. the audit dialog's `audit` query, the documents
   * tab's row data). The mutation already invalidates the deal-detail
   * + evidenceHealth queries — this callback is for parent-local
   * cache (the audit query is keyed differently).
   */
  onMetadataUpdated?: (documentId: string) => void;
}

/**
 * Display labels for the metadata editor's enum dropdowns. Kept local
 * so this dialog stays self-contained (vs importing from
 * file-upload.tsx which is upload-flow-specific + missing
 * CALL_TRANSCRIPT). French labels match the rest of the app.
 */
const DOCUMENT_TYPE_OPTIONS: readonly { value: DocumentType; label: string }[] = [
  { value: "PITCH_DECK", label: "Pitch Deck" },
  { value: "FINANCIAL_MODEL", label: "Financial Model" },
  { value: "CAP_TABLE", label: "Cap Table" },
  { value: "TERM_SHEET", label: "Term Sheet" },
  { value: "INVESTOR_MEMO", label: "Investor Memo" },
  { value: "FINANCIAL_STATEMENTS", label: "États financiers" },
  { value: "LEGAL_DOCS", label: "Docs juridiques" },
  { value: "MARKET_STUDY", label: "Étude de marché" },
  { value: "PRODUCT_DEMO", label: "Démo produit" },
  { value: "CALL_TRANSCRIPT", label: "Transcript d'appel" },
  { value: "OTHER", label: "Autre" },
];

const SOURCE_KIND_OPTIONS: readonly { value: DocumentSourceKind; label: string }[] = [
  { value: "FILE", label: "Fichier" },
  { value: "EMAIL", label: "Email" },
  { value: "NOTE", label: "Note" },
];

/**
 * Convert an ISO date OR null into the `YYYY-MM-DD` shape expected by
 * `<input type="date">`. Returns empty string for null so the input is
 * controlled-empty (vs uncontrolled).
 */
function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // toISOString returns UTC; we want the date-only part in UTC so the
  // user's "March 14, 2026" doesn't shift by a day on certain
  // timezones. The server stores Date which is timezone-agnostic.
  return date.toISOString().slice(0, 10);
}

/**
 * Body shape sent to PATCH /api/documents/[id]/metadata. Each field
 * is optional independently; the client only includes fields the user
 * actually changed (delta-aware). B6.3 adds the three email fields —
 * receivedAt mirrors sourceDate (ISO string), sourceAuthor and
 * sourceSubject accept null to explicitly clear.
 */
interface MetadataPatchBody {
  sourceDate?: string;
  type?: DocumentType;
  sourceKind?: DocumentSourceKind;
  receivedAt?: string | null;
  sourceAuthor?: string | null;
  sourceSubject?: string | null;
}

/**
 * B7.3 — wire format of the email-candidates endpoint
 * (GET /api/documents/[id]/email-candidates). Kept in sync with the
 * route handler. The picker below fetches via TanStack Query and
 * renders one button per candidate. Picking writes the chosen
 * `sentAt` as `sourceDate` through the existing PATCH /metadata
 * (B6.1) — no new write surface.
 */
interface EmailCandidate {
  from: string | null;
  sentAt: string;
  subject: string | null;
  isPrimary: boolean;
}
interface EmailCandidatesPayload {
  data: {
    documentId: string;
    sourceKind: "FILE" | "EMAIL" | "NOTE";
    currentSourceDate: string | null;
    inferredConfidence: "high" | "medium" | null;
    inferredFrom: string | null;
    candidates: EmailCandidate[];
    hasManualOverride: boolean;
  };
}

async function fetchEmailCandidates(documentId: string): Promise<EmailCandidatesPayload> {
  const response = await clerkFetch(`/api/documents/${documentId}/email-candidates`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Email candidates HTTP ${response.status}`);
  }
  return response.json() as Promise<EmailCandidatesPayload>;
}

function formatCandidateSentAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * B7.3 — Picker UX for thread email dates. Shows every detected
 * candidate with a "Utiliser cette date" button. Clicking pre-fills
 * the sourceDate input in the parent form (the user still has to
 * Save to commit). The primary candidate is highlighted.
 *
 * Rendered ONLY when the doc has detected candidates (the endpoint
 * returns []) AND the dialog is open — gated below.
 */
function EmailCandidatesPicker({
  documentId,
  enabled,
  onPick,
}: {
  documentId: string;
  enabled: boolean;
  onPick: (sentAt: string) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.documentEmailCandidates.byDocument(documentId),
    queryFn: () => fetchEmailCandidates(documentId),
    enabled: enabled && Boolean(documentId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Chargement des candidates…
      </div>
    );
  }
  if (error || !data) return null;
  const { candidates, inferredConfidence, hasManualOverride } = data.data;
  if (candidates.length === 0) return null;

  return (
    <section className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <ListTree className="h-3 w-3" aria-hidden="true" />
          Dates détectées dans le thread
          <span className="text-xs font-normal normal-case text-muted-foreground">
            ({candidates.length})
          </span>
        </h3>
        {inferredConfidence && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
            title="Confiance de l'inférence automatique"
            style={{
              backgroundColor:
                inferredConfidence === "high" ? "rgb(220 252 231)" : "rgb(254 243 199)",
              color: inferredConfidence === "high" ? "rgb(22 101 52)" : "rgb(146 64 14)",
            }}
          >
            {inferredConfidence === "high" ? "Confiance haute" : "Confiance moyenne"}
          </span>
        )}
        {hasManualOverride && (
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-800">
            Override manuel actif
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Le thread contient {candidates.length} message{candidates.length > 1 ? "s" : ""}.
        Cliquez pour pré-remplir le champ « Date du document » ci-dessus avec une des dates
        détectées (vous validez ensuite avec « Enregistrer »).
      </p>
      <ul className="space-y-1.5">
        {candidates.map((candidate) => (
          <li
            key={`${candidate.sentAt}-${candidate.from ?? "anon"}`}
            className={`flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs ${
              candidate.isPrimary ? "border-emerald-300 bg-emerald-50" : "border-muted bg-background"
            }`}
          >
            {candidate.isPrimary && (
              <CheckCircle2
                className="h-3 w-3 shrink-0 text-emerald-700"
                aria-label="Date actuelle"
              />
            )}
            <span className="font-medium" title={candidate.from ?? "Expéditeur inconnu"}>
              {formatCandidateSentAt(candidate.sentAt)}
            </span>
            {candidate.from && (
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={candidate.from}>
                {candidate.from}
              </span>
            )}
            {candidate.subject && (
              <span className="hidden truncate text-muted-foreground sm:inline sm:flex-1" title={candidate.subject}>
                {candidate.subject}
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant={candidate.isPrimary ? "outline" : "default"}
              disabled={candidate.isPrimary}
              aria-label={`Utiliser ${formatCandidateSentAt(candidate.sentAt)} comme date du document`}
              onClick={() => onPick(candidate.sentAt)}
            >
              {candidate.isPrimary ? "Actuel" : "Utiliser cette date"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const DocumentMetadataDialog = memo(function DocumentMetadataDialog({
  open,
  onOpenChange,
  document,
  onMetadataUpdated,
}: DocumentMetadataDialogProps) {
  const queryClient = useQueryClient();
  const [sourceDateInput, setSourceDateInput] = useState<string>("");
  const [typeInput, setTypeInput] = useState<DocumentType | "">("");
  const [sourceKindInput, setSourceKindInput] = useState<DocumentSourceKind | "">("");
  // B6.3 — email metadata inputs. Each is controlled, pre-filled
  // from `document.*` on open, and contributes to the delta.
  const [receivedAtInput, setReceivedAtInput] = useState<string>("");
  const [sourceAuthorInput, setSourceAuthorInput] = useState<string>("");
  const [sourceSubjectInput, setSourceSubjectInput] = useState<string>("");
  const [serverError, setServerError] = useState<string | null>(null);

  // B6.2 → B6.3 — seed all six inputs when the dialog opens for a
  // given doc. Resets on close so a reopen on a different doc
  // doesn't show the stale values from the previous one.
  // Pattern « adjust state during render » (mêmes déclencheurs que l'ancien effect
  // [open, document], à l'identité d'objet près) — remplace le setState-dans-effect
  // interdit par react-hooks/set-state-in-effect.
  const [prevSeed, setPrevSeed] = useState<{ open: boolean; document: typeof document } | null>(null);
  if (prevSeed === null || prevSeed.open !== open || prevSeed.document !== document) {
    setPrevSeed({ open, document });
    if (open && document) {
      setSourceDateInput(toDateInputValue(document.sourceDate));
      setTypeInput(document.type ?? "");
      setSourceKindInput(document.sourceKind ?? "");
      setReceivedAtInput(toDateInputValue(document.receivedAt));
      setSourceAuthorInput(document.sourceAuthor ?? "");
      setSourceSubjectInput(document.sourceSubject ?? "");
      setServerError(null);
    } else if (!open) {
      setSourceDateInput("");
      setTypeInput("");
      setSourceKindInput("");
      setReceivedAtInput("");
      setSourceAuthorInput("");
      setSourceSubjectInput("");
      setServerError(null);
    }
  }

  // B6.2 → B6.3 — delta detection. Submit is enabled only when AT
  // LEAST ONE field differs from the initial values. Prevents
  // accidental submission of unchanged state (which the server would
  // reject as "no fields provided" anyway — failing fast on the
  // client is nicer).
  const initialSourceDate = document ? toDateInputValue(document.sourceDate) : "";
  const initialType = document?.type ?? "";
  const initialSourceKind = document?.sourceKind ?? "";
  const initialReceivedAt = document ? toDateInputValue(document.receivedAt) : "";
  const initialSourceAuthor = document?.sourceAuthor ?? "";
  const initialSourceSubject = document?.sourceSubject ?? "";
  const hasChanges = useMemo(() => {
    return (
      sourceDateInput !== initialSourceDate ||
      typeInput !== initialType ||
      sourceKindInput !== initialSourceKind ||
      receivedAtInput !== initialReceivedAt ||
      sourceAuthorInput !== initialSourceAuthor ||
      sourceSubjectInput !== initialSourceSubject
    );
  }, [
    sourceDateInput,
    typeInput,
    sourceKindInput,
    receivedAtInput,
    sourceAuthorInput,
    sourceSubjectInput,
    initialSourceDate,
    initialType,
    initialSourceKind,
    initialReceivedAt,
    initialSourceAuthor,
    initialSourceSubject,
  ]);

  const mutation = useMutation({
    mutationFn: async ({
      documentId,
      body,
    }: {
      documentId: string;
      body: MetadataPatchBody;
    }) => {
      const response = await clerkFetch(`/api/documents/${documentId}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorBody.error ?? `Metadata update HTTP ${response.status}`);
      }
      return response.json() as Promise<{ data: { id: string } }>;
    },
    onSuccess: (_payload, variables) => {
      if (!document) return;
      // Invalidate the deal detail (Documents tab list) so the row
      // picks up the new sourceDate / type / sourceKind immediately.
      // Granular keys per CLAUDE.md.
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(document.dealId) });
      // Evidence Health depends on sourceDate AND type (a doc
      // re-classified from OTHER to PITCH_DECK may resolve / create
      // missing-date signals). Invalidate so the panel re-fetches and
      // the warnings reflect the new classification without a manual
      // refresh.
      queryClient.invalidateQueries({
        queryKey: queryKeys.evidenceHealth.byDeal(document.dealId),
      });
      // B7.1 fix-up (Codex P2) — also invalidate the
      // ATTACHMENT_RELATION panel. A B6.x metadata edit that
      // changes sourceKind / sourceDate / type triggers the
      // Evidence recompute on the server (and possibly the
      // outbound cleanup for EMAIL → non-EMAIL or sourceDate
      // change on EMAIL). The panel's staleTime of 60s would
      // otherwise show the OLD relations until the user
      // navigated away. Granular per-document invalidation —
      // CLAUDE.md rule.
      queryClient.invalidateQueries({
        queryKey: queryKeys.documentAttachments.byDocument(variables.documentId),
      });
      // B7.3 — also invalidate the email-candidates picker. A
      // metadata patch that changes sourceDate flips which
      // candidate is `isPrimary`; without invalidation the
      // picker would show the OLD "Actuel" highlight until
      // staleTime expired.
      queryClient.invalidateQueries({
        queryKey: queryKeys.documentEmailCandidates.byDocument(variables.documentId),
      });
      onMetadataUpdated?.(variables.documentId);
      toast.success("Métadonnées du document mises à jour");
      onOpenChange(false);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Impossible de mettre à jour les métadonnées";
      setServerError(message);
      toast.error(message);
    },
  });

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (!document) return;
      if (!hasChanges) {
        // Defense in depth — button is also disabled but a keyboard
        // submit could try anyway.
        setServerError("Aucune modification à enregistrer.");
        return;
      }
      const body: MetadataPatchBody = {};
      if (sourceDateInput !== initialSourceDate) {
        if (!sourceDateInput) {
          setServerError("La date est requise.");
          return;
        }
        const parsed = new Date(sourceDateInput);
        if (Number.isNaN(parsed.getTime())) {
          setServerError("Date invalide.");
          return;
        }
        body.sourceDate = sourceDateInput;
      }
      if (typeInput !== initialType && typeInput !== "") {
        body.type = typeInput;
      }
      if (sourceKindInput !== initialSourceKind && sourceKindInput !== "") {
        body.sourceKind = sourceKindInput;
      }
      // B6.3 — email metadata delta. Empty string means "clear"
      // (send null); non-empty means "set". Date validates the same
      // way as sourceDate.
      if (receivedAtInput !== initialReceivedAt) {
        if (receivedAtInput === "") {
          body.receivedAt = null;
        } else {
          const parsedReceived = new Date(receivedAtInput);
          if (Number.isNaN(parsedReceived.getTime())) {
            setServerError("Date de réception invalide.");
            return;
          }
          body.receivedAt = receivedAtInput;
        }
      }
      if (sourceAuthorInput !== initialSourceAuthor) {
        body.sourceAuthor =
          sourceAuthorInput.trim() === "" ? null : sourceAuthorInput.trim();
      }
      if (sourceSubjectInput !== initialSourceSubject) {
        body.sourceSubject =
          sourceSubjectInput.trim() === "" ? null : sourceSubjectInput.trim();
      }
      mutation.mutate({
        documentId: document.id,
        body,
      });
    },
    [
      document,
      hasChanges,
      sourceDateInput,
      typeInput,
      sourceKindInput,
      receivedAtInput,
      sourceAuthorInput,
      sourceSubjectInput,
      initialSourceDate,
      initialType,
      initialSourceKind,
      initialReceivedAt,
      initialSourceAuthor,
      initialSourceSubject,
      mutation,
    ]
  );

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* B12.2.a — apply the internal standard pattern from
          DocumentUploadDialog: `max-h-[85vh] + flex flex-col + gap-0 p-0`
          on the DialogContent + a `flex-1 overflow-y-auto min-h-0` body
          + a `shrink-0 border-t` footer. Without this, the dialog grew
          to its natural ~827px height and overflowed any viewport
          shorter than that (P0 #3: Save invisible on 900x600, partially
          truncated on 1366x768). Header and footer stay fixed; only
          the form fields scroll. Radix's ESC/focus trap is preserved
          by keeping the Dialog/DialogContent/DialogClose structure
          untouched. */}
      <DialogContent className="sm:max-w-md flex max-h-[85vh] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-6 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            {/* B12.3 P1 #4 — icon synchronised with the audit-header
                button that triggers this dialog (Pencil = edit). The
                previous CalendarDays under-sold what the dialog edits
                (date + type + sourceKind, not just date). The visual
                cue contract — button icon === dialog title icon —
                stays in place, just with Pencil instead. */}
            <Pencil className="h-5 w-5" />
            Modifier les métadonnées
          </DialogTitle>
          <DialogDescription>
            Corrigez la date, le type ou la nature de ce document. Ces saisies remplacent
            toute valeur détectée automatiquement et ne sont plus écrasées par les
            extracteurs.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 px-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="metadata-source-date">Date du document</Label>
            <Input
              id="metadata-source-date"
              type="date"
              value={sourceDateInput}
              onChange={(event) => {
                setSourceDateInput(event.target.value);
                setServerError(null);
              }}
              disabled={mutation.isPending}
              max={toDateInputValue(new Date())}
              aria-describedby="metadata-source-date-help"
            />
            <p id="metadata-source-date-help" className="text-xs text-muted-foreground">
              Format JJ/MM/AAAA. Laissez vide pour conserver la date actuelle.
            </p>
          </div>

          {/* B6.2 — Type select. Pre-filled with the document's current
              type when known; user picks any of the 11 enum values. */}
          <div className="space-y-2">
            <Label htmlFor="metadata-type">Type de document</Label>
            <Select
              value={typeInput}
              onValueChange={(value) => {
                setTypeInput(value as DocumentType);
                setServerError(null);
              }}
              disabled={mutation.isPending}
            >
              <SelectTrigger id="metadata-type" aria-label="Type de document">
                <SelectValue placeholder="Choisir un type…" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Changer le type peut résoudre ou créer des signaux Evidence Health.
            </p>
          </div>

          {/* B6.2 — Source kind select. FILE / EMAIL / NOTE — the
              three first-class corpus piece kinds. Re-classifying a
              FILE to EMAIL surfaces the email-specific Evidence Health
              checks (sent date, attachments). */}
          <div className="space-y-2">
            <Label htmlFor="metadata-source-kind">Nature</Label>
            <Select
              value={sourceKindInput}
              onValueChange={(value) => {
                setSourceKindInput(value as DocumentSourceKind);
                setServerError(null);
              }}
              disabled={mutation.isPending}
            >
              <SelectTrigger id="metadata-source-kind" aria-label="Nature du document">
                <SelectValue placeholder="Choisir une nature…" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Fichier classique, email collé, ou note de call / RDV.
            </p>
          </div>

          {/* B6.3 — email metadata section. Always rendered (a FILE
              doc can be promoted to EMAIL via the sourceKind select
              above; the fields are also useful annotations on FILE /
              NOTE docs). Visually grouped with a divider so the user
              sees "email-specific" at a glance. */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Métadonnées email
            </p>

            <div className="space-y-2">
              <Label htmlFor="metadata-received-at">Date de réception</Label>
              <Input
                id="metadata-received-at"
                type="date"
                value={receivedAtInput}
                onChange={(event) => {
                  setReceivedAtInput(event.target.value);
                  setServerError(null);
                }}
                disabled={mutation.isPending}
                max={toDateInputValue(new Date())}
                aria-describedby="metadata-received-at-help"
              />
              <p id="metadata-received-at-help" className="text-xs text-muted-foreground">
                Date à laquelle l&apos;email a été reçu (différent de la date d&apos;envoi).
                Laissez vide pour effacer.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="metadata-source-author">Expéditeur</Label>
              <Input
                id="metadata-source-author"
                type="text"
                value={sourceAuthorInput}
                onChange={(event) => {
                  setSourceAuthorInput(event.target.value);
                  setServerError(null);
                }}
                disabled={mutation.isPending}
                maxLength={500}
                placeholder="Ex : Jean CFO <jean@acme.com>"
                aria-describedby="metadata-source-author-help"
              />
              <p id="metadata-source-author-help" className="text-xs text-muted-foreground">
                Nom + adresse de l&apos;expéditeur de l&apos;email (ou auteur de la note).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="metadata-source-subject">Objet</Label>
              <Input
                id="metadata-source-subject"
                type="text"
                value={sourceSubjectInput}
                onChange={(event) => {
                  setSourceSubjectInput(event.target.value);
                  setServerError(null);
                }}
                disabled={mutation.isPending}
                maxLength={500}
                placeholder="Ex : Suivi churn Q1"
                aria-describedby="metadata-source-subject-help"
              />
              <p id="metadata-source-subject-help" className="text-xs text-muted-foreground">
                Sujet de l&apos;email ou titre de la note.
              </p>
            </div>

            {/* B7.3 — date candidates picker. Renders only when
                the doc has detected thread messages (the picker
                returns null on empty list). Picking a candidate
                pre-fills `sourceDateInput` in this same form;
                the user still has to click "Enregistrer" to
                commit (so they can review + submit alongside
                other field changes). */}
            <EmailCandidatesPicker
              documentId={document.id}
              enabled={open}
              onPick={(sentAt) => {
                setSourceDateInput(toDateInputValue(sentAt));
                setServerError(null);
              }}
            />
          </div>

          {serverError && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </p>
          )}
          </div>

          {/* B12.2.a — sticky footer. `shrink-0 + border-t` keeps it
              visually anchored to the bottom of the dialog even when
              the body scrolls. Save button stays accessible on every
              supported viewport (1366x768, 900x600, 390x844). */}
          <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-3 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={mutation.isPending}>
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" disabled={mutation.isPending || !hasChanges}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mise à jour…
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
});
